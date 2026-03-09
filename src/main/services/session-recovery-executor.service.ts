import { BrowserWindow } from 'electron'
import { DatabaseService } from './database'
import { EVENT_CHANNELS } from '@/shared/ipc-channels'
import {
  applyRecoveryTrackingMetadata,
  createRecoveryTrackingMetadata,
  type RecoveryTrackingMetadata,
  type ResumeReason
} from '@/shared/recovery-contract'

type RecoveryStepType =
  | 'load_messages'
  | 'restore_tasks'
  | 'rebuild_context'
  | 'resume_task'
  | 'notify_user'

type SessionRecoveryCheckpoint = {
  pendingTasks: string[]
  inProgressTasks: string[]
  completedTasks: string[]
}

type SessionRecoveryPlan = {
  steps: Array<{
    order: number
    type: RecoveryStepType
    description: string
    taskId?: string
  }>
  checkpoint: SessionRecoveryCheckpoint
}

type SessionRecoveryCallbacks = {
  onContextRebuilt?: (context: {
    recentTopics: string[]
    conversationSummary: string
  }) => Promise<void>
}

type RecoveryMessageEventMode = 'none' | 'progress' | 'recovered'

export type RecoveredSessionMessage = {
  id: string
  sessionId: string
  role: string
  content: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

type RecoveryMessageRecord = {
  id: string
  sessionId: string
  role: string
  content: string
  metadata: unknown
  createdAt: Date
}

export class SessionRecoveryExecutorService {
  private static instance: SessionRecoveryExecutorService | null = null

  private constructor() {}

  static getInstance(): SessionRecoveryExecutorService {
    if (!SessionRecoveryExecutorService.instance) {
      SessionRecoveryExecutorService.instance = new SessionRecoveryExecutorService()
    }
    return SessionRecoveryExecutorService.instance
  }

  async executePlan(
    sessionId: string,
    plan: SessionRecoveryPlan,
    callbacks: SessionRecoveryCallbacks = {}
  ): Promise<void> {
    for (const step of plan.steps) {
      console.log(`[SessionRecoveryExecutor] Step ${step.order}: ${step.description}`)

      switch (step.type) {
        case 'load_messages':
          await this.recoverMessages(sessionId, { emit: 'progress' })
          break
        case 'restore_tasks':
          await this.restoreTasks(plan.checkpoint)
          break
        case 'rebuild_context': {
          const context = await this.rebuildContext(sessionId)
          if (callbacks.onContextRebuilt) {
            await callbacks.onContextRebuilt(context)
          }
          break
        }
        case 'resume_task':
          if (step.taskId) {
            await this.resumeTask(step.taskId)
          }
          break
        case 'notify_user':
          break
      }
    }
  }

  async recoverMessages(
    sessionId: string,
    options: {
      limit?: number
      emit?: RecoveryMessageEventMode
    } = {}
  ): Promise<RecoveredSessionMessage[]> {
    const db = DatabaseService.getInstance().getClient()
    const limit = options.limit ?? 100
    const emitMode = options.emit ?? 'none'

    const messages = (await db.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        sessionId: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true
      }
    })) as RecoveryMessageRecord[]

    const normalizedMessages = messages
      .slice()
      .reverse()
      .map((message: RecoveryMessageRecord) => ({
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        metadata:
          message.metadata && typeof message.metadata === 'object'
            ? (message.metadata as Record<string, unknown>)
            : null,
        createdAt: message.createdAt.toISOString()
      }))

    if (emitMode !== 'none') {
      const payload = {
        sessionId,
        step: 'load_messages',
        status: 'completed',
        messageCount: normalizedMessages.length,
        messages: normalizedMessages,
        recoveredAt: new Date().toISOString()
      }

      this.broadcastRecoveryEvent(
        emitMode === 'recovered'
          ? EVENT_CHANNELS.SESSION_RECOVERED
          : EVENT_CHANNELS.SESSION_RECOVERY_PROGRESS,
        payload
      )
    }

    console.log(`[SessionRecoveryExecutor] Recovered ${normalizedMessages.length} messages`)
    return normalizedMessages
  }

  private async restoreTasks(checkpoint: SessionRecoveryCheckpoint): Promise<void> {
    const db = DatabaseService.getInstance().getClient()
    const recovery = this.createCrashRecoveryMetadata('session-recovery', 'restore-session')
    const taskIds = Array.from(new Set([...checkpoint.inProgressTasks, ...checkpoint.pendingTasks]))

    for (const taskId of taskIds) {
      const task = await db.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          metadata: true
        }
      })

      if (!task) {
        continue
      }

      await db.task.update({
        where: { id: taskId },
        data: {
          ...(checkpoint.inProgressTasks.includes(taskId)
            ? {
                status: 'pending',
                startedAt: null
              }
            : {}),
          metadata: applyRecoveryTrackingMetadata(
            (task.metadata as Record<string, unknown> | null) || undefined,
            recovery
          ) as any
        }
      })
    }

    console.log(`[SessionRecoveryExecutor] Restored ${taskIds.length} interrupted/pending tasks`)
  }

  private async rebuildContext(sessionId: string): Promise<{
    recentTopics: string[]
    conversationSummary: string
  }> {
    const db = DatabaseService.getInstance().getClient()

    const messages = await db.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { role: true, content: true }
    })

    const topics: string[] = []
    for (const msg of messages.slice(0, 5)) {
      const words = msg.content.split(/\s+/).slice(0, 5).join(' ')
      if (words.length > 10) {
        topics.push(words + '...')
      }
    }

    console.log(`[SessionRecoveryExecutor] Rebuilt context with ${topics.length} topics`)

    return {
      recentTopics: topics.slice(0, 5),
      conversationSummary: `Recovered conversation with ${messages.length} messages`
    }
  }

  private async resumeTask(taskId: string): Promise<void> {
    const db = DatabaseService.getInstance().getClient()
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        metadata: true
      }
    })

    if (!task) {
      return
    }

    const recovery = this.createCrashRecoveryMetadata('task-resumption', 'resume-tasks')

    await db.task.update({
      where: { id: taskId },
      data: {
        status: 'pending',
        metadata: applyRecoveryTrackingMetadata(
          {
            ...((task.metadata as Record<string, unknown> | null) || {}),
            resumedAt: new Date().toISOString(),
            resumedFrom: 'crash_recovery'
          },
          recovery
        ) as any
      }
    })

    console.log(`[SessionRecoveryExecutor] Task ${taskId} marked for resumption`)
  }

  private createCrashRecoveryMetadata(
    recoveryStage: RecoveryTrackingMetadata['recoveryStage'],
    resumeAction: RecoveryTrackingMetadata['resumeAction'],
    resumeReason: ResumeReason = 'crash-detected'
  ): RecoveryTrackingMetadata {
    return createRecoveryTrackingMetadata({
      recoverySource: 'crash-recovery',
      recoveryStage,
      resumeReason,
      resumeAction
    })
  }

  private broadcastRecoveryEvent(channel: string, payload: Record<string, unknown>): void {
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed())

    for (const window of windows) {
      window.webContents.send(channel, payload)
    }
  }
}

export const sessionRecoveryExecutorService = SessionRecoveryExecutorService.getInstance()

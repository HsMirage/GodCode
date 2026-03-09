import { BoulderStateService } from './boulder-state.service'
import { DatabaseService } from './database'
import { PlanTask } from './plan-file.service'
import { SessionIdleDetectionService } from './session-idle-detection.service'
import { SessionSnapshot, SessionStateRecoveryService } from './session-state-recovery.service'
import { sessionContinuityService } from './session-continuity.service'
import { TodoIncompleteDetectionService } from './todo-incomplete-detection.service'
import { TodoItem } from './todo-tracking.service'
import {
  createRecoveryTrackingMetadata,
  derivePlanResumeReason,
  deriveTodoResumeReason,
  getRecoverySourceLabel,
  getResumeReasonLabel,
  type RecoveryTrackingMetadata
} from '@/shared/recovery-contract'
import type { PersistedExecutionEvent } from '@/shared/execution-event-contract'
import type { StructuredTaskBrief } from '@/shared/task-brief-contract'

interface RecentTaskRecord {
  id: string
  input: string
  output: string | null
  status: string
  assignedAgent: string | null
  metadata: unknown
  createdAt: Date
  completedAt: Date | null
}

export interface SemanticRecoverySummary {
  currentTaskGoal: string
  completedItems: string[]
  unfinishedItems: string[]
  recentDecisions: string[]
  nonRevertableConstraints: string[]
  recentFailureReason?: string
  suggestedNextAction: string
}

export interface ResumeContext {
  sessionId: string
  planName: string
  generatedAt: string
  canResume: boolean
  recovery: RecoveryTrackingMetadata

  sessionInfo: {
    idleDuration: number
    lastActivity: Date
  }

  workStatus: {
    incompleteTodos: TodoItem[]
    incompletePlanTasks: PlanTask[]
    nextTask: PlanTask | TodoItem | null
    completionRatio: number
  }

  projectStatus: {
    completedTasks: number
    totalTasks: number
    completionPercentage: string
    currentPhase: string
    blockers: string[]
  }

  semanticRecoverySummary: SemanticRecoverySummary
  resumePrompt: string
  nextSteps: string[]
}

export class ResumeContextRestorationService {
  private static instance: ResumeContextRestorationService | null = null

  private constructor() {}

  static getInstance(): ResumeContextRestorationService {
    if (!ResumeContextRestorationService.instance) {
      ResumeContextRestorationService.instance = new ResumeContextRestorationService()
    }
    return ResumeContextRestorationService.instance
  }

  async generateResumeContext(sessionId: string, planName: string): Promise<ResumeContext> {
    const idleService = SessionIdleDetectionService.getInstance()
    const incompleteService = TodoIncompleteDetectionService.getInstance()
    const boulderService = BoulderStateService.getInstance()

    const lastActivity = await idleService.getLastActivity(sessionId)
    const idleDuration = await idleService.getIdleDuration(sessionId)
    const incompleteWork = await incompleteService.detectIncompleteWork(sessionId, planName)
    const boulderState = await boulderService.getState()
    const resumeReason =
      incompleteWork.incompleteTodos.length > 0
        ? deriveTodoResumeReason(incompleteWork.incompleteTodos)
        : derivePlanResumeReason(incompleteWork.incompletePlanTasks.length > 0)
    const recovery = createRecoveryTrackingMetadata({
      recoverySource: 'manual-resume',
      recoveryStage: 'context-rebuild',
      resumeReason,
      resumeAction: 'rebuild-context'
    })
    const canResume = resumeReason !== 'no-pending-work'

    const nextSteps = await this.getNextSteps(sessionId, planName)
    const semanticRecoverySummary = await this.buildSemanticRecoverySummary({
      sessionId,
      planName,
      nextSteps,
      incompleteWork,
      currentPhase: boulderState.current_phase || '',
      completedTasks: boulderState.completed_tasks
    })
    const resumePrompt = await this.buildResumePrompt(
      sessionId,
      planName,
      nextSteps,
      semanticRecoverySummary
    )

    return {
      sessionId,
      planName,
      generatedAt: new Date().toISOString(),
      canResume,
      recovery,
      sessionInfo: {
        idleDuration,
        lastActivity: lastActivity || new Date()
      },
      workStatus: {
        incompleteTodos: incompleteWork.incompleteTodos,
        incompletePlanTasks: incompleteWork.incompletePlanTasks,
        nextTask: incompleteWork.nextTask,
        completionRatio: incompleteWork.completionRatio
      },
      projectStatus: {
        completedTasks: boulderState.completed_tasks,
        totalTasks: boulderState.total_tasks,
        completionPercentage: boulderState.completion_percentage,
        currentPhase: boulderState.current_phase || '',
        blockers: boulderState.blockers
      },
      semanticRecoverySummary,
      resumePrompt,
      nextSteps
    }
  }

  async buildResumePrompt(
    sessionId: string,
    planName: string,
    precalculatedNextSteps?: string[],
    precalculatedSemanticSummary?: SemanticRecoverySummary
  ): Promise<string> {
    // Avoid circular dependency by accepting precalculatedNextSteps or calculating them if missing
    // But we need the context first. If we are called from generateResumeContext, we have everything but the prompt.
    // If called directly, we need to gather data.

    const idleService = SessionIdleDetectionService.getInstance()
    const incompleteService = TodoIncompleteDetectionService.getInstance()
    const boulderService = BoulderStateService.getInstance()

    const idleDuration = await idleService.getIdleDuration(sessionId)
    const incompleteWork = await incompleteService.detectIncompleteWork(sessionId, planName)
    const boulderState = await boulderService.getState()
    const nextSteps = precalculatedNextSteps || (await this.getNextSteps(sessionId, planName))
    const semanticRecoverySummary =
      precalculatedSemanticSummary ||
      (await this.buildSemanticRecoverySummary({
        sessionId,
        planName,
        nextSteps,
        incompleteWork,
        currentPhase: boulderState.current_phase || '',
        completedTasks: boulderState.completed_tasks || 0
      }))
    const resumeReason =
      incompleteWork.incompleteTodos.length > 0
        ? deriveTodoResumeReason(incompleteWork.incompleteTodos)
        : derivePlanResumeReason(incompleteWork.incompletePlanTasks.length > 0)

    const parts = []

    parts.push('# Session Resume')
    parts.push(
      `\nRecovery Source: ${getRecoverySourceLabel('manual-resume')} · ${getResumeReasonLabel(resumeReason)}`
    )
    parts.push(`\nSession has been idle for ${Math.floor(idleDuration / 60000)} minutes.`)
    parts.push(
      `\nProject Progress: ${boulderState.completion_percentage} (${boulderState.completed_tasks}/${boulderState.total_tasks})`
    )
    if (boulderState.current_phase) {
      parts.push(`Current Phase: ${boulderState.current_phase}`)
    }

    parts.push(`\n## Current Goal:\n- ${semanticRecoverySummary.currentTaskGoal}`)
    parts.push(
      `\n## Completed Items:\n${semanticRecoverySummary.completedItems.map(item => `- ${item}`).join('\n')}`
    )
    parts.push(
      `\n## Unfinished Items:\n${semanticRecoverySummary.unfinishedItems.map(item => `- ${item}`).join('\n')}`
    )
    parts.push(
      `\n## Recent Decisions:\n${semanticRecoverySummary.recentDecisions.map(item => `- ${item}`).join('\n')}`
    )
    parts.push(
      `\n## No-Revert Constraints:\n${semanticRecoverySummary.nonRevertableConstraints.map(item => `- ${item}`).join('\n')}`
    )
    if (semanticRecoverySummary.recentFailureReason) {
      parts.push(`\n## Latest Failure:\n- ${semanticRecoverySummary.recentFailureReason}`)
    }
    parts.push(`\n## Suggested Next Action:\n- ${semanticRecoverySummary.suggestedNextAction}`)

    if (boulderState.blockers.length > 0) {
      parts.push(`\n## Blockers:\n${boulderState.blockers.map(b => `- ${b}`).join('\n')}`)
    }

    if (incompleteWork.incompleteTodos.length > 0) {
      parts.push(`\n## Pending TODOs (${incompleteWork.incompleteTodos.length}):`)
      incompleteWork.incompleteTodos.slice(0, 5).forEach(todo => {
        parts.push(`- [${todo.status}] ${todo.content} (priority: ${todo.priority})`)
      })
    }

    if (incompleteWork.incompletePlanTasks.length > 0) {
      parts.push(`\n## Pending Plan Tasks (${incompleteWork.incompletePlanTasks.length}):`)
      incompleteWork.incompletePlanTasks.slice(0, 3).forEach(task => {
        parts.push(`- Task ${task.id}: ${task.description}`)
      })
    }

    if (incompleteWork.nextTask) {
      const next = incompleteWork.nextTask
      // Check if it's a PlanTask (has 'id' and 'description') or TodoItem (has 'content')
      // A robust check: PlanTask has 'lineNumber'
      const isTask = 'lineNumber' in next
      parts.push(`\n## Recommended Next Action:`)
      parts.push(
        isTask
          ? `Resume with Task ${(next as PlanTask).id}: ${(next as PlanTask).description}`
          : `Continue TODO: ${(next as TodoItem).content}`
      )
    }

    parts.push(`\n## Next Steps:\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`)

    return parts.join('\n')
  }

  async getNextSteps(sessionId: string, planName: string): Promise<string[]> {
    const incompleteWork = await TodoIncompleteDetectionService.getInstance().detectIncompleteWork(
      sessionId,
      planName
    )

    const steps: string[] = []

    if (incompleteWork.nextTask) {
      const next = incompleteWork.nextTask
      const isTask = 'lineNumber' in next
      steps.push(
        isTask
          ? `Start Task ${(next as PlanTask).id}`
          : `Complete TODO: ${(next as TodoItem).content}`
      )
    }

    if (incompleteWork.incompleteTodos.length > 1) {
      steps.push(`Review ${incompleteWork.incompleteTodos.length} pending TODOs`)
    }

    if (incompleteWork.hasBlockers) {
      steps.push(`Address ${incompleteWork.blockers.length} blocker(s)`)
    }

    if (steps.length === 0) {
      steps.push('No pending work detected')
    }

    return steps
  }

  async restoreSessionState(sessionId: string, planName: string): Promise<SessionSnapshot> {
    return SessionStateRecoveryService.getInstance().captureSessionState(sessionId, planName)
  }

  private async buildSemanticRecoverySummary(input: {
    sessionId: string
    planName: string
    nextSteps: string[]
    incompleteWork: Awaited<ReturnType<TodoIncompleteDetectionService['detectIncompleteWork']>>
    currentPhase: string
    completedTasks: number
  }): Promise<SemanticRecoverySummary> {
    const [recentTasks, sessionState] = await Promise.all([
      this.getRecentTasks(input.sessionId),
      sessionContinuityService.getSessionState(input.sessionId)
    ])

    const recentEvents = Array.isArray(sessionState?.context?.executionEvents)
      ? sessionState.context.executionEvents
      : []
    const latestBrief = recentTasks
      .map(task => this.extractTaskBrief(task.metadata))
      .find((brief): brief is StructuredTaskBrief => Boolean(brief))

    const currentTaskGoal =
      this.describeNextTask(input.incompleteWork.nextTask) ||
      latestBrief?.goal ||
      (input.currentPhase ? `继续推进 ${input.currentPhase}` : `继续推进 ${input.planName}`)

    const completedItems = recentTasks
      .filter(task => task.status === 'completed')
      .slice(0, 3)
      .map(task => this.describeTaskRecord(task))

    if (completedItems.length === 0 && input.completedTasks > 0) {
      completedItems.push(`已完成 ${input.completedTasks} 项任务，保持当前成果不回退。`)
    }
    if (completedItems.length === 0) {
      completedItems.push('尚未记录到已完成事项。')
    }

    const unfinishedItems = [
      ...input.incompleteWork.incompletePlanTasks.slice(0, 3).map(task => `计划任务 ${task.id}: ${task.description}`),
      ...input.incompleteWork.incompleteTodos.slice(0, 3).map(todo => `TODO: ${todo.content}`)
    ]
    if (unfinishedItems.length === 0) {
      unfinishedItems.push('暂无待完成事项，优先复核最近结果。')
    }

    const recentDecisions = this.describeRecentDecisions(recentEvents)
    if (recentDecisions.length === 0) {
      recentDecisions.push('未找到结构化决策事件，默认沿最近任务边界继续。')
    }

    const nonRevertableConstraints = Array.from(
      new Set(
        recentTasks
          .flatMap(task => this.extractTaskBrief(task.metadata)?.forbiddenModificationScope || [])
          .filter(Boolean)
      )
    ).slice(0, 4)
    if (nonRevertableConstraints.length === 0) {
      nonRevertableConstraints.push('不要回退已完成任务；仅在当前任务边界内继续推进。')
    }

    const recentFailureReason = this.getRecentFailureReason(recentTasks, recentEvents)

    return {
      currentTaskGoal,
      completedItems,
      unfinishedItems,
      recentDecisions,
      nonRevertableConstraints,
      recentFailureReason,
      suggestedNextAction:
        sessionState?.context?.suggestedNextAction || input.nextSteps[0] || 'No pending work detected'
    }
  }

  private async getRecentTasks(sessionId: string): Promise<RecentTaskRecord[]> {
    const prisma = DatabaseService.getInstance().getClient()
    return prisma.task.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        input: true,
        output: true,
        status: true,
        assignedAgent: true,
        metadata: true,
        createdAt: true,
        completedAt: true
      }
    }) as Promise<RecentTaskRecord[]>
  }

  private extractTaskBrief(metadata: unknown): StructuredTaskBrief | null {
    if (!metadata || typeof metadata !== 'object') {
      return null
    }
    const taskBrief = (metadata as Record<string, unknown>).taskBrief
    if (!taskBrief || typeof taskBrief !== 'object') {
      return null
    }
    return taskBrief as StructuredTaskBrief
  }

  private describeTaskRecord(task: RecentTaskRecord): string {
    const brief = this.extractTaskBrief(task.metadata)
    const label = brief?.goal || task.input.trim().replace(/\s+/g, ' ').slice(0, 80)
    return task.assignedAgent ? `${label}（${task.assignedAgent}，${task.status}）` : `${label}（${task.status}）`
  }

  private describeNextTask(task: PlanTask | TodoItem | null): string | null {
    if (!task) {
      return null
    }
    if ('lineNumber' in task) {
      return `继续任务 ${task.id}: ${task.description}`
    }
    return `继续 TODO: ${task.content}`
  }

  private describeRecentDecisions(events: PersistedExecutionEvent[]): string[] {
    return [...events]
      .reverse()
      .filter(event =>
        ['checkpoint-saved', 'tool-call-approved', 'tool-call-rejected', 'run-paused', 'run-resumed'].includes(
          event.type
        )
      )
      .slice(0, 4)
      .map(event => {
        const payload = event.payload || {}
        switch (event.type) {
          case 'checkpoint-saved':
            return `Checkpoint ${String(payload.phase || 'unknown')} 结果为 ${String(payload.status || 'unknown')}${payload.reason ? `：${String(payload.reason)}` : ''}`
          case 'tool-call-approved':
            return `已批准工具 ${String(payload.toolName || 'unknown')}，继续当前执行链路。`
          case 'tool-call-rejected':
            return `已拒绝工具 ${String(payload.toolName || 'unknown')}${payload.decisionReason ? `：${String(payload.decisionReason)}` : ''}`
          case 'run-paused':
            return `执行曾因 ${String(payload.reason || 'unknown reason')} 暂停。`
          case 'run-resumed':
            return `执行已从工具 ${String(payload.toolName || 'unknown')} 恢复。`
          default:
            return event.type
        }
      })
  }

  private getRecentFailureReason(
    recentTasks: RecentTaskRecord[],
    recentEvents: PersistedExecutionEvent[]
  ): string | undefined {
    const failedTask = recentTasks.find(task => task.status === 'failed' && task.output)
    if (failedTask?.output) {
      return failedTask.output
    }

    const failedEvent = [...recentEvents]
      .reverse()
      .find(event => event.type === 'tool-call-completed' && event.payload?.error)
    if (failedEvent?.payload?.error) {
      return String(failedEvent.payload.error)
    }

    const rejectedEvent = [...recentEvents]
      .reverse()
      .find(event => event.type === 'tool-call-rejected' && event.payload?.decisionReason)
    if (rejectedEvent?.payload?.decisionReason) {
      return String(rejectedEvent.payload.decisionReason)
    }

    return undefined
  }
}

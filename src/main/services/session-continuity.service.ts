/**
 * Session Continuity Service
 *
 * Provides session state persistence, crash recovery, and task resumption capabilities.
 * This service enables:
 * 1. Session state persistence to database
 * 2. Crash detection and recovery
 * 3. Context reconstruction from persisted data
 * 4. Task breakpoint resumption
 */

import { AutoResumeTriggerService } from './auto-resume-trigger.service'
import { DatabaseService } from './database'
import { sessionRecoveryExecutorService } from './session-recovery-executor.service'
import { v4 as uuidv4 } from 'uuid'
import {
  createRecoveryTrackingMetadata,
  type RecoveryTrackingMetadata,
  type ResumeReason
} from '@/shared/recovery-contract'
import type { PersistedExecutionEvent } from '@/shared/execution-event-contract'

// ============================================================================
// Types
// ============================================================================

export interface SessionState {
  id: string
  sessionId: string
  status: SessionStatus
  checkpoint: SessionCheckpoint
  context: SessionContext
  createdAt: Date
  updatedAt: Date
}

export type SessionStatus =
  | 'active' // Session is running normally
  | 'idle' // Session is idle (no recent activity)
  | 'interrupted' // Session was unexpectedly interrupted
  | 'crashed' // Session crashed (detected on restart)
  | 'completed' // Session completed normally
  | 'recovering' // Session is being recovered

export interface SessionCheckpoint {
  // Last known good state
  lastMessageId?: string
  lastTaskId?: string
  lastRunId?: string

  // Execution progress
  pendingTasks: string[] // Task IDs that were pending
  inProgressTasks: string[] // Task IDs that were in progress
  completedTasks: string[] // Task IDs that completed

  // Message history markers
  messageCount: number
  lastUserMessageId?: string
  lastAssistantMessageId?: string

  // Timestamp markers
  lastActivityAt: Date
  checkpointAt: Date
}

export interface SessionContext {
  // Workspace context
  spaceId: string
  workDir: string

  // Persisted recovery snapshot
  sessionSnapshot?: Record<string, unknown>

  // Conversation context summary
  conversationSummary?: string
  recentTopics?: string[]

  // Agent state
  activeAgents?: string[]
  agentStates?: Record<string, unknown>

  // Recovery hints
  recoveryHints?: string[]
  suggestedNextAction?: string
  recoverySource?: RecoveryTrackingMetadata['recoverySource']
  recoveryStage?: RecoveryTrackingMetadata['recoveryStage']
  resumeReason?: RecoveryTrackingMetadata['resumeReason']
  resumeAction?: RecoveryTrackingMetadata['resumeAction']
  recoveryUpdatedAt?: string
  executionEvents?: PersistedExecutionEvent[]
}

export interface RecoveryPlan {
  sessionId: string
  status: SessionStatus
  canRecover: boolean
  recoveryType: RecoveryType
  steps: RecoveryStep[]
  estimatedActions: number
  context: SessionContext
  checkpoint: SessionCheckpoint
}

export type RecoveryType =
  | 'none' // No recovery needed
  | 'resume' // Simple resume from checkpoint
  | 'partial' // Partial recovery (some data may be lost)
  | 'rebuild' // Full context rebuild needed

export interface RecoveryStep {
  order: number
  type: 'load_messages' | 'restore_tasks' | 'rebuild_context' | 'resume_task' | 'notify_user'
  description: string
  taskId?: string
  metadata?: Record<string, unknown>
}

export interface CrashInfo {
  detected: boolean
  sessionIds: string[]
  timestamp: Date
  reason?: string
}

// ============================================================================
// Service Implementation
// ============================================================================

export class SessionContinuityService {
  private static instance: SessionContinuityService | null = null
  private checkpointInterval: NodeJS.Timeout | null = null
  private readonly CHECKPOINT_INTERVAL_MS = 30000 // 30 seconds
  private readonly IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
  private readonly CRASH_MARKER_KEY = 'session_crash_marker'

  private constructor() {}

  static getInstance(): SessionContinuityService {
    if (!SessionContinuityService.instance) {
      SessionContinuityService.instance = new SessionContinuityService()
    }
    return SessionContinuityService.instance
  }

  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================

  /**
   * Initialize the service and check for crashed sessions
   */
  async initialize(): Promise<CrashInfo> {
    console.log('[SessionContinuity] Initializing...')

    // Check for crash marker from previous run
    const crashInfo = await this.detectCrash()

    if (crashInfo.detected) {
      console.log(`[SessionContinuity] Crash detected! ${crashInfo.sessionIds.length} sessions affected`)
      await this.markSessionsAsCrashed(crashInfo.sessionIds)
    }

    // Set crash marker for current run
    await this.setCrashMarker()

    // Start periodic checkpointing
    this.startCheckpointTimer()

    console.log('[SessionContinuity] Initialized')
    return crashInfo
  }

  /**
   * Graceful shutdown - clear crash marker
   */
  async shutdown(): Promise<void> {
    console.log('[SessionContinuity] Shutting down...')

    // Stop checkpoint timer
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval)
      this.checkpointInterval = null
    }

    // Mark all active sessions as idle (graceful shutdown)
    await this.markActiveSessionsAsIdle()

    // Clear crash marker
    await this.clearCrashMarker()

    console.log('[SessionContinuity] Shutdown complete')
  }

  // ============================================================================
  // Session State Management
  // ============================================================================

  /**
   * Create or update session state
   */
  async saveSessionState(
    sessionId: string,
    status: SessionStatus,
    checkpoint: Partial<SessionCheckpoint>,
    context: Partial<SessionContext>
  ): Promise<SessionState> {
    const db = DatabaseService.getInstance().getClient()
    const now = new Date()

    // Get existing state or create new
    const existing = await this.getSessionState(sessionId)

    const fullCheckpoint: SessionCheckpoint = {
      pendingTasks: [],
      inProgressTasks: [],
      completedTasks: [],
      messageCount: 0,
      lastActivityAt: now,
      checkpointAt: now,
      ...(existing?.checkpoint || {}),
      ...checkpoint
    }

    const fullContext: SessionContext = {
      spaceId: '',
      workDir: '',
      ...(existing?.context || {}),
      ...context
    }

    const stateData = {
      sessionId,
      status,
      checkpoint: fullCheckpoint,
      context: fullContext,
      updatedAt: now
    }

    if (existing) {
      // Update existing
      const updated = await db.sessionState.update({
        where: { id: existing.id },
        data: {
          status: stateData.status,
          checkpoint: stateData.checkpoint as any,
          context: stateData.context as any,
          updatedAt: stateData.updatedAt
        }
      })

      return this.mapToSessionState(updated)
    } else {
      // Create new
      const created = await db.sessionState.create({
        data: {
          id: uuidv4(),
          sessionId: stateData.sessionId,
          status: stateData.status,
          checkpoint: stateData.checkpoint as any,
          context: stateData.context as any,
          createdAt: now,
          updatedAt: now
        }
      })

      return this.mapToSessionState(created)
    }
  }

  /**
   * Get session state by session ID
   */
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const db = DatabaseService.getInstance().getClient()

    try {
      const state = await db.sessionState.findUnique({
        where: { sessionId }
      })

      return state ? this.mapToSessionState(state) : null
    } catch (error) {
      // Table may not exist yet
      console.warn('[SessionContinuity] Failed to get session state:', error)
      return null
    }
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(sessionId: string): Promise<void> {
    const existing = await this.getSessionState(sessionId)
    if (!existing) return

    await this.saveSessionState(
      sessionId,
      'active',
      { lastActivityAt: new Date() },
      {}
    )
  }

  /**
   * Create a checkpoint for a session
   */
  async createCheckpoint(sessionId: string): Promise<SessionCheckpoint> {
    const db = DatabaseService.getInstance().getClient()
    const now = new Date()

    // Gather current state from database
    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, role: true }
        },
        tasks: {
          select: { id: true, status: true }
        }
      }
    })

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const messages: { id: string; role: string }[] = session.messages || []
    const tasks: { id: string; status: string }[] = session.tasks || []

    const checkpoint: SessionCheckpoint = {
      lastMessageId: messages[0]?.id,
      lastUserMessageId: messages.find((m: { id: string; role: string }) => m.role === 'user')?.id,
      lastAssistantMessageId: messages.find((m: { id: string; role: string }) => m.role === 'assistant')?.id,
      messageCount: messages.length,
      pendingTasks: tasks.filter((t: { id: string; status: string }) => t.status === 'pending').map((t: { id: string; status: string }) => t.id),
      inProgressTasks: tasks.filter((t: { id: string; status: string }) => t.status === 'running').map((t: { id: string; status: string }) => t.id),
      completedTasks: tasks.filter((t: { id: string; status: string }) => t.status === 'completed').map((t: { id: string; status: string }) => t.id),
      lastActivityAt: now,
      checkpointAt: now
    }

    // Get session's space for context
    const space = await db.space.findUnique({
      where: { id: session.spaceId },
      select: { id: true, workDir: true }
    })

    const context: Partial<SessionContext> = {
      spaceId: session.spaceId,
      workDir: space?.workDir || ''
    }

    await this.saveSessionState(sessionId, 'active', checkpoint, context)

    return checkpoint
  }

  // ============================================================================
  // Crash Detection & Recovery
  // ============================================================================

  /**
   * Detect if there was a crash from previous run
   */
  private async detectCrash(): Promise<CrashInfo> {
    const db = DatabaseService.getInstance().getClient()

    try {
      // Check for crash marker
      const marker = await db.systemSetting.findUnique({
        where: { key: this.CRASH_MARKER_KEY }
      })

      if (!marker || !marker.value) {
        return { detected: false, sessionIds: [], timestamp: new Date() }
      }

      const markerData = JSON.parse(marker.value)

      // Find sessions that were active when crash occurred
      const activeSessions = await db.sessionState.findMany({
        where: {
          status: { in: ['active', 'recovering'] }
        },
        select: { sessionId: true }
      })

      return {
        detected: true,
        sessionIds: activeSessions.map((s: { sessionId: string }) => s.sessionId),
        timestamp: new Date(markerData.timestamp),
        reason: 'Unexpected shutdown detected'
      }
    } catch (error) {
      // Table may not exist yet - no crash
      return { detected: false, sessionIds: [], timestamp: new Date() }
    }
  }

  /**
   * Set crash marker on startup
   */
  private async setCrashMarker(): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    try {
      const markerValue = JSON.stringify({
        timestamp: new Date().toISOString(),
        pid: process.pid
      })

      await db.systemSetting.upsert({
        where: { key: this.CRASH_MARKER_KEY },
        create: {
          id: uuidv4(),
          key: this.CRASH_MARKER_KEY,
          value: markerValue
        },
        update: {
          value: markerValue
        }
      })
    } catch (error) {
      console.warn('[SessionContinuity] Failed to set crash marker:', error)
    }
  }

  /**
   * Clear crash marker on graceful shutdown
   */
  private async clearCrashMarker(): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    try {
      await db.systemSetting.delete({
        where: { key: this.CRASH_MARKER_KEY }
      })
    } catch (error) {
      // Ignore - marker may not exist
    }
  }

  /**
   * Mark sessions as crashed
   */
  private async markSessionsAsCrashed(sessionIds: string[]): Promise<void> {
    for (const sessionId of sessionIds) {
      try {
        await this.saveSessionState(
          sessionId,
          'crashed',
          {},
          this.toRecoveryContext(
            this.createCrashRecoveryMetadata('detected', 'show-recovery-dialog'),
            ['Unexpected shutdown detected; crash recovery is available.']
          )
        )
      } catch (error) {
        console.warn(`[SessionContinuity] Failed to mark session ${sessionId} as crashed:`, error)
      }
    }
  }

  /**
   * Mark active sessions as idle (for graceful shutdown)
   */
  private async markActiveSessionsAsIdle(): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    try {
      await db.sessionState.updateMany({
        where: { status: 'active' },
        data: { status: 'idle', updatedAt: new Date() }
      })
    } catch (error) {
      console.warn('[SessionContinuity] Failed to mark sessions as idle:', error)
    }
  }

  /**
   * Get sessions that need recovery
   */
  async getRecoverableSessions(): Promise<SessionState[]> {
    const db = DatabaseService.getInstance().getClient()

    try {
      const states = await db.sessionState.findMany({
        where: {
          status: { in: ['crashed', 'interrupted'] }
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return states.map((s: any) => this.mapToSessionState(s))
    } catch (error) {
      return []
    }
  }

  /**
   * Create a recovery plan for a session
   */
  async createRecoveryPlan(sessionId: string): Promise<RecoveryPlan> {
    const state = await this.getSessionState(sessionId)

    if (!state) {
      return {
        sessionId,
        status: 'completed',
        canRecover: false,
        recoveryType: 'none',
        steps: [],
        estimatedActions: 0,
        context: { spaceId: '', workDir: '' },
        checkpoint: {
          pendingTasks: [],
          inProgressTasks: [],
          completedTasks: [],
          messageCount: 0,
          lastActivityAt: new Date(),
          checkpointAt: new Date()
        }
      }
    }

    const steps: RecoveryStep[] = []
    let order = 0

    // Step 1: Load message history
    if (state.checkpoint.messageCount > 0) {
      steps.push({
        order: order++,
        type: 'load_messages',
        description: `Load ${state.checkpoint.messageCount} messages from history`
      })
    }

    // Step 2: Restore task states
    const tasksToRestore = [
      ...state.checkpoint.inProgressTasks,
      ...state.checkpoint.pendingTasks
    ]

    if (tasksToRestore.length > 0) {
      steps.push({
        order: order++,
        type: 'restore_tasks',
        description: `Restore ${tasksToRestore.length} tasks`
      })
    }

    // Step 3: Rebuild context if needed
    if (state.status === 'crashed') {
      steps.push({
        order: order++,
        type: 'rebuild_context',
        description: 'Rebuild conversation context from history'
      })
    }

    // Step 4: Resume in-progress tasks
    for (const taskId of state.checkpoint.inProgressTasks) {
      steps.push({
        order: order++,
        type: 'resume_task',
        description: `Resume task ${taskId}`,
        taskId
      })
    }

    // Step 5: Notify user
    steps.push({
      order: order++,
      type: 'notify_user',
      description: 'Notify user of recovery status'
    })

    const recoveryType: RecoveryType =
      state.status === 'crashed' ? 'rebuild' :
      state.checkpoint.inProgressTasks.length > 0 ? 'resume' :
      state.checkpoint.pendingTasks.length > 0 ? 'partial' : 'none'

    return {
      sessionId,
      status: state.status,
      canRecover: steps.length > 0,
      recoveryType,
      steps,
      estimatedActions: steps.length,
      context: state.context,
      checkpoint: state.checkpoint
    }
  }

  /**
   * Execute recovery for a session
   */
  async executeRecovery(sessionId: string): Promise<boolean> {
    const plan = await this.createRecoveryPlan(sessionId)

    if (!plan.canRecover) {
      console.log(`[SessionContinuity] No recovery needed for session ${sessionId}`)
      return true
    }

    console.log(`[SessionContinuity] Executing recovery plan for session ${sessionId}`)
    console.log(`[SessionContinuity] Recovery type: ${plan.recoveryType}, steps: ${plan.steps.length}`)

    // Mark as recovering
    await this.saveSessionState(
      sessionId,
      'recovering',
      {},
      this.toRecoveryContext(this.createCrashRecoveryMetadata('session-recovery', 'restore-session'))
    )

    try {
      await sessionRecoveryExecutorService.executePlan(sessionId, plan, {
        onContextRebuilt: async context => {
          await this.saveSessionState(sessionId, 'recovering', {}, {
            ...this.toRecoveryContext(
              this.createCrashRecoveryMetadata('context-rebuild', 'rebuild-context')
            ),
            ...context
          })
        }
      })

      await AutoResumeTriggerService.getInstance().completeRecovery(sessionId)

      // Mark as active after successful recovery
      await this.saveSessionState(
        sessionId,
        'active',
        {},
        this.toRecoveryContext(
          this.createCrashRecoveryMetadata('completed', 'restore-session'),
          [`Recovered from ${plan.recoveryType} at ${new Date().toISOString()}`]
        )
      )

      console.log(`[SessionContinuity] Recovery completed for session ${sessionId}`)
      return true
    } catch (error) {
      console.error(`[SessionContinuity] Recovery failed for session ${sessionId}:`, error)
      await this.saveSessionState(
        sessionId,
        'interrupted',
        {},
        this.toRecoveryContext(
          this.createCrashRecoveryMetadata('failed', 'restore-session', 'recovery-failed'),
          [`Recovery failed: ${error instanceof Error ? error.message : String(error)}`]
        )
      )
      return false
    }
  }

  // ============================================================================
  // Recovery Operations
  // ============================================================================

  // ============================================================================
  // Periodic Checkpointing
  // ============================================================================

  private startCheckpointTimer(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval)
    }

    this.checkpointInterval = setInterval(async () => {
      await this.performPeriodicCheckpoint()
    }, this.CHECKPOINT_INTERVAL_MS)
  }

  private async performPeriodicCheckpoint(): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    try {
      // Find all active sessions
      const activeSessions = await db.sessionState.findMany({
        where: { status: 'active' },
        select: { sessionId: true }
      })

      for (const { sessionId } of activeSessions) {
        try {
          await this.createCheckpoint(sessionId)
        } catch (error) {
          console.warn(`[SessionContinuity] Checkpoint failed for ${sessionId}:`, error)
        }
      }
    } catch (error) {
      // Ignore errors during periodic checkpoint
    }
  }

  // ============================================================================
  // Context Reconstruction
  // ============================================================================

  /**
   * Generate a resume prompt for an LLM to understand session context
   */
  async generateResumePrompt(sessionId: string): Promise<string> {
    const db = DatabaseService.getInstance().getClient()
    const state = await this.getSessionState(sessionId)

    if (!state) {
      return 'No session state found. Starting fresh.'
    }

    const parts: string[] = []

    parts.push('# Session Recovery Context')
    parts.push('')
    parts.push(`Session ID: ${sessionId}`)
    parts.push(`Status: ${state.status}`)
    parts.push(`Last Activity: ${state.checkpoint.lastActivityAt.toISOString()}`)
    parts.push('')

    // Get recent messages
    const messages = await db.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true, createdAt: true }
    })

    if (messages.length > 0) {
      parts.push('## Recent Conversation')
      for (const msg of messages.reverse()) {
        const preview = msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '')
        parts.push(`[${msg.role}]: ${preview}`)
      }
      parts.push('')
    }

    // Get pending tasks
    const pendingTasks = await db.task.findMany({
      where: {
        sessionId,
        status: { in: ['pending', 'running'] }
      },
      select: { id: true, type: true, input: true, status: true }
    })

    if (pendingTasks.length > 0) {
      parts.push('## Pending Tasks')
      for (const task of pendingTasks) {
        const preview = task.input.slice(0, 100) + (task.input.length > 100 ? '...' : '')
        parts.push(`- [${task.status}] ${task.type}: ${preview}`)
      }
      parts.push('')
    }

    // Recovery hints
    if (state.context.recoveryHints && state.context.recoveryHints.length > 0) {
      parts.push('## Recovery Notes')
      for (const hint of state.context.recoveryHints) {
        parts.push(`- ${hint}`)
      }
      parts.push('')
    }

    // Suggested action
    if (state.context.suggestedNextAction) {
      parts.push('## Suggested Next Action')
      parts.push(state.context.suggestedNextAction)
    }

    return parts.join('\n')
  }

  // ============================================================================
  // Helpers
  // ============================================================================

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

  private toRecoveryContext(
    recovery: RecoveryTrackingMetadata,
    recoveryHints?: string[]
  ): Partial<SessionContext> {
    return {
      recoverySource: recovery.recoverySource,
      recoveryStage: recovery.recoveryStage,
      resumeReason: recovery.resumeReason,
      resumeAction: recovery.resumeAction,
      recoveryUpdatedAt: recovery.recoveryUpdatedAt,
      ...(recoveryHints ? { recoveryHints } : {})
    }
  }

  private mapToSessionState(dbRecord: any): SessionState {
    return {
      id: dbRecord.id,
      sessionId: dbRecord.sessionId,
      status: dbRecord.status as SessionStatus,
      checkpoint: {
        ...dbRecord.checkpoint,
        lastActivityAt: new Date(dbRecord.checkpoint.lastActivityAt),
        checkpointAt: new Date(dbRecord.checkpoint.checkpointAt)
      },
      context: dbRecord.context,
      createdAt: new Date(dbRecord.createdAt),
      updatedAt: new Date(dbRecord.updatedAt)
    }
  }
}

// Export singleton getter
export const sessionContinuityService = SessionContinuityService.getInstance()

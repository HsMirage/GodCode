import { BoulderStateService } from './boulder-state.service'
import { DatabaseService } from './database'
import { PlanFileService, PlanTask } from './plan-file.service'
import { sessionContinuityService } from './session-continuity.service'
import { TodoTrackingService, TodoItem, TodoStats } from './todo-tracking.service'
import { type WorkflowEvent, workflowEvents } from './workforce/events'
import {
  derivePlanResumeReason,
  deriveTodoResumeReason,
  getRecoverySourceLabel,
  getResumeReasonLabel,
  type RecoverySource,
  type RecoveryStage,
  type ResumeAction,
  type ResumeReason
} from '@/shared/recovery-contract'

export interface SessionSnapshot {
  // Session identification
  sessionId: string
  planName: string
  capturedAt: string // ISO 8601 timestamp

  // Project state
  projectState: {
    completedTasks: number
    totalTasks: number
    completionPercentage: string
    currentPhase: string
    status: string
    blockers: string[]
  }

  // Plan state
  planState: {
    totalTasks: number
    completedTasks: number
    pendingTasks: number
    currentPhaseTasks: PlanTask[]
    nextActionableTasks: PlanTask[]
  }

  // TODO state
  todoState: {
    incompleteTodos: TodoItem[]
    totalTodos: number
    pendingCount: number
    inProgressCount: number
    stats: TodoStats
  }

  // Recovery context
  recoveryContext: {
    shouldResume: boolean
    recoverySource: RecoverySource
    recoveryStage: RecoveryStage
    resumeReason: ResumeReason
    resumeAction: ResumeAction
    interruptionDetected: boolean
    lastActivity: string
    nextSteps: string[]
  }
}

export interface RecoveryContext {
  canResume: boolean
  reason: string
  recoverySource: RecoverySource
  recoveryStage: RecoveryStage
  resumeReason: ResumeReason
  resumeAction: ResumeAction
  incompleteTasks: number
  nextTask: PlanTask | null
  todosPending: number
  suggestedAction: string
  resumePrompt: string
}

type SerializedTodoItem = Omit<TodoItem, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}

type SerializedSessionSnapshot = Omit<SessionSnapshot, 'todoState'> & {
  todoState: Omit<SessionSnapshot['todoState'], 'incompleteTodos'> & {
    incompleteTodos: SerializedTodoItem[]
  }
}

export class SessionStateRecoveryService {
  private static instance: SessionStateRecoveryService | null = null
  private snapshots: Map<string, SessionSnapshot> = new Map()
  private initialized = false

  private constructor() {}

  static getInstance(): SessionStateRecoveryService {
    if (!SessionStateRecoveryService.instance) {
      SessionStateRecoveryService.instance = new SessionStateRecoveryService()
    }
    return SessionStateRecoveryService.instance
  }

  async initialize(): Promise<number> {
    if (this.initialized) {
      return this.snapshots.size
    }

    this.initialized = true

    try {
      await this.hydrateSnapshotsFromDatabase()
    } catch (error) {
      console.warn('[SessionStateRecovery] Failed to hydrate snapshots from database:', error)
    }

    this.registerTaskStatusListeners()
    console.log(`[SessionStateRecovery] Initialized with ${this.snapshots.size} persisted snapshot(s)`)

    return this.snapshots.size
  }

  // State capture
  async captureSessionState(sessionId: string, planName: string): Promise<SessionSnapshot> {
    const boulderService = BoulderStateService.getInstance()
    const planService = PlanFileService.getInstance()
    const todoService = TodoTrackingService.getInstance()

    // Gather all state data
    const boulderState = await boulderService.getState()
    const planMetadata = await planService.getPlanMetadata(planName)
    const planTasks = await planService.parsePlan(planName)
    const incompleteTodos = await todoService.getIncompleteTodos(sessionId)
    const todoStats = await todoService.getTodoStats(sessionId)

    // Find current phase tasks
    const currentPhase = boulderState.current_phase || (boulderState.active_plan ? 'Phase 1' : '')
    const currentPhaseTasks = currentPhase
      ? planTasks.filter(t => t.phase.includes(currentPhase) && !t.completed)
      : []

    // Determine next actionable tasks
    const nextActionable = planTasks.filter(t => !t.completed).slice(0, 5)

    // Detect interruption
    const interruptionDetected = await this.detectInterruption(sessionId)

    // Determine resume reason and steps
    const hasPendingPlanTasks = planMetadata.pendingTasks > 0
    const resumeReason = this.determineResumeReason(incompleteTodos, hasPendingPlanTasks, interruptionDetected)
    const nextSteps = this.generateNextSteps(currentPhaseTasks, incompleteTodos, nextActionable)
    const shouldResume = incompleteTodos.length > 0 || hasPendingPlanTasks || interruptionDetected
    const recoveryStage: RecoveryStage = shouldResume ? 'task-resumption' : 'context-rebuild'
    const recoverySource: RecoverySource = 'manual-resume'
    const resumeAction: ResumeAction = interruptionDetected
      ? 'resume-tasks'
      : shouldResume
        ? 'send-resume-prompt'
        : 'rebuild-context'

    // Build recovery context
    const recoveryContext = {
      shouldResume,
      recoverySource,
      recoveryStage,
      resumeReason,
      resumeAction,
      interruptionDetected,
      lastActivity: new Date().toISOString(),
      nextSteps
    }

    const snapshot: SessionSnapshot = {
      sessionId,
      planName,
      capturedAt: new Date().toISOString(),
      projectState: {
        completedTasks: boulderState.completed_tasks,
        totalTasks: boulderState.total_tasks,
        completionPercentage: boulderState.completion_percentage,
        currentPhase: currentPhase,
        status: boulderState.status,
        blockers: boulderState.blockers
      },
      planState: {
        totalTasks: planMetadata.totalTasks,
        completedTasks: planMetadata.completedTasks,
        pendingTasks: planMetadata.pendingTasks,
        currentPhaseTasks,
        nextActionableTasks: nextActionable
      },
      todoState: {
        incompleteTodos,
        totalTodos: todoStats.total,
        pendingCount: todoStats.pending,
        inProgressCount: todoStats.inProgress,
        stats: todoStats
      },
      recoveryContext
    }

    return snapshot
  }

  async captureAndPersistSessionState(
    sessionId: string,
    planName?: string
  ): Promise<SessionSnapshot | null> {
    const resolvedPlanName = await this.resolvePlanName(planName)
    if (!resolvedPlanName) {
      return null
    }

    const snapshot = await this.captureSessionState(sessionId, resolvedPlanName)
    await this.saveSnapshot(snapshot)
    return snapshot
  }

  async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
    if (!this.validateSnapshot(snapshot)) {
      throw new Error(`Invalid session snapshot for ${snapshot.sessionId}`)
    }

    this.snapshots.set(snapshot.sessionId, snapshot)

    const existingState = await sessionContinuityService.getSessionState(snapshot.sessionId)
    const status = existingState?.status || 'active'

    await sessionContinuityService.saveSessionState(snapshot.sessionId, status, {}, {
      sessionSnapshot: this.serializeSnapshot(snapshot) as unknown as Record<string, unknown>,
      suggestedNextAction: snapshot.recoveryContext.nextSteps[0],
      recoverySource: snapshot.recoveryContext.recoverySource,
      recoveryStage: snapshot.recoveryContext.recoveryStage,
      resumeReason: snapshot.recoveryContext.resumeReason,
      resumeAction: snapshot.recoveryContext.resumeAction,
      recoveryUpdatedAt: snapshot.capturedAt
    })
  }

  async loadSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    const cached = this.snapshots.get(sessionId)
    if (cached) {
      return cached
    }

    const state = await sessionContinuityService.getSessionState(sessionId)
    const serialized = state?.context?.sessionSnapshot

    if (!serialized || typeof serialized !== 'object') {
      return null
    }

    const snapshot = this.deserializeSnapshot(serialized as Record<string, unknown>)
    if (!this.validateSnapshot(snapshot)) {
      return null
    }

    this.snapshots.set(sessionId, snapshot)
    return snapshot
  }

  // Recovery operations
  async getRecoveryContext(sessionId: string, planName: string): Promise<RecoveryContext> {
    // We capture a fresh snapshot to get the current state
    const snapshot = await this.captureSessionState(sessionId, planName)

    const incompleteTasks = snapshot.planState.pendingTasks
    const todosPending = snapshot.todoState.pendingCount + snapshot.todoState.inProgressCount
    const nextTask = snapshot.planState.nextActionableTasks[0] || null

    const canResume = snapshot.recoveryContext.shouldResume
    const reason = getResumeReasonLabel(snapshot.recoveryContext.resumeReason)

    let suggestedAction = 'No pending work detected'
    if (canResume) {
      if (snapshot.recoveryContext.interruptionDetected) {
        suggestedAction = 'Resume interrupted work'
      } else if (todosPending > 0) {
        suggestedAction = 'Resume pending TODOs'
      } else if (nextTask) {
        suggestedAction = `Resume with Task ${nextTask.id}`
      }
    }

    const resumePrompt = await this.generateResumePrompt(sessionId, planName)

    return {
      canResume,
      reason,
      recoverySource: snapshot.recoveryContext.recoverySource,
      recoveryStage: snapshot.recoveryContext.recoveryStage,
      resumeReason: snapshot.recoveryContext.resumeReason,
      resumeAction: snapshot.recoveryContext.resumeAction,
      incompleteTasks,
      nextTask,
      todosPending,
      suggestedAction,
      resumePrompt
    }
  }

  async shouldResumeSession(sessionId: string, planName: string): Promise<boolean> {
    const snapshot = await this.captureSessionState(sessionId, planName)
    return snapshot.recoveryContext.shouldResume
  }

  async generateResumePrompt(sessionId: string, planName: string): Promise<string> {
    const snapshot = await this.captureSessionState(sessionId, planName)

    const parts: string[] = []

    parts.push(`# Session Recovery - ${planName}`)
    parts.push(
      `\nRecovery Source: ${getRecoverySourceLabel(snapshot.recoveryContext.recoverySource)} · ${snapshot.recoveryContext.recoveryStage}`
    )
    parts.push(
      `\nProject: ${snapshot.projectState.completionPercentage} complete (${snapshot.projectState.completedTasks}/${snapshot.projectState.totalTasks} tasks)`
    )
    parts.push(`Current Phase: ${snapshot.projectState.currentPhase}`)

    if (snapshot.projectState.blockers.length > 0) {
      parts.push(`\n## Blockers:\n${snapshot.projectState.blockers.map(b => `- ${b}`).join('\n')}`)
    }

    if (snapshot.todoState.incompleteTodos.length > 0) {
      parts.push(`\n## Pending TODOs (${snapshot.todoState.incompleteTodos.length}):`)
      snapshot.todoState.incompleteTodos.slice(0, 5).forEach(todo => {
        parts.push(`- [${todo.status}] ${todo.content} (${todo.priority})`)
      })
    }

    if (snapshot.planState.nextActionableTasks.length > 0) {
      parts.push(`\n## Next Tasks:`)
      snapshot.planState.nextActionableTasks.slice(0, 3).forEach(task => {
        parts.push(`- Task ${task.id}: ${task.description}`)
      })
    }

    if (snapshot.recoveryContext.nextSteps.length > 0) {
      parts.push(`\n## Suggested Action:\n${snapshot.recoveryContext.nextSteps.join('\n')}`)
    }

    parts.push(`\nResume Reason: ${getResumeReasonLabel(snapshot.recoveryContext.resumeReason)}`)

    return parts.join('\n')
  }

  // State analysis
  async detectInterruption(sessionId: string): Promise<boolean> {
    const todoService = TodoTrackingService.getInstance()
    const inProgressTodos = await todoService.getTodosByStatus('in_progress', sessionId)

    // If there are TODOs marked "in_progress", session was likely interrupted
    return inProgressTodos.length > 0
  }

  async calculateProgress(
    _planName: string
  ): Promise<{ completed: number; total: number; percentage: string }> {
    const boulderService = BoulderStateService.getInstance()
    const state = await boulderService.getState()
    return {
      completed: state.completed_tasks,
      total: state.total_tasks,
      percentage: state.completion_percentage
    }
  }

  async getNextActionableTasks(planName: string, limit: number = 5): Promise<PlanTask[]> {
    const planService = PlanFileService.getInstance()
    const tasks = await planService.parsePlan(planName)
    return tasks.filter(t => !t.completed).slice(0, limit)
  }

  private determineResumeReason(
    incompleteTodos: TodoItem[],
    hasPendingPlanTasks: boolean,
    interrupted: boolean
  ): ResumeReason {
    if (interrupted) return 'interrupted-tasks'
    if (incompleteTodos.length > 0) return deriveTodoResumeReason(incompleteTodos)
    if (hasPendingPlanTasks) return derivePlanResumeReason(true)
    return 'no-pending-work'
  }

  private generateNextSteps(
    currentPhaseTasks: PlanTask[],
    incompleteTodos: TodoItem[],
    nextActionable: PlanTask[]
  ): string[] {
    const steps: string[] = []

    // 1. Finish in-progress or pending todos
    if (incompleteTodos.length > 0) {
      steps.push(`Complete ${incompleteTodos.length} pending TODO items`)
    }

    // 2. Continue current phase
    if (currentPhaseTasks.length > 0) {
      steps.push(`Continue work on ${currentPhaseTasks.length} tasks in current phase`)
    } else if (nextActionable.length > 0) {
      steps.push(`Start next task: ${nextActionable[0].id} - ${nextActionable[0].description}`)
    }

    if (steps.length === 0) {
      steps.push('Review project plan for next phase')
    }

    return steps
  }

  // Validation
  private validateSnapshot(snapshot: SessionSnapshot): boolean {
    if (!snapshot.sessionId || !snapshot.planName || !snapshot.capturedAt) {
      return false
    }
    return true
  }

  private async hydrateSnapshotsFromDatabase(): Promise<void> {
    const db = DatabaseService.getInstance().getClient()
    const states = await db.sessionState.findMany({
      select: {
        sessionId: true,
        context: true
      }
    })

    for (const state of states) {
      const sessionSnapshot =
        state.context && typeof state.context === 'object'
          ? (state.context as Record<string, unknown>).sessionSnapshot
          : null

      if (!sessionSnapshot || typeof sessionSnapshot !== 'object') {
        continue
      }

      const snapshot = this.deserializeSnapshot(sessionSnapshot as Record<string, unknown>)
      if (!this.validateSnapshot(snapshot)) {
        continue
      }

      this.snapshots.set(state.sessionId, snapshot)
    }
  }

  private registerTaskStatusListeners(): void {
    const trackedEvents: WorkflowEvent['type'][] = [
      'task:assigned',
      'task:started',
      'task:completed',
      'task:failed'
    ]

    for (const eventType of trackedEvents) {
      workflowEvents.on(eventType, event => {
        const sessionId = this.extractSessionId(event)
        if (!sessionId) {
          return
        }

        void this.captureAndPersistSessionState(sessionId).catch(error => {
          console.warn(
            `[SessionStateRecovery] Failed to persist snapshot for ${sessionId} on ${event.type}:`,
            error
          )
        })
      })
    }
  }

  private extractSessionId(event: WorkflowEvent): string | null {
    if (typeof event.data?.sessionId === 'string' && event.data.sessionId.trim().length > 0) {
      return event.data.sessionId
    }

    if (typeof event.workflowId === 'string' && event.workflowId.trim().length > 0) {
      return event.workflowId
    }

    return null
  }

  private async resolvePlanName(planName?: string): Promise<string | null> {
    if (typeof planName === 'string' && planName.trim().length > 0) {
      return planName
    }

    const state = await BoulderStateService.getInstance().getState()
    if (typeof state.active_plan === 'string' && state.active_plan.trim().length > 0) {
      return state.active_plan
    }

    return null
  }

  private serializeSnapshot(snapshot: SessionSnapshot): SerializedSessionSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as SerializedSessionSnapshot
  }

  private deserializeSnapshot(raw: Record<string, unknown>): SessionSnapshot {
    const serialized = raw as SerializedSessionSnapshot

    return {
      ...serialized,
      todoState: {
        ...serialized.todoState,
        incompleteTodos: (serialized.todoState?.incompleteTodos || []).map(todo => ({
          ...todo,
          createdAt: new Date(todo.createdAt),
          updatedAt: new Date(todo.updatedAt)
        }))
      }
    }
  }
}

export const sessionStateRecoveryService = SessionStateRecoveryService.getInstance()

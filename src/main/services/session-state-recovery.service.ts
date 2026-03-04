import { BoulderStateService } from './boulder-state.service'
import { PlanFileService, PlanTask } from './plan-file.service'
import { TodoTrackingService, TodoItem, TodoStats } from './todo-tracking.service'

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
    resumeReason: string
    interruptionDetected: boolean
    lastActivity: string
    nextSteps: string[]
  }
}

export interface RecoveryContext {
  canResume: boolean
  reason: string
  incompleteTasks: number
  nextTask: PlanTask | null
  todosPending: number
  suggestedAction: string
  resumePrompt: string
}

export class SessionStateRecoveryService {
  private static instance: SessionStateRecoveryService | null = null
  // In-memory storage for snapshots (could be persisted to DB/File later)
  private snapshots: Map<string, SessionSnapshot> = new Map()

  private constructor() {}

  static getInstance(): SessionStateRecoveryService {
    if (!SessionStateRecoveryService.instance) {
      SessionStateRecoveryService.instance = new SessionStateRecoveryService()
    }
    return SessionStateRecoveryService.instance
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
    const resumeReason = this.determineResumeReason(
      incompleteTodos,
      currentPhaseTasks,
      interruptionDetected
    )
    const nextSteps = this.generateNextSteps(currentPhaseTasks, incompleteTodos, nextActionable)

    // Build recovery context
    const recoveryContext = {
      shouldResume:
        incompleteTodos.length > 0 || currentPhaseTasks.length > 0 || interruptionDetected,
      resumeReason,
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

  async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.sessionId, snapshot)
  }

  async loadSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    return this.snapshots.get(sessionId) || null
  }

  // Recovery operations
  async getRecoveryContext(sessionId: string, planName: string): Promise<RecoveryContext> {
    // We capture a fresh snapshot to get the current state
    const snapshot = await this.captureSessionState(sessionId, planName)

    const incompleteTasks = snapshot.planState.pendingTasks
    const todosPending = snapshot.todoState.pendingCount + snapshot.todoState.inProgressCount
    const nextTask = snapshot.planState.nextActionableTasks[0] || null

    const canResume = snapshot.recoveryContext.shouldResume
    const reason = snapshot.recoveryContext.resumeReason

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
    currentPhaseTasks: PlanTask[],
    interrupted: boolean
  ): string {
    if (interrupted) return 'Session was interrupted (in-progress tasks detected)'
    if (incompleteTodos.length > 0) return 'Pending TODO items found'
    if (currentPhaseTasks.length > 0) return 'Incomplete tasks in current phase'
    return 'No active work detected'
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
}

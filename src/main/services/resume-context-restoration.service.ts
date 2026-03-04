import { BoulderStateService } from './boulder-state.service'
import { PlanTask } from './plan-file.service'
import { SessionIdleDetectionService } from './session-idle-detection.service'
import { SessionSnapshot, SessionStateRecoveryService } from './session-state-recovery.service'
import { TodoIncompleteDetectionService } from './todo-incomplete-detection.service'
import { TodoItem } from './todo-tracking.service'

export interface ResumeContext {
  sessionId: string
  planName: string
  generatedAt: string

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

    const nextSteps = await this.getNextSteps(sessionId, planName)
    const resumePrompt = await this.buildResumePrompt(sessionId, planName, nextSteps)

    return {
      sessionId,
      planName,
      generatedAt: new Date().toISOString(),
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
      resumePrompt,
      nextSteps
    }
  }

  async buildResumePrompt(
    sessionId: string,
    planName: string,
    precalculatedNextSteps?: string[]
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

    const parts = []

    parts.push('# Session Resume')
    parts.push(`\nSession has been idle for ${Math.floor(idleDuration / 60000)} minutes.`)
    parts.push(
      `\nProject Progress: ${boulderState.completion_percentage} (${boulderState.completed_tasks}/${boulderState.total_tasks})`
    )
    if (boulderState.current_phase) {
      parts.push(`Current Phase: ${boulderState.current_phase}`)
    }

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
}

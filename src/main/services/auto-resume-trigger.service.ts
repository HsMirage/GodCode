import { SessionIdleDetectionService } from './session-idle-detection.service'
import { TodoIncompleteDetectionService } from './todo-incomplete-detection.service'

export interface ResumeDecision {
  shouldResume: boolean
  reason: string
  idleDuration: number
  incompleteTodos: number
  incompletePlanTasks: number
  confidence: number // 0-1 score
}

export interface ResumeConfig {
  minIdleDurationMs: number
  requireIncompleteTodos: boolean
  requireIncompletePlanTasks: boolean
}

export class AutoResumeTriggerService {
  private static instance: AutoResumeTriggerService | null = null
  private config: ResumeConfig
  private lastResumeTime: Map<string, Date>

  private constructor() {
    this.config = {
      minIdleDurationMs: 5 * 60 * 1000, // 5 minutes default
      requireIncompleteTodos: false,
      requireIncompletePlanTasks: false
    }
    this.lastResumeTime = new Map()
  }

  static getInstance(): AutoResumeTriggerService {
    if (!AutoResumeTriggerService.instance) {
      AutoResumeTriggerService.instance = new AutoResumeTriggerService()
    }
    return AutoResumeTriggerService.instance
  }

  setConfig(config: Partial<ResumeConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): ResumeConfig {
    return { ...this.config }
  }

  async shouldTriggerResume(sessionId: string, planName: string): Promise<ResumeDecision> {
    const idleService = SessionIdleDetectionService.getInstance()
    const incompleteService = TodoIncompleteDetectionService.getInstance()

    // Get current state
    const isIdle = await idleService.isSessionIdle(sessionId, this.config.minIdleDurationMs)
    const idleDuration = await idleService.getIdleDuration(sessionId)
    const incompleteWork = await incompleteService.detectIncompleteWork(sessionId, planName)

    // Decision criteria
    const conditions = {
      idle: isIdle,
      hasTodos: incompleteWork.incompleteTodos.length > 0,
      hasPlanTasks: incompleteWork.incompletePlanTasks.length > 0
    }

    let shouldResume = conditions.idle
    let reason = ''
    let confidence = 0

    if (!conditions.idle) {
      shouldResume = false
      reason = 'Session is still active'
      confidence = 0
    } else if (this.config.requireIncompleteTodos && !conditions.hasTodos) {
      shouldResume = false
      reason = 'No incomplete TODOs'
      confidence = 0.3
    } else if (this.config.requireIncompletePlanTasks && !conditions.hasPlanTasks) {
      shouldResume = false
      reason = 'No incomplete plan tasks'
      confidence = 0.3
    } else {
      // Basic requirements met
      // If we have NO work at all, maybe we shouldn't resume unless configured otherwise?
      // Usually auto-resume implies there IS work to do.
      if (!conditions.hasTodos && !conditions.hasPlanTasks) {
        // Even if not strictly required by config, resuming with NO work is usually pointless
        // But maybe the user just wants to be prompted?
        // Let's assume low confidence if no work found but idle.
        shouldResume = true // strictly following "idle" trigger
        reason = `Idle for ${Math.floor(idleDuration / 60000)}m (No detected work)`
        confidence = 0.2 // Low confidence if no work
      } else {
        shouldResume = true
        reason = `Idle for ${Math.floor(idleDuration / 60000)}m with ${incompleteWork.totalIncomplete} incomplete items`

        // Calculate confidence
        // Idle score: increases with idle time, max at 30 mins
        const idleScore = Math.min(idleDuration / (30 * 60 * 1000), 1)

        // Work score: increases with amount of work, max at 10 items
        const workScore = Math.min(incompleteWork.totalIncomplete / 10, 1)

        confidence = (idleScore + workScore) / 2
      }
    }

    return {
      shouldResume,
      reason,
      idleDuration,
      incompleteTodos: incompleteWork.incompleteTodos.length,
      incompletePlanTasks: incompleteWork.incompletePlanTasks.length,
      confidence
    }
  }

  /**
   * Wrapper around shouldTriggerResume that returns just boolean,
   * but meant for simple checks.
   */
  async evaluateResumeConditions(sessionId: string, planName: string): Promise<boolean> {
    const decision = await this.shouldTriggerResume(sessionId, planName)
    return decision.shouldResume
  }

  /**
   * Alias for shouldTriggerResume for consistent naming with other services if needed
   */
  async getResumeDecision(sessionId: string, planName: string): Promise<ResumeDecision> {
    return this.shouldTriggerResume(sessionId, planName)
  }

  preventDuplicateResume(sessionId: string, cooldownMs: number): boolean {
    const lastResume = this.lastResumeTime.get(sessionId)
    if (!lastResume) return false // No previous resume, so don't prevent

    const timeSinceResume = Date.now() - lastResume.getTime()
    return timeSinceResume < cooldownMs
  }

  recordResume(sessionId: string): void {
    this.lastResumeTime.set(sessionId, new Date())
  }
}

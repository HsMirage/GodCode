import { SessionIdleDetectionService } from './session-idle-detection.service'
import { ResumeContextRestorationService } from './resume-context-restoration.service'
import { sessionRecoveryExecutorService } from './session-recovery-executor.service'
import {
  createRecoveryTrackingMetadata,
  type RecoveryTrackingMetadata
} from '@/shared/recovery-contract'

export interface ResumeDecision {
  shouldResume: boolean
  reason: string
  idleDuration: number
  incompleteTodos: number
  incompletePlanTasks: number
  confidence: number // 0-1 score
  recoveryContext: RecoveryTrackingMetadata
}

export interface ResumeConfig {
  minIdleDurationMs: number
  requireIncompleteTodos: boolean
  requireIncompletePlanTasks: boolean
}

export interface RecoveryCompletionResult {
  sessionId: string
  messageCount: number
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
    const contextService = ResumeContextRestorationService.getInstance()

    // Get current state
    const isIdle = await idleService.isSessionIdle(sessionId, this.config.minIdleDurationMs)
    const idleDuration = await idleService.getIdleDuration(sessionId)
    const resumeContext = await contextService.generateResumeContext(sessionId, planName)
    const incompleteTodos = resumeContext.workStatus.incompleteTodos.length
    const incompletePlanTasks = resumeContext.workStatus.incompletePlanTasks.length
    const totalIncomplete = incompleteTodos + incompletePlanTasks

    // Decision criteria
    const conditions = {
      idle: isIdle,
      hasTodos: incompleteTodos > 0,
      hasPlanTasks: incompletePlanTasks > 0,
      canResume: resumeContext.canResume
    }

    let shouldResume = conditions.idle
    let reason = ''
    let confidence = 0
    let recoveryContext: RecoveryTrackingMetadata

    if (!conditions.idle) {
      shouldResume = false
      reason = 'Session is still active'
      confidence = 0
      recoveryContext = createRecoveryTrackingMetadata({
        recoverySource: 'auto-resume',
        recoveryStage: 'detected',
        resumeReason: 'session-active',
        resumeAction: 'none'
      })
    } else if (this.config.requireIncompleteTodos && !conditions.hasTodos) {
      shouldResume = false
      reason = 'No incomplete TODOs'
      confidence = 0.3
      recoveryContext = createRecoveryTrackingMetadata({
        recoverySource: 'auto-resume',
        recoveryStage: 'detected',
        resumeReason: conditions.hasPlanTasks ? 'pending-plan-tasks' : 'no-pending-work',
        resumeAction: 'none'
      })
    } else if (this.config.requireIncompletePlanTasks && !conditions.hasPlanTasks) {
      shouldResume = false
      reason = 'No incomplete plan tasks'
      confidence = 0.3
      recoveryContext = createRecoveryTrackingMetadata({
        recoverySource: 'auto-resume',
        recoveryStage: 'detected',
        resumeReason: conditions.hasTodos ? resumeContext.recovery.resumeReason : 'no-pending-work',
        resumeAction: 'none'
      })
    } else if (!conditions.canResume) {
      shouldResume = false
      reason = `Idle for ${Math.floor(idleDuration / 60000)}m but no resumable work detected`
      confidence = 0.1
      recoveryContext = createRecoveryTrackingMetadata({
        recoverySource: 'auto-resume',
        recoveryStage: 'detected',
        resumeReason: 'no-pending-work',
        resumeAction: 'none'
      })
    } else {
      shouldResume = true
      reason = `Idle for ${Math.floor(idleDuration / 60000)}m with ${totalIncomplete} incomplete items`

      const idleScore = Math.min(idleDuration / (30 * 60 * 1000), 1)
      const workScore = Math.min(totalIncomplete / 10, 1)

      confidence = (idleScore + workScore) / 2
      recoveryContext = createRecoveryTrackingMetadata({
        recoverySource: 'auto-resume',
        recoveryStage: 'detected',
        resumeReason: resumeContext.recovery.resumeReason,
        resumeAction: 'auto-send-resume-prompt'
      })
    }

    return {
      shouldResume,
      reason,
      idleDuration,
      incompleteTodos,
      incompletePlanTasks,
      confidence,
      recoveryContext
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

  async completeRecovery(sessionId: string): Promise<RecoveryCompletionResult> {
    const messages = await sessionRecoveryExecutorService.recoverMessages(sessionId, {
      emit: 'recovered'
    })

    this.recordResume(sessionId)

    return {
      sessionId,
      messageCount: messages.length
    }
  }
}

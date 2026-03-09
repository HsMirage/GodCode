import {
  calculateBackoffDelay,
  classifyError,
  isRetryable,
  NonRetryableErrorType,
  type ErrorClassification
} from '../workforce/retry'
import type { RecoveryFailureClass } from '../workforce/recovery-types'

export type UnifiedRetryScope = 'llm' | 'tool' | 'workflow-recovery'

export type UnifiedRetryNextAction =
  | 'retry'
  | 'switch-model'
  | 'switch-route'
  | 'manual-takeover'
  | 'fail-fast'

export interface UnifiedRetryDecision {
  scope: UnifiedRetryScope
  classification: ErrorClassification
  recoveryFailureClass?: RecoveryFailureClass
  retryable: boolean
  retryAllowed: boolean
  attempt: number
  maxAttempts: number
  delayMs: number
  nextAction: UnifiedRetryNextAction
  manualTakeoverRequired: boolean
  allowModelFallback: boolean
  allowAgentFallback: boolean
  allowCategoryFallback: boolean
}

function normalizeAttempts(input: { attempt?: number; maxRetries?: number; maxAttempts?: number }): {
  attempt: number
  maxAttempts: number
} {
  const attempt = Math.max(1, Math.trunc(input.attempt ?? 1))
  const maxAttemptsFromRetries = Math.max(1, Math.trunc((input.maxRetries ?? 0) + 1))
  const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts ?? maxAttemptsFromRetries))
  return { attempt, maxAttempts }
}

export function classifyRecoveryFailureFromError(error: unknown): RecoveryFailureClass {
  const classification = classifyError(error)
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase()

  if (classification === NonRetryableErrorType.FORBIDDEN || /permission|forbidden|403|denied/.test(message)) {
    return 'permission'
  }

  if (classification === NonRetryableErrorType.AUTH_ERROR || /api key|auth|unauthorized|401|config/.test(message)) {
    return 'config'
  }

  if (/dependency|module not found|cannot find module|missing package|install/.test(message)) {
    return 'dependency'
  }

  if (/assert|typecheck|compile|syntax|validation failed|test failed/.test(message)) {
    return 'implementation'
  }

  if (isRetryable(classification)) {
    return 'transient'
  }

  return 'unknown'
}

export function buildUnifiedRetryDecision(input: {
  scope: UnifiedRetryScope
  error: unknown
  attempt?: number
  maxRetries?: number
  maxAttempts?: number
  baseDelayMs?: number
}): UnifiedRetryDecision {
  const { attempt, maxAttempts } = normalizeAttempts(input)
  const classification = classifyError(input.error)
  const retryable = isRetryable(classification)
  const retryAllowed = retryable && attempt < maxAttempts
  const delayMs = retryAllowed
    ? calculateBackoffDelay(attempt, {
        maxRetries: Math.max(0, maxAttempts - 1),
        baseDelayMs: Math.max(500, Math.trunc(input.baseDelayMs ?? 1000)),
        maxDelayMs: 30_000,
        jitterFactor: 0,
        enableLogging: false
      })
    : 0

  if (input.scope === 'workflow-recovery') {
    const recoveryFailureClass = classifyRecoveryFailureFromError(input.error)
    const routeRecoverable = recoveryFailureClass !== 'permission' && recoveryFailureClass !== 'unknown'
    const nextAction: UnifiedRetryNextAction =
      recoveryFailureClass === 'transient' && retryAllowed
        ? 'retry'
        : routeRecoverable
          ? 'switch-route'
          : 'manual-takeover'

    return {
      scope: input.scope,
      classification,
      recoveryFailureClass,
      retryable,
      retryAllowed,
      attempt,
      maxAttempts,
      delayMs,
      nextAction,
      manualTakeoverRequired: nextAction === 'manual-takeover',
      allowModelFallback: recoveryFailureClass === 'transient',
      allowAgentFallback: routeRecoverable,
      allowCategoryFallback: routeRecoverable
    }
  }

  if (input.scope === 'llm') {
    const nextAction: UnifiedRetryNextAction = retryAllowed
      ? 'retry'
      : retryable
        ? 'switch-model'
        : 'manual-takeover'

    return {
      scope: input.scope,
      classification,
      retryable,
      retryAllowed,
      attempt,
      maxAttempts,
      delayMs,
      nextAction,
      manualTakeoverRequired: nextAction === 'manual-takeover',
      allowModelFallback: retryable,
      allowAgentFallback: false,
      allowCategoryFallback: false
    }
  }

  return {
    scope: input.scope,
    classification,
    retryable,
    retryAllowed,
    attempt,
    maxAttempts,
    delayMs,
    nextAction: retryable ? 'retry' : 'manual-takeover',
    manualTakeoverRequired: !retryable,
    allowModelFallback: false,
    allowAgentFallback: false,
    allowCategoryFallback: false
  }
}

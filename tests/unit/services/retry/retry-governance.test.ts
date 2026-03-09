import { describe, expect, it } from 'vitest'
import {
  buildUnifiedRetryDecision,
  classifyRecoveryFailureFromError
} from '@/main/services/retry/retry-governance'

describe('retry-governance', () => {
  it('classifies retryable llm failures with deterministic backoff', () => {
    const decision = buildUnifiedRetryDecision({
      scope: 'llm',
      error: new Error('Network timeout while calling provider'),
      attempt: 1,
      maxRetries: 2,
      baseDelayMs: 1000
    })

    expect(decision.classification).toBe('NETWORK_ERROR')
    expect(decision.retryable).toBe(true)
    expect(decision.retryAllowed).toBe(true)
    expect(decision.delayMs).toBe(1000)
    expect(decision.nextAction).toBe('retry')
  })

  it('suggests model fallback after llm retries are exhausted', () => {
    const decision = buildUnifiedRetryDecision({
      scope: 'llm',
      error: new Error('service unavailable 503'),
      attempt: 2,
      maxRetries: 1,
      baseDelayMs: 1000
    })

    expect(decision.classification).toBe('SERVICE_UNAVAILABLE')
    expect(decision.retryAllowed).toBe(false)
    expect(decision.nextAction).toBe('switch-model')
    expect(decision.allowModelFallback).toBe(true)
  })

  it('keeps workflow recovery classification aligned with retry classification', () => {
    expect(classifyRecoveryFailureFromError(new Error('api key invalid'))).toBe('config')
    expect(classifyRecoveryFailureFromError(new Error('403 forbidden'))).toBe('permission')

    const decision = buildUnifiedRetryDecision({
      scope: 'workflow-recovery',
      error: new Error('test failed on CI')
    })

    expect(decision.recoveryFailureClass).toBe('implementation')
    expect(decision.nextAction).toBe('switch-route')
    expect(decision.manualTakeoverRequired).toBe(false)
  })

  it('marks tool permission failures for manual takeover', () => {
    const decision = buildUnifiedRetryDecision({
      scope: 'tool',
      error: new Error('permission denied by sandbox')
    })

    expect(decision.classification).toBe('FORBIDDEN')
    expect(decision.retryable).toBe(false)
    expect(decision.nextAction).toBe('manual-takeover')
  })
})

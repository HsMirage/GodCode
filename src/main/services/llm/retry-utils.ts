import {
  buildUnifiedRetryDecision,
  type UnifiedRetryDecision
} from '../retry/retry-governance'

export function getLLMRetryDecision(input: {
  error: unknown
  attempt?: number
  maxRetries?: number
  baseDelayMs?: number
}): UnifiedRetryDecision {
  return buildUnifiedRetryDecision({
    scope: 'llm',
    error: input.error,
    attempt: input.attempt,
    maxRetries: input.maxRetries,
    baseDelayMs: input.baseDelayMs
  })
}

export const isRetryableError = (error: unknown): boolean => getLLMRetryDecision({ error }).retryable

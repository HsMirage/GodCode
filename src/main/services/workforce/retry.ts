/**
 * Task Retry Mechanism
 *
 * Provides exponential backoff retry logic for failed tasks.
 * Identifies retryable failure types and tracks retry state.
 */

import { LoggerService } from '../logger'

/**
 * Error types that can be retried
 */
export enum RetryableErrorType {
  /** Network timeout or connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Rate limit exceeded (429) */
  RATE_LIMIT = 'RATE_LIMIT',
  /** Service temporarily unavailable (503) */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Gateway timeout (504) */
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  /** Internal server error (500) */
  SERVER_ERROR = 'SERVER_ERROR',
  /** Request timeout */
  TIMEOUT = 'TIMEOUT',
  /** Temporary resource unavailable */
  RESOURCE_BUSY = 'RESOURCE_BUSY'
}

/**
 * Error types that should NOT be retried
 */
export enum NonRetryableErrorType {
  /** Invalid input or parameters */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Authentication failed */
  AUTH_ERROR = 'AUTH_ERROR',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Insufficient permissions */
  FORBIDDEN = 'FORBIDDEN',
  /** Request entity too large */
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  /** Content policy violation */
  CONTENT_POLICY = 'CONTENT_POLICY',
  /** User-initiated cancellation/abort */
  CANCELLED = 'CANCELLED',
  /** Unknown or unclassified error */
  UNKNOWN = 'UNKNOWN'
}

export type ErrorClassification = RetryableErrorType | NonRetryableErrorType

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number
  /** Jitter factor to randomize delays (0-1, default: 0.1) */
  jitterFactor: number
  /** Whether to log retry attempts (default: true) */
  enableLogging: boolean
}

export interface RetryExecutionOptions extends Partial<RetryConfig> {
  onStateChange?: (state: RetryState) => void | Promise<void>
}

/**
 * State tracking for a single task's retry attempts
 */
export interface RetryState {
  /** Task identifier */
  taskId: string
  /** Current attempt number (starts at 1) */
  attemptNumber: number
  /** Maximum attempts allowed */
  maxAttempts: number
  /** Timestamp of first attempt */
  firstAttemptAt: Date
  /** Timestamp of last attempt */
  lastAttemptAt: Date
  /** Errors from each attempt */
  errors: Array<{
    attemptNumber: number
    error: string
    errorType: ErrorClassification
    timestamp: Date
  }>
  /** Current status */
  status: 'pending' | 'retrying' | 'exhausted' | 'succeeded'
}

/**
 * Result of a retry attempt
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean
  /** Result value if successful */
  value?: T
  /** Final error if all retries failed */
  error?: Error
  /** Total number of attempts made */
  attempts: number
  /** Total time spent including delays */
  totalTimeMs: number
  /** Full retry state */
  state: RetryState
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
  enableLogging: true
}

/**
 * Classifies an error to determine if it should be retried
 */
export function classifyError(error: unknown): ErrorClassification {
  if (!error) {
    return NonRetryableErrorType.UNKNOWN
  }

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const errorName = error instanceof Error ? error.name.toLowerCase() : ''

  // Explicit user cancellation should never be retried.
  if (
    errorMessage.includes('cancelled by user') ||
    errorMessage.includes('canceled by user') ||
    errorMessage.includes('workflow cancelled by user') ||
    errorMessage.includes('request aborted by user')
  ) {
    return NonRetryableErrorType.CANCELLED
  }

  if (errorMessage.includes('returned empty output') || errorMessage.includes('empty output')) {
    return RetryableErrorType.RESOURCE_BUSY
  }

  if (
    errorMessage.includes('non-actionable output') ||
    errorMessage.includes('status-only-placeholder') ||
    errorMessage.includes('meta-process-output') ||
    errorMessage.includes('missing-execution-evidence')
  ) {
    return RetryableErrorType.RESOURCE_BUSY
  }

  // Generic aborts are usually transport/runtime aborts (e.g. timeout controller), not user intent.
  if (errorName.includes('abort') || errorMessage.includes('aborted') || errorMessage.includes('abort')) {
    return RetryableErrorType.TIMEOUT
  }

  // Check for network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('socket hang up') ||
    errorName.includes('fetcherror')
  ) {
    return RetryableErrorType.NETWORK_ERROR
  }

  // Check for timeout errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorName.includes('timeout')
  ) {
    return RetryableErrorType.TIMEOUT
  }

  // Check for rate limiting
  if (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests') ||
    errorMessage.includes('429')
  ) {
    return RetryableErrorType.RATE_LIMIT
  }

  // Check for service unavailable
  if (
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('503')
  ) {
    return RetryableErrorType.SERVICE_UNAVAILABLE
  }

  // Check for gateway timeout
  if (errorMessage.includes('504') || errorMessage.includes('gateway timeout')) {
    return RetryableErrorType.GATEWAY_TIMEOUT
  }

  // Check for server errors
  if (
    errorMessage.includes('500') ||
    errorMessage.includes('internal server error') ||
    errorMessage.includes('server error')
  ) {
    return RetryableErrorType.SERVER_ERROR
  }

  // Check for resource busy
  if (
    errorMessage.includes('busy') ||
    errorMessage.includes('try again later') ||
    errorMessage.includes('overloaded')
  ) {
    return RetryableErrorType.RESOURCE_BUSY
  }

  // Check for authentication errors (non-retryable)
  if (
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('401') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('invalid api key')
  ) {
    return NonRetryableErrorType.AUTH_ERROR
  }

  // Check for forbidden (non-retryable)
  if (errorMessage.includes('forbidden') || errorMessage.includes('403')) {
    return NonRetryableErrorType.FORBIDDEN
  }

  // Check for not found (non-retryable)
  if (errorMessage.includes('not found') || errorMessage.includes('404')) {
    return NonRetryableErrorType.NOT_FOUND
  }

  // Check for validation errors (non-retryable)
  if (
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('bad request') ||
    errorMessage.includes('400')
  ) {
    return NonRetryableErrorType.VALIDATION_ERROR
  }

  // Check for payload too large (non-retryable)
  if (errorMessage.includes('413') || errorMessage.includes('too large')) {
    return NonRetryableErrorType.PAYLOAD_TOO_LARGE
  }

  // Check for content policy (non-retryable)
  if (
    errorMessage.includes('content policy') ||
    errorMessage.includes('safety') ||
    errorMessage.includes('content filter')
  ) {
    return NonRetryableErrorType.CONTENT_POLICY
  }

  return NonRetryableErrorType.UNKNOWN
}

/**
 * Determines if an error classification is retryable
 */
export function isRetryable(classification: ErrorClassification): boolean {
  return Object.values(RetryableErrorType).includes(classification as RetryableErrorType)
}

/**
 * Calculates the delay before the next retry using exponential backoff
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_CONFIG
): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attemptNumber - 1)

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs)

  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1)

  return Math.max(0, Math.round(cappedDelay + jitter))
}

/**
 * Creates a new retry state for a task
 */
export function createRetryState(taskId: string, maxAttempts: number): RetryState {
  const now = new Date()
  return {
    taskId,
    attemptNumber: 1,
    maxAttempts,
    firstAttemptAt: now,
    lastAttemptAt: now,
    errors: [],
    status: 'pending'
  }
}

/**
 * Task Retry Service
 *
 * Manages retry logic with exponential backoff for failed tasks.
 */
export class TaskRetryService {
  private logger = LoggerService.getInstance().getLogger()
  private config: RetryConfig
  private retryStates = new Map<string, RetryState>()

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Executes an operation with retry logic
   */
  async executeWithRetry<T>(
    taskId: string,
    operation: () => Promise<T>,
    options: RetryExecutionOptions = {}
  ): Promise<RetryResult<T>> {
    const { onStateChange, ...retryConfig } = options
    const config = { ...this.config, ...retryConfig }
    const maxAttempts = config.maxRetries + 1 // maxRetries + initial attempt
    const startTime = Date.now()

    const state = createRetryState(taskId, maxAttempts)
    this.retryStates.set(taskId, state)
    if (onStateChange) {
      await onStateChange(state)
    }

    if (config.enableLogging) {
      this.logger.info('Starting task with retry support', {
        taskId,
        maxAttempts
      })
    }

    while (state.attemptNumber <= maxAttempts) {
      try {
        if (config.enableLogging && state.attemptNumber > 1) {
          this.logger.info('Retrying task', {
            taskId,
            attempt: state.attemptNumber,
            maxAttempts
          })
        }

        state.lastAttemptAt = new Date()
        const result = await operation()

        // Success
        state.status = 'succeeded'
        this.retryStates.set(taskId, state)
        if (onStateChange) {
          await onStateChange(state)
        }

        if (config.enableLogging) {
          this.logger.info('Task succeeded', {
            taskId,
            attempts: state.attemptNumber,
            totalTimeMs: Date.now() - startTime
          })
        }

        return {
          success: true,
          value: result,
          attempts: state.attemptNumber,
          totalTimeMs: Date.now() - startTime,
          state
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorType = classifyError(error)

        // Record the error
        state.errors.push({
          attemptNumber: state.attemptNumber,
          error: errorMessage,
          errorType,
          timestamp: new Date()
        })

        if (config.enableLogging) {
          this.logger.warn('Task attempt failed', {
            taskId,
            attempt: state.attemptNumber,
            maxAttempts,
            errorType,
            error: errorMessage
          })
        }

        // Check if error is retryable
        if (!isRetryable(errorType)) {
          if (config.enableLogging) {
            this.logger.error('Task failed with non-retryable error', {
              taskId,
              errorType,
              error: errorMessage
            })
          }

          state.status = 'exhausted'
          this.retryStates.set(taskId, state)
          if (onStateChange) {
            await onStateChange(state)
          }

          return {
            success: false,
            error: error instanceof Error ? error : new Error(errorMessage),
            attempts: state.attemptNumber,
            totalTimeMs: Date.now() - startTime,
            state
          }
        }

        // Check if we have more attempts
        if (state.attemptNumber >= maxAttempts) {
          if (config.enableLogging) {
            this.logger.error('Task exhausted all retry attempts', {
              taskId,
              attempts: state.attemptNumber,
              lastError: errorMessage
            })
          }

          state.status = 'exhausted'
          this.retryStates.set(taskId, state)
          if (onStateChange) {
            await onStateChange(state)
          }

          return {
            success: false,
            error: error instanceof Error ? error : new Error(errorMessage),
            attempts: state.attemptNumber,
            totalTimeMs: Date.now() - startTime,
            state
          }
        }

        // Calculate delay and wait
        const delay = calculateBackoffDelay(state.attemptNumber, config)

        if (config.enableLogging) {
          this.logger.info('Waiting before retry', {
            taskId,
            delayMs: delay,
            nextAttempt: state.attemptNumber + 1
          })
        }

        state.status = 'retrying'
        state.attemptNumber++
        this.retryStates.set(taskId, state)
        if (onStateChange) {
          await onStateChange(state)
        }

        await this.sleep(delay)
      }
    }

    // Should not reach here, but handle just in case
    state.status = 'exhausted'
    this.retryStates.set(taskId, state)
    if (onStateChange) {
      await onStateChange(state)
    }

    return {
      success: false,
      error: new Error('Unexpected retry loop exit'),
      attempts: state.attemptNumber,
      totalTimeMs: Date.now() - startTime,
      state
    }
  }

  /**
   * Gets the current retry state for a task
   */
  getRetryState(taskId: string): RetryState | undefined {
    return this.retryStates.get(taskId)
  }

  /**
   * Clears retry state for a task
   */
  clearRetryState(taskId: string): void {
    this.retryStates.delete(taskId)
  }

  /**
   * Gets all active retry states
   */
  getAllRetryStates(): Map<string, RetryState> {
    return new Map(this.retryStates)
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Gets current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Singleton instance
let retryServiceInstance: TaskRetryService | null = null

/**
 * Gets the singleton TaskRetryService instance
 */
export function getTaskRetryService(config?: Partial<RetryConfig>): TaskRetryService {
  if (!retryServiceInstance) {
    retryServiceInstance = new TaskRetryService(config)
  } else if (config) {
    retryServiceInstance.updateConfig(config)
  }
  return retryServiceInstance
}

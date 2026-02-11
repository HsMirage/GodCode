/**
 * Background Task Cancel
 *
 * Provides task cancellation functionality for the BackgroundTaskManager.
 */

import { backgroundTaskManager, type BackgroundTask } from './manager'
import { logger } from '../../../../shared/logger'

// ============================================================================
// Types
// ============================================================================

export interface CancelOptions {
  /** Signal to send (default: SIGTERM) */
  signal?: NodeJS.Signals
  /** Force kill timeout in ms (default: 5000) */
  forceKillTimeout?: number
  /** Whether to remove the task from registry after cancellation */
  removeAfterCancel?: boolean
}

export interface CancelResult {
  success: boolean
  taskId: string
  status: string
  error?: string
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface InternalTask {
  process: { killed: boolean; kill: (signal: string) => void } | null
  status: string
}

function getInternalTask(taskId: string): InternalTask | undefined {
  const internalTasks = (backgroundTaskManager as unknown as { tasks: Map<string, InternalTask> }).tasks
  return internalTasks.get(taskId)
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a task can be cancelled
 */
export function canCancel(taskId: string): boolean {
  const task = backgroundTaskManager.getTask(taskId)
  return task !== null && task.status === 'running'
}

/**
 * Send a signal to a running task
 */
export function sendSignal(taskId: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  const internalTask = getInternalTask(taskId)

  if (!internalTask?.process || internalTask.process.killed) {
    return false
  }

  try {
    internalTask.process.kill(signal)
    return true
  } catch {
    return false
  }
}

/**
 * Cancel a running background task
 */
export async function cancelTask(taskId: string, options: CancelOptions = {}): Promise<boolean> {
  const { signal = 'SIGTERM', forceKillTimeout = 5000 } = options

  const task = backgroundTaskManager.getTask(taskId)

  if (!task) {
    logger.warn('[cancelTask] Task not found', { taskId })
    return false
  }

  if (task.status !== 'running') {
    logger.warn('[cancelTask] Task is not running', { taskId, status: task.status })
    return false
  }

  try {
    const internalTask = getInternalTask(taskId)

    if (internalTask?.process && !internalTask.process.killed) {
      internalTask.process.kill(signal)

      // Force kill after timeout
      setTimeout(() => {
        if (internalTask.process && !internalTask.process.killed) {
          internalTask.process.kill('SIGKILL')
        }
      }, forceKillTimeout)

      internalTask.status = 'cancelled'
      logger.info('[cancelTask] Task cancelled', { taskId })
      return true
    }

    return false
  } catch (error) {
    logger.error('[cancelTask] Failed to cancel task', { taskId, error })
    return false
  }
}

/**
 * Cancel multiple tasks
 */
export async function cancelTasks(taskIds: string[], options: CancelOptions = {}): Promise<CancelResult[]> {
  const results: CancelResult[] = []

  for (const taskId of taskIds) {
    const task = backgroundTaskManager.getTask(taskId)
    const success = await cancelTask(taskId, options)

    results.push({
      success,
      taskId,
      status: task?.status || 'not_found',
      error: success ? undefined : 'Failed to cancel task'
    })
  }

  return results
}

/**
 * Cancel all running tasks
 */
export async function cancelAllTasks(options: CancelOptions = {}): Promise<CancelResult[]> {
  const runningTasks = backgroundTaskManager.getRunningTasks()
  const taskIds = runningTasks.map(t => t.id)
  return cancelTasks(taskIds, options)
}

/**
 * Cancel a task and remove it from the registry
 */
export async function cancelAndRemoveTask(taskId: string, options: CancelOptions = {}): Promise<boolean> {
  const cancelled = await cancelTask(taskId, options)

  if (cancelled) {
    // Wait a bit for the task to fully stop
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      backgroundTaskManager.removeTask(taskId)
    } catch {
      // Task might still be in running state, ignore
    }
  }

  return cancelled
}

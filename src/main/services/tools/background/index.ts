/**
 * Background Task Management Module
 *
 * Unified exports for background task management functionality:
 * - Task creation and lifecycle management
 * - Output buffering and streaming
 * - Task cancellation and cleanup
 */

// Manager
export {
  BackgroundTaskManager,
  backgroundTaskManager,
  type BackgroundTask,
  type TaskStatus,
  type TaskCreateOptions
} from './manager'

// Output
export {
  getTaskOutput,
  getOutputChunks,
  getOutputSize,
  clearOutputBuffer,
  clearCompletedOutputBuffers,
  formatOutput,
  getOutputSummary,
  initializeOutputBuffer,
  appendOutput,
  type TaskOutput,
  type OutputReadOptions,
  type OutputChunk
} from './output'

// Cancel
export {
  cancelTask,
  cancelTasks,
  cancelAllTasks,
  cancelAndRemoveTask,
  sendSignal,
  canCancel,
  type CancelOptions,
  type CancelResult
} from './cancel'

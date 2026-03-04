/**
 * Background Task Output Management
 *
 * Manages output buffering and retrieval for background tasks:
 * - Buffered stdout/stderr storage
 * - Output streaming
 * - Output truncation handling
 * - Output persistence (optional)
 */

import { backgroundTaskManager, type BackgroundTask } from './manager'

// ============================================================================
// Types
// ============================================================================

export interface TaskOutput {
  taskId: string
  stdout: string
  stderr: string
  combined: string
  bytesTotal: number
  truncated: boolean
  streaming: boolean
}

export interface OutputReadOptions {
  /** Read from specific offset (bytes) */
  offset?: number
  /** Maximum bytes to read */
  limit?: number
  /** Which stream to read */
  stream?: 'stdout' | 'stderr' | 'combined'
}

export interface OutputChunk {
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: Date
}

// ============================================================================
// Internal Storage
// ============================================================================

// Extended output storage with more details
interface OutputBuffer {
  taskId: string
  stdout: string[]
  stderr: string[]
  combined: string[]
  chunks: OutputChunk[]
  totalBytes: number
  maxBytes: number
  truncated: boolean
}

const outputBuffers = new Map<string, OutputBuffer>()
const DEFAULT_MAX_BYTES = 1024 * 1024 // 1MB

// ============================================================================
// Output Management Functions
// ============================================================================

/**
 * Initialize output buffer for a task
 */
export function initializeOutputBuffer(taskId: string, maxBytes?: number): void {
  if (outputBuffers.has(taskId)) {
    return // Already initialized
  }

  outputBuffers.set(taskId, {
    taskId,
    stdout: [],
    stderr: [],
    combined: [],
    chunks: [],
    totalBytes: 0,
    maxBytes: maxBytes || DEFAULT_MAX_BYTES,
    truncated: false
  })
}

/**
 * Append output to a task's buffer
 */
export function appendOutput(
  taskId: string,
  stream: 'stdout' | 'stderr',
  data: string
): void {
  let buffer = outputBuffers.get(taskId)

  if (!buffer) {
    initializeOutputBuffer(taskId)
    buffer = outputBuffers.get(taskId)!
  }

  if (buffer.truncated) {
    return // Already at max capacity
  }

  const dataBytes = Buffer.byteLength(data, 'utf8')

  // Check if we would exceed max
  if (buffer.totalBytes + dataBytes > buffer.maxBytes) {
    buffer.truncated = true
    const remaining = buffer.maxBytes - buffer.totalBytes
    if (remaining > 0) {
      // Append partial data
      const partialData = data.slice(0, remaining)
      addToBuffer(buffer, stream, partialData + '\n[Output truncated - exceeded limit]')
    }
    return
  }

  addToBuffer(buffer, stream, data)
}

function addToBuffer(buffer: OutputBuffer, stream: 'stdout' | 'stderr', data: string): void {
  const dataBytes = Buffer.byteLength(data, 'utf8')

  if (stream === 'stdout') {
    buffer.stdout.push(data)
  } else {
    buffer.stderr.push(data)
  }
  buffer.combined.push(data)

  buffer.chunks.push({
    stream,
    data,
    timestamp: new Date()
  })

  buffer.totalBytes += dataBytes
}

/**
 * Get output for a task
 */
export function getTaskOutput(taskId: string, options?: OutputReadOptions): TaskOutput {
  const buffer = outputBuffers.get(taskId)
  const task = backgroundTaskManager.getTask(taskId)

  if (!buffer) {
    return {
      taskId,
      stdout: '',
      stderr: '',
      combined: '',
      bytesTotal: 0,
      truncated: false,
      streaming: task?.status === 'running'
    }
  }

  const stream = options?.stream || 'combined'
  let content: string

  switch (stream) {
    case 'stdout':
      content = buffer.stdout.join('')
      break
    case 'stderr':
      content = buffer.stderr.join('')
      break
    case 'combined':
    default:
      content = buffer.combined.join('')
      break
  }

  // Apply offset and limit
  if (options?.offset !== undefined || options?.limit !== undefined) {
    const offset = options.offset || 0
    const limit = options.limit || content.length
    content = content.slice(offset, offset + limit)
  }

  return {
    taskId,
    stdout: buffer.stdout.join(''),
    stderr: buffer.stderr.join(''),
    combined: buffer.combined.join(''),
    bytesTotal: buffer.totalBytes,
    truncated: buffer.truncated,
    streaming: task?.status === 'running'
  }
}

/**
 * Get output chunks for a task (for streaming)
 */
export function getOutputChunks(
  taskId: string,
  afterIndex?: number
): { chunks: OutputChunk[]; nextIndex: number } {
  const buffer = outputBuffers.get(taskId)

  if (!buffer) {
    return { chunks: [], nextIndex: 0 }
  }

  const startIndex = afterIndex || 0
  const chunks = buffer.chunks.slice(startIndex)

  return {
    chunks,
    nextIndex: buffer.chunks.length
  }
}

/**
 * Get output size for a task
 */
export function getOutputSize(taskId: string): {
  total: number
  stdout: number
  stderr: number
  truncated: boolean
} {
  const buffer = outputBuffers.get(taskId)

  if (!buffer) {
    return { total: 0, stdout: 0, stderr: 0, truncated: false }
  }

  return {
    total: buffer.totalBytes,
    stdout: Buffer.byteLength(buffer.stdout.join(''), 'utf8'),
    stderr: Buffer.byteLength(buffer.stderr.join(''), 'utf8'),
    truncated: buffer.truncated
  }
}

/**
 * Clear output buffer for a task
 */
export function clearOutputBuffer(taskId: string): boolean {
  return outputBuffers.delete(taskId)
}

/**
 * Clear all output buffers for completed tasks
 */
export function clearCompletedOutputBuffers(): number {
  let cleared = 0

  for (const taskId of outputBuffers.keys()) {
    const task = backgroundTaskManager.getTask(taskId)
    if (!task || (task.status !== 'running' && task.status !== 'pending')) {
      outputBuffers.delete(taskId)
      cleared++
    }
  }

  return cleared
}

/**
 * Set up output listeners for task manager events
 */
export function setupOutputListeners(): void {
  backgroundTaskManager.on('task:output', (taskId: string, stream: 'stdout' | 'stderr', data: string) => {
    appendOutput(taskId, stream, data)
  })

  backgroundTaskManager.on('task:completed', (_task: BackgroundTask) => {
    // Keep buffer for a while after completion for retrieval
  })

  backgroundTaskManager.on('task:error', (_task: BackgroundTask) => {
    // Keep buffer for debugging
  })
}

// Initialize listeners
setupOutputListeners()

/**
 * Format output for display
 */
export function formatOutput(output: TaskOutput): string {
  const parts: string[] = []

  if (output.stdout) {
    parts.push(output.stdout)
  }

  if (output.stderr) {
    if (parts.length > 0) parts.push('\n')
    parts.push('[stderr]\n')
    parts.push(output.stderr)
  }

  if (output.truncated) {
    parts.push('\n\n[Output truncated]')
  }

  if (output.streaming) {
    parts.push('\n\n[Task still running...]')
  }

  return parts.join('')
}

/**
 * Get formatted output summary
 */
export function getOutputSummary(taskId: string): string {
  const output = getTaskOutput(taskId)
  const size = getOutputSize(taskId)

  const lines = [
    `Task: ${taskId}`,
    `Total output: ${formatBytes(size.total)}`,
    `  stdout: ${formatBytes(size.stdout)}`,
    `  stderr: ${formatBytes(size.stderr)}`,
    `Truncated: ${size.truncated ? 'Yes' : 'No'}`,
    `Streaming: ${output.streaming ? 'Yes' : 'No'}`
  ]

  return lines.join('\n')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

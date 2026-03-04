/**
 * Background Task Manager
 *
 * Manages long-running background tasks with:
 * - Task registration and lifecycle tracking
 * - Status monitoring
 * - Output buffering
 * - Graceful shutdown integration
 */

import { ChildProcess, spawn } from 'child_process'
import os from 'os'
import { EventEmitter } from 'events'
import { processCleanupService } from '../../process-cleanup.service'
import { logger } from '../../../../shared/logger'

// ============================================================================
// Types
// ============================================================================

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'interrupt'
  | 'cancelled'
  | 'timeout'

export interface BackgroundTask {
  id: string
  pid: number | null
  command: string
  description?: string
  cwd: string
  status: TaskStatus
  exitCode: number | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  metadata?: Record<string, unknown>
}

export interface TaskOutput {
  stdout: string
  stderr: string
  combined: string
  bytesRead: number
  truncated: boolean
}

export interface TaskCreateOptions {
  command: string
  cwd: string
  description?: string
  timeout?: number
  maxOutputBytes?: number
  metadata?: Record<string, unknown>
}

interface InternalTask extends BackgroundTask {
  process: ChildProcess | null
  stdout: string[]
  stderr: string[]
  combined: string[]
  totalBytes: number
  maxOutputBytes: number
  timeoutId: NodeJS.Timeout | null
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024 // 1MB
const MAX_TASKS = 100 // Maximum concurrent background tasks
const TASK_RETENTION_MS = 30 * 60 * 1000 // 30 minutes retention for completed tasks

// ============================================================================
// Manager Implementation
// ============================================================================

export class BackgroundTaskManager extends EventEmitter {
  private static instance: BackgroundTaskManager | null = null
  private tasks = new Map<string, InternalTask>()
  private cleanupInterval: NodeJS.Timeout | null = null

  private constructor() {
    super()
    this.startCleanupInterval()
    this.registerShutdownHook()
  }

  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager()
    }
    return BackgroundTaskManager.instance
  }

  // ============================================================================
  // Task Lifecycle
  // ============================================================================

  /**
   * Create and start a new background task
   */
  async createTask(options: TaskCreateOptions): Promise<BackgroundTask> {
    // Check task limit
    const runningCount = this.getRunningTasks().length
    if (runningCount >= MAX_TASKS) {
      throw new Error(`Maximum concurrent background tasks (${MAX_TASKS}) reached`)
    }

    const id = this.generateTaskId()
    const now = new Date()

    const task: InternalTask = {
      id,
      pid: null,
      command: options.command,
      description: options.description,
      cwd: options.cwd,
      status: 'pending',
      exitCode: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      metadata: options.metadata,
      process: null,
      stdout: [],
      stderr: [],
      combined: [],
      totalBytes: 0,
      maxOutputBytes: options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
      timeoutId: null
    }

    this.tasks.set(id, task)
    logger.info('[BackgroundTaskManager] Task created', { id, command: options.command })

    // Start the task
    await this.startTask(task, options.timeout)

    return this.toPublicTask(task)
  }

  /**
   * Start executing a task
   */
  private async startTask(task: InternalTask, timeout?: number): Promise<void> {
    const { shell, shellArgs } = this.getShell()

    try {
      const proc = spawn(shell, [...shellArgs, task.command], {
        cwd: task.cwd,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        windowsHide: true
      })

      task.process = proc
      task.pid = proc.pid || null
      task.status = 'running'
      task.startedAt = new Date()

      // Register with cleanup service
      processCleanupService.registerProcess(proc)

      // Set up output handling
      proc.stdout?.on('data', (data: Buffer) => {
        this.appendOutput(task, 'stdout', data)
      })

      proc.stderr?.on('data', (data: Buffer) => {
        this.appendOutput(task, 'stderr', data)
      })

      // Set up timeout
      if (timeout && timeout > 0) {
        task.timeoutId = setTimeout(() => {
          this.handleTimeout(task)
        }, timeout)
      }

      // Handle process completion
      proc.on('close', (code, signal) => {
        this.handleCompletion(task, code, signal)
      })

      proc.on('error', (err) => {
        this.handleError(task, err)
      })

      // Unref to allow parent to exit
      proc.unref()

      logger.info('[BackgroundTaskManager] Task started', { id: task.id, pid: task.pid })
      this.emit('task:started', this.toPublicTask(task))

    } catch (error) {
      task.status = 'error'
      task.completedAt = new Date()
      logger.error('[BackgroundTaskManager] Failed to start task', { id: task.id, error })
      this.emit('task:error', this.toPublicTask(task), error)
      throw error
    }
  }

  /**
   * Get a task by ID
   */
  getTask(id: string): BackgroundTask | null {
    const task = this.tasks.get(id)
    return task ? this.toPublicTask(task) : null
  }

  /**
   * Get all tasks
   */
  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).map(t => this.toPublicTask(t))
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'running')
      .map(t => this.toPublicTask(t))
  }

  /**
   * Check if a task exists
   */
  hasTask(id: string): boolean {
    return this.tasks.has(id)
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(id: string, timeout?: number): Promise<BackgroundTask> {
    const task = this.tasks.get(id)
    if (!task) {
      throw new Error(`Task not found: ${id}`)
    }

    if (task.status !== 'running' && task.status !== 'pending') {
      return this.toPublicTask(task)
    }

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        this.off('task:completed', onComplete)
        this.off('task:error', onError)
        this.off('task:cancelled', onCancelled)
        this.off('task:timeout', onTimeout)
      }

      const onComplete = (completedTask: BackgroundTask) => {
        if (completedTask.id === id) {
          cleanup()
          resolve(completedTask)
        }
      }

      const onError = (errorTask: BackgroundTask) => {
        if (errorTask.id === id) {
          cleanup()
          resolve(errorTask)
        }
      }

      const onCancelled = (cancelledTask: BackgroundTask) => {
        if (cancelledTask.id === id) {
          cleanup()
          resolve(cancelledTask)
        }
      }

      const onTimeout = (timedOutTask: BackgroundTask) => {
        if (timedOutTask.id === id) {
          cleanup()
          resolve(timedOutTask)
        }
      }

      this.on('task:completed', onComplete)
      this.on('task:error', onError)
      this.on('task:cancelled', onCancelled)
      this.on('task:timeout', onTimeout)

      if (timeout && timeout > 0) {
        timeoutId = setTimeout(() => {
          cleanup()
          reject(new Error(`Timeout waiting for task ${id}`))
        }, timeout)
      }
    })
  }

  /**
   * Remove a completed task from registry
   */
  removeTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    if (task.status === 'running') {
      throw new Error('Cannot remove a running task. Cancel it first.')
    }

    this.tasks.delete(id)
    logger.info('[BackgroundTaskManager] Task removed', { id })
    return true
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleCompletion(task: InternalTask, code: number | null, signal: string | null): void {
    if (task.status === 'cancelled') {
      if (!task.completedAt) {
        task.exitCode = code
        task.completedAt = new Date()
        task.process = null
        this.emit('task:cancelled', this.toPublicTask(task))
      }
      return
    }

    if (task.status === 'timeout') {
      task.exitCode = code
      task.completedAt = task.completedAt || new Date()
      task.process = null
      return
    }

    if (this.isTerminalStatus(task.status)) {
      logger.debug('[BackgroundTaskManager] Ignoring completion for terminal task', {
        id: task.id,
        status: task.status
      })
      return
    }

    if (task.timeoutId) {
      clearTimeout(task.timeoutId)
      task.timeoutId = null
    }

    task.exitCode = code
    task.completedAt = new Date()
    task.process = null

    if (code === 0) {
      task.status = 'completed'
      logger.info('[BackgroundTaskManager] Task completed', {
        id: task.id,
        exitCode: code,
        signal,
        duration: task.completedAt.getTime() - (task.startedAt?.getTime() || 0)
      })
      this.emit('task:completed', this.toPublicTask(task))
      return
    }

    task.status = 'interrupt'
    const reason = signal ? `signal=${signal}` : `exitCode=${code ?? 'unknown'}`
    this.appendOutput(task, 'stderr', Buffer.from(`\n[Task interrupted] ${reason}`))

    logger.warn('[BackgroundTaskManager] Task interrupted', {
      id: task.id,
      exitCode: code,
      signal,
      duration: task.completedAt.getTime() - (task.startedAt?.getTime() || 0)
    })

    this.emit(
      'task:error',
      this.toPublicTask(task),
      new Error(`Task interrupted (${reason})`)
    )
  }

  private handleError(task: InternalTask, error: Error): void {
    if (this.isTerminalStatus(task.status)) {
      logger.debug('[BackgroundTaskManager] Ignoring process error for terminal task', {
        id: task.id,
        status: task.status,
        error: error.message
      })
      return
    }

    if (task.timeoutId) {
      clearTimeout(task.timeoutId)
      task.timeoutId = null
    }

    task.status = 'error'
    task.completedAt = new Date()
    task.process = null

    this.appendOutput(task, 'stderr', Buffer.from(`\nProcess error: ${error.message}`))

    logger.error('[BackgroundTaskManager] Task error', { id: task.id, error: error.message })
    this.emit('task:error', this.toPublicTask(task), error)
  }

  private handleTimeout(task: InternalTask): void {
    if (task.status !== 'running') return

    logger.warn('[BackgroundTaskManager] Task timeout', { id: task.id })

    task.status = 'timeout'
    task.timeoutId = null

    // Kill the process
    if (task.process && !task.process.killed) {
      task.process.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (task.process && !task.process.killed) {
          task.process.kill('SIGKILL')
        }
      }, 5000)
    }

    this.emit('task:timeout', this.toPublicTask(task))
  }

  private isTerminalStatus(status: TaskStatus): boolean {
    return status === 'completed' || status === 'error' || status === 'interrupt' || status === 'cancelled' || status === 'timeout'
  }

  // ============================================================================
  // Output Management
  // ============================================================================

  private appendOutput(task: InternalTask, stream: 'stdout' | 'stderr', data: Buffer): void {
    const text = data.toString()
    const bytes = data.length

    // Check if we've exceeded max output
    if (task.totalBytes >= task.maxOutputBytes) {
      return // Already at limit
    }

    task.totalBytes += bytes

    if (stream === 'stdout') {
      task.stdout.push(text)
    } else {
      task.stderr.push(text)
    }
    task.combined.push(text)

    // Emit output event
    this.emit('task:output', task.id, stream, text)
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  private getShell(): { shell: string; shellArgs: string[] } {
    const isWindows = os.platform() === 'win32'

    if (isWindows) {
      return {
        shell: process.env.COMSPEC || 'cmd.exe',
        shellArgs: ['/c']
      }
    }

    return {
      shell: process.env.SHELL || '/bin/bash',
      shellArgs: ['-c']
    }
  }

  private toPublicTask(task: InternalTask): BackgroundTask {
    return {
      id: task.id,
      pid: task.pid,
      command: task.command,
      description: task.description,
      cwd: task.cwd,
      status: task.status,
      exitCode: task.exitCode,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      metadata: task.metadata
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTasks()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  private cleanupOldTasks(): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [id, task] of this.tasks) {
      if (task.status !== 'running' && task.status !== 'pending') {
        const completedTime = task.completedAt?.getTime() || 0
        if (now - completedTime > TASK_RETENTION_MS) {
          toRemove.push(id)
        }
      }
    }

    for (const id of toRemove) {
      this.tasks.delete(id)
    }

    if (toRemove.length > 0) {
      logger.info('[BackgroundTaskManager] Cleaned up old tasks', { count: toRemove.length })
    }
  }

  private registerShutdownHook(): void {
    processCleanupService.onCleanup(async () => {
      await this.shutdown()
    })
  }

  /**
   * Graceful shutdown - cancel all running tasks
   */
  async shutdown(): Promise<void> {
    logger.info('[BackgroundTaskManager] Shutting down...')

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    const runningTasks = this.getRunningTasks()
    logger.info('[BackgroundTaskManager] Cancelling running tasks', { count: runningTasks.length })

    for (const task of runningTasks) {
      try {
        // Import cancel function dynamically to avoid circular dependency
        const { cancelTask } = await import('./cancel')
        await cancelTask(task.id)
      } catch (error) {
        logger.error('[BackgroundTaskManager] Failed to cancel task', { id: task.id, error })
      }
    }

    this.tasks.clear()
    logger.info('[BackgroundTaskManager] Shutdown complete')
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number
    running: number
    completed: number
    error: number
    cancelled: number
  } {
    let running = 0
    let completed = 0
    let error = 0
    let cancelled = 0

    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'running':
        case 'pending':
          running++
          break
        case 'completed':
          completed++
          break
        case 'error':
        case 'interrupt':
        case 'timeout':
          error++
          break
        case 'cancelled':
          cancelled++
          break
      }
    }

    return {
      total: this.tasks.size,
      running,
      completed,
      error,
      cancelled
    }
  }
}

// Export singleton
export const backgroundTaskManager = BackgroundTaskManager.getInstance()

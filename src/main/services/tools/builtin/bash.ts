import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import {
  backgroundTaskManager,
  getTaskOutput,
  cancelTask,
  type BackgroundTask
} from '../background'

// Constants
const DEFAULT_TIMEOUT_MS = 120_000 // 120 seconds
const MAX_TIMEOUT_MS = 600_000 // 10 minutes
const MAX_OUTPUT_BYTES = 30_000 // 30KB output limit
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf $HOME',
  'dd if=/dev/zero',
  'mkfs',
  ':(){:|:&};:',
  '> /dev/sda',
  'chmod -R 777 /',
  'chown -R',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6'
]

const DESTRUCTIVE_GIT_COMMANDS = [
  'git push --force',
  'git push -f',
  'git reset --hard',
  'git clean -f',
  'git checkout .',
  'git restore .',
  'git branch -D',
  'git rebase --abort',
  'git merge --abort'
]

interface BashParams {
  command: string
  description?: string
  timeout?: number
  cwd?: string
  run_in_background?: boolean
  background_task_id?: string // For checking status of background task
  cancel_background?: boolean // For cancelling a background task
}

// Legacy interface for backward compatibility
interface BackgroundProcess {
  id: string
  pid: number
  command: string
  startTime: number
  process: ChildProcess
  stdout: string
  stderr: string
  exitCode: number | null
  status: 'running' | 'completed' | 'error' | 'timeout'
}

// Legacy background process registry (kept for compatibility)
const backgroundProcesses = new Map<string, BackgroundProcess>()

/**
 * Generate unique ID for background processes
 */
function generateProcessId(): string {
  return `bg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Check if command contains dangerous patterns
 */
function isDangerousCommand(command: string): { dangerous: boolean; warning?: string } {
  const normalizedCmd = command.toLowerCase().trim()

  for (const dangerous of DANGEROUS_COMMANDS) {
    if (normalizedCmd.includes(dangerous.toLowerCase())) {
      return {
        dangerous: true,
        warning: `BLOCKED: Command contains dangerous pattern "${dangerous}". This command could cause serious system damage.`
      }
    }
  }

  return { dangerous: false }
}

/**
 * Check if command is a destructive git operation
 */
function isDestructiveGitCommand(command: string): { destructive: boolean; warning?: string } {
  const normalizedCmd = command.toLowerCase().trim()

  for (const destructive of DESTRUCTIVE_GIT_COMMANDS) {
    if (normalizedCmd.includes(destructive.toLowerCase())) {
      return {
        destructive: true,
        warning: `WARNING: This is a destructive git operation (${destructive}). Please confirm this is intentional.`
      }
    }
  }

  return { destructive: false }
}

/**
 * Get the shell to use based on platform
 */
function getShell(): { shell: string; shellArgs: string[] } {
  const isWindows = os.platform() === 'win32'

  if (isWindows) {
    // Try PowerShell first, fall back to cmd
    const powershell = process.env.COMSPEC?.includes('powershell')
      ? process.env.COMSPEC
      : 'powershell.exe'

    return {
      shell: process.env.COMSPEC || 'cmd.exe',
      shellArgs: ['/c']
    }
  }

  // Unix-like systems
  const shell = process.env.SHELL || '/bin/bash'
  return {
    shell,
    shellArgs: ['-c']
  }
}

/**
 * Truncate output to max bytes
 */
function truncateOutput(output: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(output, 'utf8')
  if (bytes <= maxBytes) {
    return { text: output, truncated: false }
  }

  // Truncate and add notice
  let truncated = output
  while (Buffer.byteLength(truncated, 'utf8') > maxBytes - 100) {
    truncated = truncated.slice(0, Math.floor(truncated.length * 0.9))
  }

  return {
    text: truncated + '\n\n[Output truncated - exceeded 30KB limit]',
    truncated: true
  }
}

/**
 * Execute command synchronously with timeout
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const { shell, shellArgs } = getShell()

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let killed = false

    const proc = spawn(shell, [...shellArgs, command], {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true
      killed = true
      proc.kill('SIGTERM')
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL')
        }
      }, 5000)
    }, timeout)

    // Capture stdout
    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    // Capture stderr
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Handle process exit
    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      resolve({
        stdout,
        stderr,
        exitCode: code ?? (killed ? 137 : 1),
        timedOut
      })
    })

    // Handle spawn errors
    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      resolve({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: 1,
        timedOut: false
      })
    })
  })
}

/**
 * Launch background process
 */
function launchBackgroundProcess(
  command: string,
  cwd: string
): BackgroundProcess {
  const { shell, shellArgs } = getShell()
  const id = generateProcessId()

  const proc = spawn(shell, [...shellArgs, command], {
    cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    windowsHide: true
  })

  const bgProcess: BackgroundProcess = {
    id,
    pid: proc.pid!,
    command,
    startTime: Date.now(),
    process: proc,
    stdout: '',
    stderr: '',
    exitCode: null,
    status: 'running'
  }

  // Capture output
  proc.stdout?.on('data', (data: Buffer) => {
    bgProcess.stdout += data.toString()
  })

  proc.stderr?.on('data', (data: Buffer) => {
    bgProcess.stderr += data.toString()
  })

  // Handle completion
  proc.on('close', (code) => {
    bgProcess.exitCode = code
    bgProcess.status = code === 0 ? 'completed' : 'error'
  })

  proc.on('error', (err) => {
    bgProcess.stderr += '\n' + err.message
    bgProcess.status = 'error'
    bgProcess.exitCode = 1
  })

  backgroundProcesses.set(id, bgProcess)

  // Unref to allow parent process to exit
  proc.unref()

  return bgProcess
}

/**
 * Get background process status
 */
export function getBackgroundProcess(id: string): BackgroundProcess | undefined {
  return backgroundProcesses.get(id)
}

/**
 * List all background processes
 */
export function listBackgroundProcesses(): BackgroundProcess[] {
  return Array.from(backgroundProcesses.values())
}

/**
 * Clean up completed background processes
 */
export function cleanupBackgroundProcesses(): void {
  const entries = Array.from(backgroundProcesses.entries())
  for (const [id, proc] of entries) {
    if (proc.status !== 'running') {
      backgroundProcesses.delete(id)
    }
  }
}

export const bashTool: Tool = {
  definition: {
    name: 'bash',
    description: `Execute a bash command in the workspace directory.

Usage notes:
- Commands run with a default timeout of 120 seconds (max 600 seconds)
- Output is truncated at 30KB
- Use run_in_background=true for long-running processes
- The command runs in the workspace directory by default
- On Windows, commands run via cmd.exe

Safety:
- Dangerous system commands are blocked (rm -rf /, dd, mkfs, etc.)
- Destructive git commands will show warnings
- Always confirm before running irreversible operations`,
    category: 'terminal',
    parameters: [
      {
        name: 'command',
        type: 'string',
        description: 'The command to execute',
        required: true
      },
      {
        name: 'description',
        type: 'string',
        description: 'Brief description of what this command does',
        required: false
      },
      {
        name: 'timeout',
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000, max: 600000)',
        required: false,
        default: DEFAULT_TIMEOUT_MS
      },
      {
        name: 'cwd',
        type: 'string',
        description: 'Working directory for the command (relative to workspace)',
        required: false
      },
      {
        name: 'run_in_background',
        type: 'boolean',
        description: 'Run command in background and return immediately',
        required: false,
        default: false
      },
      {
        name: 'background_task_id',
        type: 'string',
        description: 'Check status/output of a background task by ID',
        required: false
      },
      {
        name: 'cancel_background',
        type: 'boolean',
        description: 'Cancel a background task (requires background_task_id)',
        required: false,
        default: false
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const {
      command,
      description,
      timeout = DEFAULT_TIMEOUT_MS,
      cwd,
      run_in_background = false,
      background_task_id,
      cancel_background = false
    } = params as BashParams

    // Handle background task status check
    if (background_task_id && !cancel_background) {
      return handleBackgroundTaskStatus(background_task_id)
    }

    // Handle background task cancellation
    if (background_task_id && cancel_background) {
      return handleBackgroundTaskCancel(background_task_id)
    }

    // Validate command
    if (!command || typeof command !== 'string' || !command.trim()) {
      return {
        success: false,
        output: '',
        error: 'Command is required and must be a non-empty string'
      }
    }

    // Check for dangerous commands
    const dangerCheck = isDangerousCommand(command)
    if (dangerCheck.dangerous) {
      return {
        success: false,
        output: '',
        error: dangerCheck.warning
      }
    }

    // Check for destructive git commands
    const gitCheck = isDestructiveGitCommand(command)

    // Resolve working directory
    let workingDir = context.workspaceDir
    if (cwd) {
      workingDir = path.resolve(context.workspaceDir, cwd)
      // Security check - ensure within workspace
      if (!workingDir.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Access denied: working directory outside workspace'
        }
      }
    }

    // Clamp timeout
    const effectiveTimeout = Math.min(
      Math.max(timeout, 1000),
      MAX_TIMEOUT_MS
    )

    try {
      // Background execution - use new task manager
      if (run_in_background) {
        const task = await backgroundTaskManager.createTask({
          command,
          cwd: workingDir,
          description,
          timeout: effectiveTimeout,
          metadata: {
            sessionId: context.sessionId,
            tool: 'bash'
          }
        })

        const output = [
          'Background task started successfully.',
          '',
          `Task ID: ${task.id}`,
          `PID: ${task.pid}`,
          `Command: ${command}`,
          description ? `Description: ${description}` : '',
          '',
          'Use bash tool with background_task_id to check status/output.',
          'Use bash tool with background_task_id and cancel_background=true to cancel.'
        ].filter(Boolean).join('\n')

        return {
          success: true,
          output,
          metadata: {
            background: true,
            taskId: task.id,
            processId: task.id, // Legacy compatibility
            pid: task.pid,
            command
          }
        }
      }

      // Synchronous execution
      const result = await executeCommand(command, workingDir, effectiveTimeout)

      // Build output
      let output = ''

      if (result.timedOut) {
        output = `Command timed out after ${effectiveTimeout / 1000} seconds.\n\n`
      }

      if (result.stdout) {
        const { text, truncated } = truncateOutput(result.stdout, MAX_OUTPUT_BYTES)
        output += text
      }

      if (result.stderr) {
        const { text: stderrText } = truncateOutput(result.stderr, MAX_OUTPUT_BYTES / 2)
        if (output) output += '\n\n'
        output += `[stderr]\n${stderrText}`
      }

      if (!output.trim()) {
        output = '(no output)'
      }

      // Add git warning if applicable
      if (gitCheck.destructive && result.exitCode === 0) {
        output = `${gitCheck.warning}\n\n${output}`
      }

      const success = result.exitCode === 0 && !result.timedOut

      return {
        success,
        output,
        error: success ? undefined : `Exit code: ${result.exitCode}`,
        metadata: {
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          command,
          cwd: workingDir
        }
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// ============================================================================
// Background Task Helper Functions
// ============================================================================

/**
 * Handle background task status check
 */
async function handleBackgroundTaskStatus(taskId: string): Promise<ToolExecutionResult> {
  const task = backgroundTaskManager.getTask(taskId)

  if (!task) {
    return {
      success: false,
      output: '',
      error: `Background task not found: ${taskId}`
    }
  }

  const output = getTaskOutput(taskId)

  const statusInfo = [
    `Task ID: ${task.id}`,
    `Status: ${task.status}`,
    `PID: ${task.pid}`,
    `Command: ${task.command}`,
    task.description ? `Description: ${task.description}` : '',
    `Started: ${task.startedAt?.toISOString() || 'Not started'}`,
    task.completedAt ? `Completed: ${task.completedAt.toISOString()}` : '',
    task.exitCode !== null ? `Exit Code: ${task.exitCode}` : '',
    '',
    '--- Output ---',
    output.combined || '(no output yet)',
    output.truncated ? '\n[Output truncated]' : ''
  ].filter(Boolean).join('\n')

  return {
    success: true,
    output: statusInfo,
    metadata: {
      taskId: task.id,
      status: task.status,
      pid: task.pid,
      exitCode: task.exitCode,
      outputBytes: output.bytesTotal,
      truncated: output.truncated
    }
  }
}

/**
 * Handle background task cancellation
 */
async function handleBackgroundTaskCancel(taskId: string): Promise<ToolExecutionResult> {
  const task = backgroundTaskManager.getTask(taskId)

  if (!task) {
    return {
      success: false,
      output: '',
      error: `Background task not found: ${taskId}`
    }
  }

  if (task.status !== 'running') {
    return {
      success: true,
      output: `Task ${taskId} is already ${task.status}, no cancellation needed.`,
      metadata: {
        taskId: task.id,
        status: task.status
      }
    }
  }

  const cancelled = await cancelTask(taskId)

  if (cancelled) {
    return {
      success: true,
      output: `Background task ${taskId} has been cancelled.`,
      metadata: {
        taskId,
        cancelled: true
      }
    }
  } else {
    return {
      success: false,
      output: '',
      error: `Failed to cancel task ${taskId}`
    }
  }
}

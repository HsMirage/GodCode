import { ipcMain } from 'electron'
import {
  backgroundTaskManager,
  getOutputChunks,
  cancelTask,
  type BackgroundTask,
  type OutputChunk
} from '../../services/tools/background'

interface BackgroundTaskListInput {
  sessionId?: string
}

interface BackgroundTaskGetOutputInput {
  taskId: string
  afterIndex?: number
}

interface BackgroundTaskCancelInput {
  taskId: string
}

function normalizeTask(task: BackgroundTask) {
  return {
    id: task.id,
    pid: task.pid,
    command: task.command,
    description: task.description,
    cwd: task.cwd,
    status: task.status,
    exitCode: task.exitCode,
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt ? task.startedAt.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    metadata: task.metadata ?? null
  }
}

function normalizeChunks(chunks: OutputChunk[]) {
  return chunks.map(chunk => ({
    stream: chunk.stream,
    data: chunk.data,
    timestamp: chunk.timestamp.toISOString()
  }))
}

export function registerBackgroundTaskHandlers(): void {
  ipcMain.handle('background-task:list', async (_, input?: BackgroundTaskListInput) => {
    try {
      const sessionId = input?.sessionId
      const allTasks = backgroundTaskManager.getAllTasks()
      const filtered = sessionId
        ? allTasks.filter(task => task.metadata?.sessionId === sessionId)
        : allTasks

      const withInput = filtered.map(task => {
        const metadata = task.metadata
        const descriptionFromMetadata =
          metadata && typeof metadata.description === 'string' ? String(metadata.description) : undefined

        return {
          ...task,
          metadata: {
            ...(metadata || {}),
            input: descriptionFromMetadata || task.description || task.command,
            description: descriptionFromMetadata || task.description || task.command
          }
        }
      })

      const sorted = withInput.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )

      return {
        success: true,
        data: sorted.map(normalizeTask)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('background-task:get-output', async (_, input: BackgroundTaskGetOutputInput) => {
    try {
      if (!input?.taskId) {
        return {
          success: false,
          error: 'taskId is required'
        }
      }

      const task = backgroundTaskManager.getTask(input.taskId)
      if (!task) {
        return {
          success: false,
          error: `Task not found: ${input.taskId}`
        }
      }

      const afterIndex = Math.max(0, input.afterIndex ?? 0)
      const output = getOutputChunks(input.taskId, afterIndex)

      return {
        success: true,
        data: {
          task: normalizeTask(task),
          chunks: normalizeChunks(output.chunks),
          nextIndex: output.nextIndex
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('background-task:cancel', async (_, input: BackgroundTaskCancelInput) => {
    try {
      if (!input?.taskId) {
        return {
          success: false,
          error: 'taskId is required'
        }
      }

      const task = backgroundTaskManager.getTask(input.taskId)
      if (!task) {
        return {
          success: false,
          error: `Task not found: ${input.taskId}`
        }
      }

      const cancelled = await cancelTask(input.taskId)
      return {
        success: true,
        data: {
          taskId: input.taskId,
          cancelled
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}

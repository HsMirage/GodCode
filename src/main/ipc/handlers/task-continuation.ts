import { IpcMainInvokeEvent } from 'electron'
import {
  taskContinuationService,
  Todo,
  type TaskContinuationConfig
} from '../../services/task-continuation.service'

export async function handleTaskContinuationGetStatus(
  _event: IpcMainInvokeEvent,
  sessionId: string
) {
  const progress = taskContinuationService.getTodoProgress(sessionId)
  return {
    shouldContinue: taskContinuationService.shouldContinue(sessionId),
    incompleteTodos: taskContinuationService.getIncompleteTodos(sessionId),
    continuationPrompt: taskContinuationService.getContinuationPrompt(sessionId),
    totalTodos: progress.total,
    completedTodos: progress.completed,
    recoveryContext: taskContinuationService.getRecoveryTracking(sessionId, 'manual-resume')
  }
}

export async function handleTaskContinuationAbort(_event: IpcMainInvokeEvent, sessionId: string) {
  taskContinuationService.markAborted(sessionId)
  return { success: true }
}

export async function handleTaskContinuationSetTodos(
  _event: IpcMainInvokeEvent,
  input: { sessionId: string; todos: Todo[] }
) {
  taskContinuationService.setTodos(input.sessionId, input.todos)
  return { success: true }
}

export async function handleTaskContinuationGetConfig(_event: IpcMainInvokeEvent) {
  return {
    success: true,
    data: taskContinuationService.getConfig()
  }
}

export async function handleTaskContinuationSetConfig(
  _event: IpcMainInvokeEvent,
  config: Partial<TaskContinuationConfig>
) {
  const next = taskContinuationService.setConfig(config)
  return {
    success: true,
    data: next
  }
}

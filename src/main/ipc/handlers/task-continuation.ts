import { IpcMainInvokeEvent } from 'electron'
import { taskContinuationService, Todo } from '../../services/task-continuation.service'

export async function handleTaskContinuationGetStatus(
  _event: IpcMainInvokeEvent,
  sessionId: string
) {
  return {
    shouldContinue: taskContinuationService.shouldContinue(sessionId),
    incompleteTodos: taskContinuationService.getIncompleteTodos(sessionId),
    continuationPrompt: taskContinuationService.getContinuationPrompt(sessionId)
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

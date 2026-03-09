export type PersistedExecutionEventType =
  | 'message-stream-started'
  | 'tool-call-requested'
  | 'tool-call-approved'
  | 'tool-call-rejected'
  | 'tool-call-completed'
  | 'llm-response-chunked'
  | 'checkpoint-saved'
  | 'run-paused'
  | 'run-resumed'

export interface PersistedExecutionEvent {
  id: string
  type: PersistedExecutionEventType
  sessionId: string
  taskId?: string
  runId?: string
  timestamp: string
  payload?: Record<string, unknown>
}


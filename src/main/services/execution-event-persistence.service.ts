import { randomUUID } from 'node:crypto'
import { DatabaseService } from './database'
import { sessionContinuityService } from './session-continuity.service'
import type { PersistedExecutionEvent, PersistedExecutionEventType } from '@/shared/execution-event-contract'

const EVENT_LIMIT = 200

function mergeEvents(
  existing: PersistedExecutionEvent[] | undefined,
  next: PersistedExecutionEvent
): PersistedExecutionEvent[] {
  const items = [...(existing || []), next]
  return items.slice(-EVENT_LIMIT)
}

export class ExecutionEventPersistenceService {
  private static instance: ExecutionEventPersistenceService | null = null

  static getInstance(): ExecutionEventPersistenceService {
    if (!ExecutionEventPersistenceService.instance) {
      ExecutionEventPersistenceService.instance = new ExecutionEventPersistenceService()
    }
    return ExecutionEventPersistenceService.instance
  }

  async appendEvent(input: {
    sessionId: string
    taskId?: string
    runId?: string
    type: PersistedExecutionEventType
    payload?: Record<string, unknown>
  }): Promise<PersistedExecutionEvent> {
    const event: PersistedExecutionEvent = {
      id: randomUUID(),
      type: input.type,
      sessionId: input.sessionId,
      taskId: input.taskId,
      runId: input.runId,
      timestamp: new Date().toISOString(),
      payload: input.payload
    }

    if (input.taskId) {
      await this.appendTaskEvent(input.taskId, event)
    }

    if (input.sessionId) {
      await this.appendSessionEvent(input.sessionId, event)
    }

    return event
  }

  private async appendTaskEvent(taskId: string, event: PersistedExecutionEvent): Promise<void> {
    const prisma = DatabaseService.getInstance().getClient()
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { metadata: true }
    })
    const metadata = (task?.metadata as Record<string, unknown> | null) || {}
    const existing = Array.isArray(metadata.executionEvents)
      ? (metadata.executionEvents as PersistedExecutionEvent[])
      : []

    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...metadata,
          executionEvents: mergeEvents(existing, event),
          lastExecutionEventAt: event.timestamp
        }
      }
    })
  }

  private async appendSessionEvent(sessionId: string, event: PersistedExecutionEvent): Promise<void> {
    const existing = await sessionContinuityService.getSessionState(sessionId)
    const context = existing?.context || { spaceId: '', workDir: '' }
    const executionEvents = Array.isArray(context.executionEvents)
      ? (context.executionEvents as PersistedExecutionEvent[])
      : []

    await sessionContinuityService.saveSessionState(sessionId, existing?.status || 'active', {}, {
      ...context,
      executionEvents: mergeEvents(executionEvents, event)
    })
  }
}

export const executionEventPersistenceService = ExecutionEventPersistenceService.getInstance()


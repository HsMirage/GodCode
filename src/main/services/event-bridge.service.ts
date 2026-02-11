import { BrowserWindow } from 'electron'
import { EVENT_CHANNELS } from '../../shared/ipc-channels'
import { workflowEvents, type WorkflowEvent } from './workforce/events'

const WORKFLOW_EVENT_TYPES = [
  'task:assigned',
  'task:started',
  'task:completed',
  'task:failed',
  'workflow:completed'
] as const

const EVENT_BATCH_DEBOUNCE_MS = 100

const WORKFLOW_TO_TASK_STATUS: Partial<Record<WorkflowEvent['type'], string>> = {
  'task:assigned': 'pending',
  'task:started': 'running',
  'task:completed': 'completed',
  'task:failed': 'failed'
}

let initialized = false
let pendingEvents: WorkflowEvent[] = []
let flushTimer: NodeJS.Timeout | null = null

function flushPendingEvents() {
  if (pendingEvents.length === 0) return

  const eventsToSend = pendingEvents
  pendingEvents = []

  const windows = BrowserWindow.getAllWindows().filter(win => !win.isDestroyed())
  if (windows.length === 0) return

  for (const event of eventsToSend) {
    const payload = {
      workflowId: event.workflowId,
      taskId: event.taskId,
      eventType: event.type,
      status: WORKFLOW_TO_TASK_STATUS[event.type],
      timestamp: event.timestamp,
      data: event.data
    }

    for (const win of windows) {
      win.webContents.send(EVENT_CHANNELS.TASK_STATUS_CHANGED, payload)
    }
  }
}

function enqueueEvent(event: WorkflowEvent) {
  pendingEvents.push(event)

  if (flushTimer) {
    clearTimeout(flushTimer)
  }

  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPendingEvents()
  }, EVENT_BATCH_DEBOUNCE_MS)
}

export function initEventBridge() {
  if (initialized) return
  initialized = true

  for (const eventType of WORKFLOW_EVENT_TYPES) {
    workflowEvents.on(eventType, enqueueEvent)
  }
}

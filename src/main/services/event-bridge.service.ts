import { BrowserWindow } from 'electron'
import { EVENT_CHANNELS } from '../../shared/ipc-channels'
import { workflowEvents, type WorkflowEvent } from './workforce/events'
import { backgroundTaskManager, type BackgroundTask } from './tools/background'

const WORKFLOW_EVENT_TYPES = [
  'task:assigned',
  'task:started',
  'task:completed',
  'task:failed',
  'workflow:stage',
  'workflow:checkpoint',
  'workflow:completed'
] as const

const EVENT_BATCH_DEBOUNCE_MS = 100

const WORKFLOW_TO_TASK_STATUS: Partial<Record<WorkflowEvent['type'], string>> = {
  'task:assigned': 'pending',
  'task:started': 'running',
  'task:completed': 'completed',
  'task:failed': 'failed',
  'workflow:stage': 'running',
  'workflow:checkpoint': 'running'
}

let initialized = false
let pendingEvents: WorkflowEvent[] = []
let flushTimer: NodeJS.Timeout | null = null

function getLiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed())
}

function normalizeBackgroundTask(task: BackgroundTask) {
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

function flushPendingEvents() {
  if (pendingEvents.length === 0) return

  const eventsToSend = pendingEvents
  pendingEvents = []

  const windows = getLiveWindows()
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

  backgroundTaskManager.on('task:started', task => {
    const payload = { task: normalizeBackgroundTask(task) }
    for (const win of getLiveWindows()) {
      win.webContents.send(EVENT_CHANNELS.BACKGROUND_TASK_STARTED, payload)
    }
  })

  backgroundTaskManager.on('task:output', (taskId: string, stream: 'stdout' | 'stderr', data: string) => {
    const payload = {
      taskId,
      stream,
      data,
      timestamp: new Date().toISOString()
    }
    for (const win of getLiveWindows()) {
      win.webContents.send(EVENT_CHANNELS.BACKGROUND_TASK_OUTPUT, payload)
    }
  })

  backgroundTaskManager.on('task:completed', (task, exitCode: number | null, signal: string | null) => {
    const payload = {
      task: normalizeBackgroundTask(task),
      exitCode,
      signal
    }
    for (const win of getLiveWindows()) {
      win.webContents.send(EVENT_CHANNELS.BACKGROUND_TASK_COMPLETED, payload)
    }
  })

  backgroundTaskManager.on('task:cancelled', task => {
    const payload = { task: normalizeBackgroundTask(task) }
    for (const win of getLiveWindows()) {
      win.webContents.send(EVENT_CHANNELS.BACKGROUND_TASK_CANCELLED, payload)
    }
  })
}

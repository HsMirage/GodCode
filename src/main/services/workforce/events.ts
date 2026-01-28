export interface WorkflowEvent {
  type: 'task:assigned' | 'task:started' | 'task:completed' | 'task:failed'
  workflowId: string
  taskId: string
  timestamp: Date
  data?: Record<string, unknown>
}

export class WorkflowEventEmitter {
  private listeners: Map<string, ((event: WorkflowEvent) => void)[]> = new Map()

  on(eventType: string, callback: (event: WorkflowEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, [])
    }
    this.listeners.get(eventType)!.push(callback)
  }

  emit(event: WorkflowEvent): void {
    const callbacks = this.listeners.get(event.type) || []
    for (const callback of callbacks) {
      callback(event)
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}

export const workflowEvents = new WorkflowEventEmitter()

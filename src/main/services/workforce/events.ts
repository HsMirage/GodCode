/**
 * @license
 * Copyright (c) 2024-2026 stackframe-projects
 *
 * This file is adapted from eigent
 * Original source: https://github.com/stackframe-projects/eigent
 * License: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Modified by GodCode project.
 */

import { hookManager } from '@/main/services/hooks'
import type { TaskLifecycleStatus } from '@/main/services/hooks'

export interface WorkflowEvent {
  type:
    | 'task:assigned'
    | 'task:started'
    | 'task:completed'
    | 'task:failed'
    | 'workflow:stage'
    | 'workflow:checkpoint'
    | 'workflow:completed'
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

    const sessionId =
      typeof event.data?.sessionId === 'string' && event.data.sessionId.trim().length > 0
        ? event.data.sessionId
        : event.workflowId

    const workspaceDir =
      typeof event.data?.workspaceDir === 'string' && event.data.workspaceDir.trim().length > 0
        ? event.data.workspaceDir
        : process.cwd()

    void hookManager.emitTaskLifecycle(
      {
        sessionId,
        workspaceDir
      },
      {
        status: event.type as TaskLifecycleStatus,
        workflowId: event.workflowId,
        taskId: event.taskId,
        timestamp: event.timestamp,
        data: event.data
      }
    )
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}

export const workflowEvents = new WorkflowEventEmitter()

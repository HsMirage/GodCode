import { describe, it, expect, vi, beforeEach } from 'vitest'

const { emitTaskLifecycleMock } = vi.hoisted(() => ({
  emitTaskLifecycleMock: vi.fn()
}))

vi.mock('@/main/services/hooks', () => ({
  hookManager: {
    emitTaskLifecycle: emitTaskLifecycleMock
  }
}))

import { WorkflowEventEmitter, type WorkflowEvent } from '@/main/services/workforce/events'

describe('WorkflowEventEmitter', () => {
  let emitter: WorkflowEventEmitter

  beforeEach(() => {
    emitter = new WorkflowEventEmitter()
    emitTaskLifecycleMock.mockReset()
    emitTaskLifecycleMock.mockResolvedValue(undefined)
  })

  it('should register and trigger listeners', () => {
    const callback = vi.fn()
    emitter.on('task:started', callback)

    const event: WorkflowEvent = {
      type: 'task:started',
      workflowId: 'wf-1',
      taskId: 'task-1',
      timestamp: new Date()
    }

    emitter.emit(event)

    expect(callback).toHaveBeenCalledWith(event)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple listeners for same event', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    emitter.on('task:completed', callback1)
    emitter.on('task:completed', callback2)

    const event: WorkflowEvent = {
      type: 'task:completed',
      workflowId: 'wf-1',
      taskId: 'task-1',
      timestamp: new Date()
    }

    emitter.emit(event)

    expect(callback1).toHaveBeenCalledWith(event)
    expect(callback2).toHaveBeenCalledWith(event)
  })

  it('should emit workflow completed events to listeners', () => {
    const callback = vi.fn()
    emitter.on('workflow:completed', callback)

    const event: WorkflowEvent = {
      type: 'workflow:completed',
      workflowId: 'wf-2',
      taskId: 'task-2',
      timestamp: new Date()
    }

    emitter.emit(event)

    expect(callback).toHaveBeenCalledWith(event)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should emit workflow checkpoint events to listeners', () => {
    const callback = vi.fn()
    emitter.on('workflow:checkpoint', callback)

    const event: WorkflowEvent = {
      type: 'workflow:checkpoint',
      workflowId: 'wf-3',
      taskId: 'task-checkpoint-1',
      timestamp: new Date(),
      data: {
        phase: 'pre-dispatch',
        status: 'continue'
      }
    }

    emitter.emit(event)

    expect(callback).toHaveBeenCalledWith(event)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should not trigger listeners for different events', () => {
    const callback = vi.fn()
    emitter.on('task:failed', callback)

    const event: WorkflowEvent = {
      type: 'task:completed',
      workflowId: 'wf-1',
      taskId: 'task-1',
      timestamp: new Date()
    }

    emitter.emit(event)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should remove all listeners', () => {
    const callback = vi.fn()
    emitter.on('task:started', callback)

    emitter.removeAllListeners()

    const event: WorkflowEvent = {
      type: 'task:started',
      workflowId: 'wf-1',
      taskId: 'task-1',
      timestamp: new Date()
    }

    emitter.emit(event)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should handle emitting events with no listeners gracefully', () => {
    const event: WorkflowEvent = {
      type: 'task:started',
      workflowId: 'wf-1',
      taskId: 'task-1',
      timestamp: new Date()
    }

    expect(() => emitter.emit(event)).not.toThrow()
  })

  it('should forward workflow events to hookManager task lifecycle dispatch', async () => {
    const now = new Date('2026-03-04T10:00:00.000Z')
    const event: WorkflowEvent = {
      type: 'task:started',
      workflowId: 'wf-forward-1',
      taskId: 'task-forward-1',
      timestamp: now,
      data: {
        sessionId: 'session-forward-1',
        workspaceDir: '/tmp/workspace-forward-1',
        custom: 'value'
      }
    }

    emitter.emit(event)

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(emitTaskLifecycleMock).toHaveBeenCalledTimes(1)
    expect(emitTaskLifecycleMock).toHaveBeenCalledWith(
      {
        sessionId: 'session-forward-1',
        workspaceDir: '/tmp/workspace-forward-1'
      },
      {
        status: 'task:started',
        workflowId: 'wf-forward-1',
        taskId: 'task-forward-1',
        timestamp: now,
        data: event.data
      }
    )
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEventEmitter, type WorkflowEvent } from '@/main/services/workforce/events'

describe('WorkflowEventEmitter', () => {
  let emitter: WorkflowEventEmitter

  beforeEach(() => {
    emitter = new WorkflowEventEmitter()
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
})

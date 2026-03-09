import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkforceWorkerDispatcher } from '@/main/services/workforce/worker-dispatcher'

const mockDelegateEngine = {
  delegateTask: vi.fn()
}

vi.mock('@/main/services/delegate', () => ({
  DelegateEngine: vi.fn(() => mockDelegateEngine)
}))

describe('WorkforceWorkerDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    WorkforceWorkerDispatcher.resetDispatcherStateForTests()
    mockDelegateEngine.delegateTask.mockResolvedValue({
      taskId: 'task-1',
      output: 'ok',
      success: true
    })
  })

  it('dispatches worker tasks through delegate engine in sync mode', async () => {
    const dispatcher = new WorkforceWorkerDispatcher()

    await dispatcher.dispatch({
      sessionId: 'session-1',
      description: 'Implement feature',
      prompt: 'Do implementation',
      subagent_type: 'luban',
      parentTaskId: 'workflow-1'
    })

    expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        description: 'Implement feature',
        prompt: 'Do implementation',
        subagent_type: 'luban',
        parentTaskId: 'workflow-1',
        runInBackground: false
      })
    )
  })

  it('dispatches worker tasks in background mode when requested', async () => {
    const dispatcher = new WorkforceWorkerDispatcher()

    await dispatcher.dispatch({
      sessionId: 'session-1',
      description: 'Research docs',
      prompt: 'Collect docs',
      category: 'dayu',
      parentTaskId: 'workflow-1',
      runInBackground: true
    })

    expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'dayu',
        runInBackground: true
      })
    )
  })

  it('queues same concurrency key to respect per-key limit', async () => {
    const dispatcher = new WorkforceWorkerDispatcher()
    let inFlight = 0
    let maxInFlight = 0

    mockDelegateEngine.delegateTask.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 20))
      inFlight -= 1
      return { taskId: 'task-queued', output: 'ok', success: true }
    })

    await Promise.all([
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task A',
        prompt: 'Do A',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible', concurrencyLimit: 2 }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task B',
        prompt: 'Do B',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible', concurrencyLimit: 2 }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task C',
        prompt: 'Do C',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible', concurrencyLimit: 2 }
      })
    ])

    expect(maxInFlight).toBe(2)
  })

  it('dispatches queued tasks in FIFO order for same concurrency key', async () => {
    const dispatcher = new WorkforceWorkerDispatcher()
    const startOrder: string[] = []

    mockDelegateEngine.delegateTask.mockImplementation(async input => {
      startOrder.push(input.description)
      await new Promise(resolve => setTimeout(resolve, 10))
      return { taskId: input.description, output: 'ok', success: true }
    })

    await Promise.all([
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task-1',
        prompt: 'Do 1',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible', concurrencyLimit: 2 }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task-2',
        prompt: 'Do 2',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible', concurrencyLimit: 2 }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task-3',
        prompt: 'Do 3',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible', concurrencyLimit: 2 }
      })
    ])

    expect(startOrder).toEqual(['Task-1', 'Task-2', 'Task-3'])
  })

  it('releases each acquired slot at most once for the same dispatch lease', async () => {
    const dispatcher = new WorkforceWorkerDispatcher()
    const internals = dispatcher as any
    const metadata = {
      concurrencyKey: 'openai-compatible',
      concurrencyLimit: 1,
      logicalTaskId: 'task-1'
    }

    const releaseLeaseId = internals.createReleaseLeaseId('openai-compatible', {
      sessionId: 'session-1',
      description: 'Task-1',
      prompt: 'Do 1',
      category: 'dayu',
      parentTaskId: 'workflow-1',
      metadata
    })

    await internals.waitForConcurrencySlot('openai-compatible', metadata, releaseLeaseId)
    internals.releaseConcurrencySlot('openai-compatible', releaseLeaseId)
    internals.releaseConcurrencySlot('openai-compatible', releaseLeaseId)

    const state = WorkforceWorkerDispatcher.getDispatcherStateForTests()
    expect(state.inFlightByConcurrencyKey['openai-compatible'] ?? 0).toBe(0)
    expect(state.activeReleaseLeaseCount).toBe(0)
  })

  it('keeps inFlight non-negative across five queued tasks', async () => {
    const dispatcher = new WorkforceWorkerDispatcher()
    let activeDelegates = 0
    let maxActiveDelegates = 0

    mockDelegateEngine.delegateTask.mockImplementation(async input => {
      activeDelegates += 1
      maxActiveDelegates = Math.max(maxActiveDelegates, activeDelegates)
      await new Promise(resolve => setTimeout(resolve, 15))
      activeDelegates -= 1
      return { taskId: input.description, output: 'ok', success: true }
    })

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        dispatcher.dispatch({
          sessionId: 'session-1',
          description: `Task-${index + 1}`,
          prompt: `Do ${index + 1}`,
          category: 'dayu',
          parentTaskId: 'workflow-1',
          metadata: {
            concurrencyKey: 'openai-compatible',
            concurrencyLimit: 2,
            logicalTaskId: `task-${index + 1}`
          }
        })
      )
    )

    const state = WorkforceWorkerDispatcher.getDispatcherStateForTests()
    const transitions = state.inFlightTransitions.filter(item => item.key === 'openai-compatible')

    expect(transitions.length).toBeGreaterThan(0)
    expect(transitions.every(item => item.inFlight >= 0)).toBe(true)
    expect(Math.max(...transitions.map(item => item.inFlight))).toBeLessThanOrEqual(2)
    expect(maxActiveDelegates).toBe(2)
    expect(state.inFlightByConcurrencyKey['openai-compatible'] ?? 0).toBe(0)
    expect(state.waitersByConcurrencyKey['openai-compatible'] ?? 0).toBe(0)
  })
})

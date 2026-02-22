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
        metadata: { concurrencyKey: 'openai-compatible::gpt-4o-mini' }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task B',
        prompt: 'Do B',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible::gpt-4o-mini' }
      })
    ])

    expect(maxInFlight).toBe(1)
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
        metadata: { concurrencyKey: 'openai-compatible::gpt-4o-mini' }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task-2',
        prompt: 'Do 2',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible::gpt-4o-mini' }
      }),
      dispatcher.dispatch({
        sessionId: 'session-1',
        description: 'Task-3',
        prompt: 'Do 3',
        category: 'dayu',
        parentTaskId: 'workflow-1',
        metadata: { concurrencyKey: 'openai-compatible::gpt-4o-mini' }
      })
    ])

    expect(startOrder).toEqual(['Task-1', 'Task-2', 'Task-3'])
  })
})

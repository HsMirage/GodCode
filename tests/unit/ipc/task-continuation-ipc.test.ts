import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleTaskContinuationAbort,
  handleTaskContinuationGetConfig,
  handleTaskContinuationGetStatus,
  handleTaskContinuationSetConfig,
  handleTaskContinuationSetTodos
} from '../../../src/main/ipc/handlers/task-continuation'

const mocks = vi.hoisted(() => ({
  shouldContinue: vi.fn(),
  getIncompleteTodos: vi.fn(),
  getContinuationPrompt: vi.fn(),
  markAborted: vi.fn(),
  setTodos: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn()
}))

vi.mock('../../../src/main/services/task-continuation.service', () => ({
  taskContinuationService: {
    shouldContinue: (...args: any[]) => mocks.shouldContinue(...args),
    getIncompleteTodos: (...args: any[]) => mocks.getIncompleteTodos(...args),
    getContinuationPrompt: (...args: any[]) => mocks.getContinuationPrompt(...args),
    markAborted: (...args: any[]) => mocks.markAborted(...args),
    setTodos: (...args: any[]) => mocks.setTodos(...args),
    getConfig: (...args: any[]) => mocks.getConfig(...args),
    setConfig: (...args: any[]) => mocks.setConfig(...args)
  }
}))

describe('task continuation IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns task continuation status snapshot', async () => {
    const status = {
      shouldContinue: true,
      incompleteTodos: [{ id: 'todo-1', content: 'pending', status: 'pending', priority: 'high' }],
      continuationPrompt: 'continue-now'
    }

    mocks.shouldContinue.mockReturnValueOnce(status.shouldContinue)
    mocks.getIncompleteTodos.mockReturnValueOnce(status.incompleteTodos)
    mocks.getContinuationPrompt.mockReturnValueOnce(status.continuationPrompt)

    await expect(handleTaskContinuationGetStatus({} as any, 'session-1')).resolves.toEqual(status)
    expect(mocks.shouldContinue).toHaveBeenCalledWith('session-1')
    expect(mocks.getIncompleteTodos).toHaveBeenCalledWith('session-1')
    expect(mocks.getContinuationPrompt).toHaveBeenCalledWith('session-1')
  })

  it('marks continuation as aborted', async () => {
    await expect(handleTaskContinuationAbort({} as any, 'session-1')).resolves.toEqual({
      success: true
    })
    expect(mocks.markAborted).toHaveBeenCalledWith('session-1')
  })

  it('accepts todo snapshots for continuation', async () => {
    const payload = {
      sessionId: 'session-1',
      todos: [{ id: 'todo-1', content: 'pending', status: 'pending', priority: 'high' }]
    }

    await expect(handleTaskContinuationSetTodos({} as any, payload)).resolves.toEqual({ success: true })
    expect(mocks.setTodos).toHaveBeenCalledWith('session-1', payload.todos)
  })

  it('returns continuation config envelope', async () => {
    const config = {
      countdownSeconds: 2,
      idleDedupWindowMs: 500,
      abortWindowMs: 3000
    }
    mocks.getConfig.mockReturnValueOnce(config)

    await expect(handleTaskContinuationGetConfig({} as any)).resolves.toEqual({
      success: true,
      data: config
    })
    expect(mocks.getConfig).toHaveBeenCalledTimes(1)
  })

  it('updates continuation config envelope', async () => {
    const nextConfig = {
      countdownSeconds: 3,
      idleDedupWindowMs: 700,
      abortWindowMs: 4500
    }
    const patch = {
      countdownSeconds: 3,
      abortWindowMs: 4500
    }
    mocks.setConfig.mockReturnValueOnce(nextConfig)

    await expect(handleTaskContinuationSetConfig({} as any, patch)).resolves.toEqual({
      success: true,
      data: nextConfig
    })
    expect(mocks.setConfig).toHaveBeenCalledWith(patch)
  })
})

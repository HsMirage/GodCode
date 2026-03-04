import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerSessionContinuityHandlers } from '../../../src/main/ipc/handlers/session-continuity'

const mocks = vi.hoisted(() => ({
  getSessionState: vi.fn(),
  createCheckpoint: vi.fn(),
  createRecoveryPlan: vi.fn(),
  executeRecovery: vi.fn(),
  getRecoverableSessions: vi.fn(),
  generateResumePrompt: vi.fn(),
  dbInit: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../../../src/main/services/session-continuity.service', () => ({
  sessionContinuityService: {
    getSessionState: (...args: any[]) => mocks.getSessionState(...args),
    createCheckpoint: (...args: any[]) => mocks.createCheckpoint(...args),
    createRecoveryPlan: (...args: any[]) => mocks.createRecoveryPlan(...args),
    executeRecovery: (...args: any[]) => mocks.executeRecovery(...args),
    getRecoverableSessions: (...args: any[]) => mocks.getRecoverableSessions(...args),
    generateResumePrompt: (...args: any[]) => mocks.generateResumePrompt(...args)
  }
}))

vi.mock('../../../src/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      init: (...args: any[]) => mocks.dbInit(...args)
    })
  }
}))

describe('session continuity IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dbInit.mockResolvedValue(undefined)
  })

  it('registers all session continuity channels', () => {
    registerSessionContinuityHandlers()

    const channels = (ipcMain.handle as any).mock.calls.map((call: any[]) => call[0])
    expect(channels).toContain('session-state:get')
    expect(channels).toContain('session-state:checkpoint')
    expect(channels).toContain('session-recovery:plan')
    expect(channels).toContain('session-recovery:execute')
    expect(channels).toContain('session-recovery:list')
    expect(channels).toContain('session-recovery:resume-prompt')
  })

  it('returns checkpoint success and failure envelopes', async () => {
    registerSessionContinuityHandlers()

    const checkpointHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'session-state:checkpoint'
    )?.[1]

    mocks.createCheckpoint.mockResolvedValueOnce(undefined)
    await expect(checkpointHandler({}, 'session-1')).resolves.toEqual({ success: true })

    mocks.createCheckpoint.mockRejectedValueOnce(new Error('checkpoint failed'))
    await expect(checkpointHandler({}, 'session-1')).resolves.toEqual({
      success: false,
      error: 'checkpoint failed'
    })
  })

  it('passes through recovery plan and resume prompt', async () => {
    registerSessionContinuityHandlers()

    const planHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'session-recovery:plan'
    )?.[1]
    const promptHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'session-recovery:resume-prompt'
    )?.[1]

    const plan = {
      sessionId: 'session-1',
      status: 'crashed',
      canRecover: true,
      recoveryType: 'rebuild',
      steps: [],
      estimatedActions: 0,
      context: { spaceId: 'space-1', workDir: '/tmp/workdir' },
      checkpoint: {
        pendingTasks: [],
        inProgressTasks: [],
        completedTasks: [],
        messageCount: 0,
        lastActivityAt: new Date('2026-03-01T00:00:00.000Z'),
        checkpointAt: new Date('2026-03-01T00:00:00.000Z')
      }
    }

    mocks.createRecoveryPlan.mockResolvedValueOnce(plan)
    mocks.generateResumePrompt.mockResolvedValueOnce('resume prompt')

    await expect(planHandler({}, 'session-1')).resolves.toEqual(plan)
    await expect(promptHandler({}, 'session-1')).resolves.toBe('resume prompt')
  })

  it('returns execute recovery success and catches thrown errors', async () => {
    registerSessionContinuityHandlers()

    const executeHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'session-recovery:execute'
    )?.[1]

    mocks.executeRecovery.mockResolvedValueOnce(true)
    await expect(executeHandler({}, 'session-1')).resolves.toEqual({ success: true })

    mocks.executeRecovery.mockRejectedValueOnce(new Error('execute failed'))
    await expect(executeHandler({}, 'session-1')).resolves.toEqual({
      success: false,
      error: 'execute failed'
    })
  })

  it('initializes database before listing recoverable sessions', async () => {
    registerSessionContinuityHandlers()

    const listHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'session-recovery:list'
    )?.[1]

    const recoverable = [{ sessionId: 'session-1' }]
    mocks.getRecoverableSessions.mockResolvedValueOnce(recoverable)

    await expect(listHandler({})).resolves.toEqual(recoverable)
    expect(mocks.dbInit).toHaveBeenCalledTimes(1)
  })
})

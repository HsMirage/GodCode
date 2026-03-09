import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecoveryPlan, SessionState } from '@/main/services/session-continuity.service'

const mocks = vi.hoisted(() => {
  const db = {
    systemSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn()
    },
    sessionState: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    message: {
      findMany: vi.fn()
    },
    task: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    session: {
      findUnique: vi.fn()
    },
    space: {
      findUnique: vi.fn()
    }
  }

  return { db }
})

const completeRecovery = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mocks.db
    })
  }
}))

vi.mock('@/main/services/auto-resume-trigger.service', () => ({
  AutoResumeTriggerService: {
    getInstance: () => ({
      completeRecovery: (...args: any[]) => completeRecovery(...args)
    })
  }
}))

import { SessionContinuityService } from '@/main/services/session-continuity.service'

describe('SessionContinuityService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mocks.db.systemSetting.findUnique.mockResolvedValue(null)
    mocks.db.systemSetting.upsert.mockResolvedValue({})
    mocks.db.systemSetting.delete.mockResolvedValue({})

    mocks.db.sessionState.findMany.mockResolvedValue([])
    mocks.db.sessionState.findUnique.mockResolvedValue(null)
    mocks.db.sessionState.create.mockResolvedValue({})
    mocks.db.sessionState.update.mockResolvedValue({})
    mocks.db.sessionState.updateMany.mockResolvedValue({ count: 0 })

    mocks.db.message.findMany.mockResolvedValue([])
    mocks.db.task.findUnique.mockResolvedValue(null)
    mocks.db.task.update.mockResolvedValue({})
    completeRecovery.mockResolvedValue({ sessionId: 'session-1', messageCount: 0 })
  })

  afterEach(async () => {
    await SessionContinuityService.getInstance().shutdown()
    vi.useRealTimers()
  })

  it('marks active sessions as crashed during initialize when crash marker exists', async () => {
    const service = SessionContinuityService.getInstance()
    const saveStateSpy = vi.spyOn(service, 'saveSessionState').mockResolvedValue({} as SessionState)

    mocks.db.systemSetting.findUnique.mockResolvedValueOnce({
      key: 'session_crash_marker',
      value: JSON.stringify({ timestamp: '2026-03-01T00:00:00.000Z' })
    })
    mocks.db.sessionState.findMany.mockResolvedValueOnce([
      { sessionId: 'session-a' },
      { sessionId: 'session-b' }
    ])

    const crashInfo = await service.initialize()

    expect(crashInfo.detected).toBe(true)
    expect(crashInfo.sessionIds).toEqual(['session-a', 'session-b'])
    expect(saveStateSpy).toHaveBeenCalledTimes(2)
    expect(saveStateSpy).toHaveBeenCalledWith(
      'session-a',
      'crashed',
      {},
      expect.objectContaining({
        recoverySource: 'crash-recovery',
        recoveryStage: 'detected',
        resumeReason: 'crash-detected',
        resumeAction: 'show-recovery-dialog'
      })
    )
    expect(mocks.db.systemSetting.upsert).toHaveBeenCalledTimes(1)
  })

  it('builds recovery plan with rebuild steps for crashed session', async () => {
    const service = SessionContinuityService.getInstance()

    const state: SessionState = {
      id: 'state-1',
      sessionId: 'session-1',
      status: 'crashed',
      checkpoint: {
        pendingTasks: ['task-pending'],
        inProgressTasks: ['task-running'],
        completedTasks: ['task-done'],
        messageCount: 3,
        lastActivityAt: new Date('2026-03-01T00:00:00.000Z'),
        checkpointAt: new Date('2026-03-01T00:01:00.000Z')
      },
      context: {
        spaceId: 'space-1',
        workDir: '/tmp/workdir'
      },
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:01:00.000Z')
    }

    vi.spyOn(service, 'getSessionState').mockResolvedValue(state)

    const plan = await service.createRecoveryPlan('session-1')

    expect(plan.canRecover).toBe(true)
    expect(plan.recoveryType).toBe('rebuild')
    expect(plan.steps.map(step => step.type)).toEqual([
      'load_messages',
      'restore_tasks',
      'rebuild_context',
      'resume_task',
      'notify_user'
    ])
    expect(plan.steps.find(step => step.type === 'resume_task')?.taskId).toBe('task-running')
  })

  it('treats empty plan as no-op recovery', async () => {
    const service = SessionContinuityService.getInstance()

    const noOpPlan: RecoveryPlan = {
      sessionId: 'session-1',
      status: 'completed',
      canRecover: false,
      recoveryType: 'none',
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

    vi.spyOn(service, 'createRecoveryPlan').mockResolvedValue(noOpPlan)
    const saveStateSpy = vi.spyOn(service, 'saveSessionState')

    const ok = await service.executeRecovery('session-1')

    expect(ok).toBe(true)
    expect(saveStateSpy).not.toHaveBeenCalled()
  })

  it('returns false and records interrupted state when recovery step fails', async () => {
    const service = SessionContinuityService.getInstance()

    const plan: RecoveryPlan = {
      sessionId: 'session-1',
      status: 'crashed',
      canRecover: true,
      recoveryType: 'rebuild',
      steps: [
        {
          order: 0,
          type: 'load_messages',
          description: 'Load messages'
        }
      ],
      estimatedActions: 1,
      context: { spaceId: 'space-1', workDir: '/tmp/workdir' },
      checkpoint: {
        pendingTasks: [],
        inProgressTasks: [],
        completedTasks: [],
        messageCount: 1,
        lastActivityAt: new Date('2026-03-01T00:00:00.000Z'),
        checkpointAt: new Date('2026-03-01T00:00:00.000Z')
      }
    }

    vi.spyOn(service, 'createRecoveryPlan').mockResolvedValue(plan)
    mocks.db.message.findMany.mockRejectedValueOnce(new Error('recover failed'))
    const saveStateSpy = vi.spyOn(service, 'saveSessionState').mockResolvedValue({} as SessionState)

    const ok = await service.executeRecovery('session-1')

    expect(ok).toBe(false)
    expect(saveStateSpy).toHaveBeenNthCalledWith(
      1,
      'session-1',
      'recovering',
      {},
      expect.objectContaining({
        recoverySource: 'crash-recovery',
        recoveryStage: 'session-recovery',
        resumeReason: 'crash-detected',
        resumeAction: 'restore-session'
      })
    )
    expect(saveStateSpy).toHaveBeenNthCalledWith(
      2,
      'session-1',
      'interrupted',
      {},
      expect.objectContaining({
        recoverySource: 'crash-recovery',
        recoveryStage: 'failed',
        resumeReason: 'recovery-failed',
        recoveryHints: [expect.stringContaining('recover failed')]
      })
    )
  })

  it('restores interrupted tasks and stamps unified recovery metadata', async () => {
    const service = SessionContinuityService.getInstance()

    const plan: RecoveryPlan = {
      sessionId: 'session-1',
      status: 'crashed',
      canRecover: true,
      recoveryType: 'rebuild',
      steps: [
        {
          order: 0,
          type: 'restore_tasks',
          description: 'Restore tasks'
        },
        {
          order: 1,
          type: 'resume_task',
          description: 'Resume task task-running',
          taskId: 'task-running'
        }
      ],
      estimatedActions: 2,
      context: { spaceId: 'space-1', workDir: '/tmp/workdir' },
      checkpoint: {
        pendingTasks: ['task-pending'],
        inProgressTasks: ['task-running'],
        completedTasks: [],
        messageCount: 0,
        lastActivityAt: new Date('2026-03-01T00:00:00.000Z'),
        checkpointAt: new Date('2026-03-01T00:00:00.000Z')
      }
    }

    mocks.db.task.findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 'task-running', metadata: { existing: true } })
      .mockResolvedValueOnce({ id: 'task-pending', metadata: {} })
      .mockResolvedValueOnce({ id: 'task-running', metadata: { existing: true } })

    vi.spyOn(service, 'createRecoveryPlan').mockResolvedValue(plan)
    vi.spyOn(service, 'saveSessionState').mockResolvedValue({} as SessionState)

    const ok = await service.executeRecovery('session-1')

    expect(ok).toBe(true)
    expect(completeRecovery).toHaveBeenCalledWith('session-1')
    expect(mocks.db.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-running' },
        data: expect.objectContaining({
          status: 'pending',
          metadata: expect.objectContaining({
            recoverySource: 'crash-recovery',
            recoveryStage: 'session-recovery',
            resumeReason: 'crash-detected',
            resumeAction: 'restore-session'
          })
        })
      })
    )
    expect(mocks.db.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-running' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            recoverySource: 'crash-recovery',
            recoveryStage: 'task-resumption',
            resumeReason: 'crash-detected',
            resumeAction: 'resume-tasks',
            resumedFrom: 'crash_recovery'
          })
        })
      })
    )
  })
})

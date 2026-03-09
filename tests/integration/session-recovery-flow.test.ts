import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecoveryPlan, SessionState } from '@/main/services/session-continuity.service'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  db: {
    message: {
      findMany: vi.fn()
    },
    task: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (...args: any[]) => mocks.send(...args)
        }
      }
    ])
  }
}))

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mocks.db
    })
  }
}))

import { SessionContinuityService } from '@/main/services/session-continuity.service'

describe('session recovery flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.db.task.findUnique.mockResolvedValue(null)
    mocks.db.task.update.mockResolvedValue({})
  })

  it('replays recovered messages and emits recovery events in order', async () => {
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
          description: 'Load recent messages'
        }
      ],
      estimatedActions: 1,
      context: {
        spaceId: 'space-1',
        workDir: '/tmp/workdir'
      },
      checkpoint: {
        pendingTasks: [],
        inProgressTasks: [],
        completedTasks: [],
        messageCount: 2,
        lastActivityAt: new Date('2026-03-06T00:00:00.000Z'),
        checkpointAt: new Date('2026-03-06T00:00:00.000Z')
      }
    }

    const saveStateSpy = vi.spyOn(service, 'saveSessionState').mockResolvedValue({} as SessionState)
    vi.spyOn(service, 'createRecoveryPlan').mockResolvedValue(plan)

    const newestFirst = [
      {
        id: 'message-2',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Recovered answer',
        metadata: null,
        createdAt: new Date('2026-03-06T00:02:00.000Z')
      },
      {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'Recovered question',
        metadata: null,
        createdAt: new Date('2026-03-06T00:01:00.000Z')
      }
    ]

    mocks.db.message.findMany
      .mockResolvedValueOnce(newestFirst)
      .mockResolvedValueOnce(newestFirst)

    const ok = await service.executeRecovery('session-1')

    expect(ok).toBe(true)
    expect(saveStateSpy).toHaveBeenCalled()
    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      'session:recovery-progress',
      expect.objectContaining({
        sessionId: 'session-1',
        step: 'load_messages',
        status: 'completed',
        messageCount: 2,
        messages: [
          expect.objectContaining({ id: 'message-1', role: 'user' }),
          expect.objectContaining({ id: 'message-2', role: 'assistant' })
        ]
      })
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      'session:recovered',
      expect.objectContaining({
        sessionId: 'session-1',
        step: 'load_messages',
        status: 'completed',
        messageCount: 2,
        messages: [
          expect.objectContaining({ id: 'message-1', role: 'user' }),
          expect.objectContaining({ id: 'message-2', role: 'assistant' })
        ]
      })
    )
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutoResumeTriggerService } from '@/main/services/auto-resume-trigger.service'
import { SessionIdleDetectionService } from '@/main/services/session-idle-detection.service'
import { ResumeContextRestorationService } from '@/main/services/resume-context-restoration.service'

vi.mock('@/main/services/session-idle-detection.service')
vi.mock('@/main/services/resume-context-restoration.service')

const recoverMessages = vi.fn()

vi.mock('@/main/services/session-recovery-executor.service', () => ({
  sessionRecoveryExecutorService: {
    recoverMessages: (...args: any[]) => recoverMessages(...args)
  }
}))

describe('AutoResumeTriggerService', () => {
  let service: AutoResumeTriggerService
  let idleServiceMock: any
  let resumeContextMock: any

  beforeEach(() => {
    idleServiceMock = {
      isSessionIdle: vi.fn(),
      getIdleDuration: vi.fn()
    }

    resumeContextMock = {
      generateResumeContext: vi.fn()
    }

    vi.mocked(SessionIdleDetectionService.getInstance).mockReturnValue(idleServiceMock)
    vi.mocked(ResumeContextRestorationService.getInstance).mockReturnValue(resumeContextMock)

    service = AutoResumeTriggerService.getInstance()
    service.setConfig({
      minIdleDurationMs: 5 * 60 * 1000,
      requireIncompleteTodos: false,
      requireIncompletePlanTasks: false
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should be a singleton', () => {
    expect(AutoResumeTriggerService.getInstance()).toBe(AutoResumeTriggerService.getInstance())
  })

  describe('shouldTriggerResume', () => {
    it('triggers when idle and incomplete todos exist', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(10 * 60 * 1000)
      resumeContextMock.generateResumeContext.mockResolvedValue({
        canResume: true,
        recovery: {
          recoverySource: 'manual-resume',
          recoveryStage: 'context-rebuild',
          resumeReason: 'pending-todos',
          resumeAction: 'rebuild-context',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        },
        workStatus: {
          incompleteTodos: [{ id: 'todo-1', status: 'pending' }],
          incompletePlanTasks: []
        }
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(true)
      expect(result.reason).toContain('Idle for 10m')
      expect(result.incompleteTodos).toBe(1)
      expect(result.recoveryContext.recoverySource).toBe('auto-resume')
      expect(result.recoveryContext.resumeReason).toBe('pending-todos')
      expect(result.recoveryContext.resumeAction).toBe('auto-send-resume-prompt')
    })

    it('does not trigger when session is still active', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(false)
      idleServiceMock.getIdleDuration.mockResolvedValue(1000)
      resumeContextMock.generateResumeContext.mockResolvedValue({
        canResume: true,
        recovery: {
          recoverySource: 'manual-resume',
          recoveryStage: 'context-rebuild',
          resumeReason: 'pending-todos',
          resumeAction: 'rebuild-context',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        },
        workStatus: {
          incompleteTodos: [{ id: 'todo-1', status: 'pending' }],
          incompletePlanTasks: []
        }
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(false)
      expect(result.reason).toBe('Session is still active')
      expect(result.confidence).toBe(0)
    })

    it('does not trigger if todos are required but missing', async () => {
      service.setConfig({ requireIncompleteTodos: true })
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(10 * 60 * 1000)
      resumeContextMock.generateResumeContext.mockResolvedValue({
        canResume: true,
        recovery: {
          recoverySource: 'manual-resume',
          recoveryStage: 'context-rebuild',
          resumeReason: 'pending-plan-tasks',
          resumeAction: 'rebuild-context',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        },
        workStatus: {
          incompleteTodos: [],
          incompletePlanTasks: [{ id: 'task-1' }]
        }
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(false)
      expect(result.reason).toBe('No incomplete TODOs')
    })

    it('triggers if plan tasks are required and present', async () => {
      service.setConfig({ requireIncompletePlanTasks: true })
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(10 * 60 * 1000)
      resumeContextMock.generateResumeContext.mockResolvedValue({
        canResume: true,
        recovery: {
          recoverySource: 'manual-resume',
          recoveryStage: 'context-rebuild',
          resumeReason: 'pending-plan-tasks',
          resumeAction: 'rebuild-context',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        },
        workStatus: {
          incompleteTodos: [],
          incompletePlanTasks: [{ id: 'task-1' }]
        }
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(true)
      expect(result.incompletePlanTasks).toBe(1)
      expect(result.recoveryContext.resumeReason).toBe('pending-plan-tasks')
    })

    it('calculates confidence from idle duration and work size', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(30 * 60 * 1000)
      resumeContextMock.generateResumeContext.mockResolvedValue({
        canResume: true,
        recovery: {
          recoverySource: 'manual-resume',
          recoveryStage: 'context-rebuild',
          resumeReason: 'pending-todos',
          resumeAction: 'rebuild-context',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        },
        workStatus: {
          incompleteTodos: Array.from({ length: 5 }, () => ({ status: 'pending' })),
          incompletePlanTasks: Array.from({ length: 5 }, () => ({ id: 'task' }))
        }
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.confidence).toBe(1)
    })

    it('does not trigger when no pending work exists', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(5 * 60 * 1000)
      resumeContextMock.generateResumeContext.mockResolvedValue({
        canResume: false,
        recovery: {
          recoverySource: 'manual-resume',
          recoveryStage: 'context-rebuild',
          resumeReason: 'no-pending-work',
          resumeAction: 'rebuild-context',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        },
        workStatus: {
          incompleteTodos: [],
          incompletePlanTasks: []
        }
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(false)
      expect(result.reason).toBe('Idle for 5m but no resumable work detected')
      expect(result.recoveryContext.resumeReason).toBe('no-pending-work')
    })
  })

  describe('prevention and recording', () => {
    it('prevents duplicate resume within cooldown', () => {
      service.recordResume('session-dupe')
      expect(service.preventDuplicateResume('session-dupe', 5000)).toBe(true)
    })

    it('allows resume after cooldown', () => {
      vi.useFakeTimers()
      try {
        const sessionId = 'session-ok'
        service.recordResume(sessionId)
        vi.advanceTimersByTime(6000)
        expect(service.preventDuplicateResume(sessionId, 5000)).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('completes recovery by synchronizing messages and recording resume time', async () => {
      recoverMessages.mockResolvedValueOnce([{ id: 'message-1' }, { id: 'message-2' }])

      const result = await service.completeRecovery('session-recovered')

      expect(recoverMessages).toHaveBeenCalledWith('session-recovered', {
        emit: 'recovered'
      })
      expect(result).toEqual({
        sessionId: 'session-recovered',
        messageCount: 2
      })
      expect(service.preventDuplicateResume('session-recovered', 5000)).toBe(true)
    })
  })
})

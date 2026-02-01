import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutoResumeTriggerService } from '@/main/services/auto-resume-trigger.service'
import { SessionIdleDetectionService } from '@/main/services/session-idle-detection.service'
import { TodoIncompleteDetectionService } from '@/main/services/todo-incomplete-detection.service'

// Mock dependencies
vi.mock('@/main/services/session-idle-detection.service')
vi.mock('@/main/services/todo-incomplete-detection.service')

describe('AutoResumeTriggerService', () => {
  let service: AutoResumeTriggerService
  let idleServiceMock: any
  let incompleteServiceMock: any

  beforeEach(() => {
    // Setup mocks
    idleServiceMock = {
      isSessionIdle: vi.fn(),
      getIdleDuration: vi.fn()
    }

    incompleteServiceMock = {
      detectIncompleteWork: vi.fn()
    }

    // Mock getInstance implementation
    vi.mocked(SessionIdleDetectionService.getInstance).mockReturnValue(idleServiceMock)
    vi.mocked(TodoIncompleteDetectionService.getInstance).mockReturnValue(incompleteServiceMock)

    service = AutoResumeTriggerService.getInstance()
    // Reset config to defaults
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
    const instance1 = AutoResumeTriggerService.getInstance()
    const instance2 = AutoResumeTriggerService.getInstance()
    expect(instance1).toBe(instance2)
  })

  describe('shouldTriggerResume', () => {
    it('should trigger resume when idle and has work', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(10 * 60 * 1000) // 10 mins
      incompleteServiceMock.detectIncompleteWork.mockResolvedValue({
        incompleteTodos: [{ id: '1' }],
        incompletePlanTasks: [],
        totalIncomplete: 1
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(true)
      expect(result.reason).toContain('Idle for 10m')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should NOT trigger resume when session is active', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(false) // Active
      idleServiceMock.getIdleDuration.mockResolvedValue(1000)
      incompleteServiceMock.detectIncompleteWork.mockResolvedValue({
        incompleteTodos: [{ id: '1' }],
        incompletePlanTasks: [],
        totalIncomplete: 1
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(false)
      expect(result.reason).toContain('Session is still active')
      expect(result.confidence).toBe(0)
    })

    it('should NOT trigger resume if todos required but missing', async () => {
      service.setConfig({ requireIncompleteTodos: true })

      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(10 * 60 * 1000)
      incompleteServiceMock.detectIncompleteWork.mockResolvedValue({
        incompleteTodos: [], // No todos
        incompletePlanTasks: [{ id: '1' }], // Has plan tasks
        totalIncomplete: 1
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(false)
      expect(result.reason).toContain('No incomplete TODOs')
    })

    it('should trigger resume if plan tasks required and present', async () => {
      service.setConfig({ requireIncompletePlanTasks: true })

      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(10 * 60 * 1000)
      incompleteServiceMock.detectIncompleteWork.mockResolvedValue({
        incompleteTodos: [],
        incompletePlanTasks: [{ id: '1' }], // Has plan tasks
        totalIncomplete: 1
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.shouldResume).toBe(true)
    })

    it('should calculate confidence correctly', async () => {
      // 30 mins idle = 1.0 idle score
      // 10 items = 1.0 work score
      // Average = 1.0

      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(30 * 60 * 1000)
      incompleteServiceMock.detectIncompleteWork.mockResolvedValue({
        incompleteTodos: Array(5).fill({}),
        incompletePlanTasks: Array(5).fill({}),
        totalIncomplete: 10
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      expect(result.confidence).toBe(1.0)
    })

    it('should handle "no work" scenario with low confidence if not required', async () => {
      idleServiceMock.isSessionIdle.mockResolvedValue(true)
      idleServiceMock.getIdleDuration.mockResolvedValue(5 * 60 * 1000)
      incompleteServiceMock.detectIncompleteWork.mockResolvedValue({
        incompleteTodos: [],
        incompletePlanTasks: [],
        totalIncomplete: 0
      })

      const result = await service.shouldTriggerResume('session-1', 'plan-1')

      // Should still resume because we didn't require work, but confidence is low
      expect(result.shouldResume).toBe(true)
      expect(result.reason).toContain('No detected work')
      expect(result.confidence).toBe(0.2)
    })
  })

  describe('prevention and recording', () => {
    it('should prevent duplicate resume within cooldown', () => {
      const sessionId = 'session-dupe'
      service.recordResume(sessionId)

      const isPrevented = service.preventDuplicateResume(sessionId, 5000) // 5s cooldown
      expect(isPrevented).toBe(true)
    })

    it('should allow resume after cooldown', async () => {
      const sessionId = 'session-ok'
      service.recordResume(sessionId)

      const isPrevented = service.preventDuplicateResume(sessionId, 0)
      expect(isPrevented).toBe(false)
    })

    it('should record resume time', () => {
      const sessionId = 'session-rec'
      service.recordResume(sessionId)
      expect(service.preventDuplicateResume(sessionId, 1000)).toBe(true)
    })
  })

  describe('configuration', () => {
    it('should update config', () => {
      service.setConfig({ minIdleDurationMs: 999 })
      expect(service.getConfig().minIdleDurationMs).toBe(999)
    })
  })
})

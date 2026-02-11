import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskContinuationService, type Todo } from '@/main/services/task-continuation.service'
import fs from 'fs'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}))

describe('TaskContinuationService', () => {
  let service: TaskContinuationService
  const sessionId = 'test-session'

  beforeEach(() => {
    service = new TaskContinuationService()
    vi.useFakeTimers()
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getState', () => {
    it('should create a new state if it does not exist', () => {
      const state = service.getState(sessionId)
      expect(state).toEqual({ todos: [], isRecovering: false })
    })

    it('should return existing state', () => {
      const todos: Todo[] = [{ id: '1', content: 'test', status: 'pending', priority: 'medium' }]
      service.setTodos(sessionId, todos)
      const state = service.getState(sessionId)
      expect(state.todos).toEqual(todos)
    })
  })

  describe('setTodos', () => {
    it('should set todos for the session', () => {
      const todos: Todo[] = [{ id: '1', content: 'test', status: 'pending', priority: 'medium' }]
      service.setTodos(sessionId, todos)
      expect(service.getState(sessionId).todos).toEqual(todos)
    })
  })

  describe('getIncompleteTodos', () => {
    it('should return only pending and in_progress todos', () => {
      const todos: Todo[] = [
        { id: '1', content: 'done', status: 'completed', priority: 'medium' },
        { id: '2', content: 'working', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'waiting', status: 'pending', priority: 'medium' },
        { id: '4', content: 'stopped', status: 'cancelled', priority: 'medium' }
      ]
      service.setTodos(sessionId, todos)
      const incomplete = service.getIncompleteTodos(sessionId)
      expect(incomplete).toHaveLength(2)
      expect(incomplete.map(t => t.id)).toContain('2')
      expect(incomplete.map(t => t.id)).toContain('3')
    })
  })

  describe('shouldContinue', () => {
    it('should return false if session is recovering', () => {
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])
      service.markRecovering(sessionId)
      expect(service.shouldContinue(sessionId)).toBe(false)
    })

    it('should return true if there are incomplete todos', () => {
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])
      expect(service.shouldContinue(sessionId)).toBe(true)
    })

    it('should return false if there are no incomplete todos', () => {
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'completed', priority: 'medium' }
      ])
      expect(service.shouldContinue(sessionId)).toBe(false)
    })
  })

  describe('getContinuationPrompt', () => {
    it('should return null if shouldContinue is false', () => {
      expect(service.getContinuationPrompt(sessionId)).toBeNull()
    })

    it('should return a prompt with status if there are incomplete todos', () => {
      service.setTodos(sessionId, [
        { id: '1', content: 'done', status: 'completed', priority: 'medium' },
        { id: '2', content: 'pending', status: 'pending', priority: 'medium' }
      ])
      const prompt = service.getContinuationPrompt(sessionId)
      expect(prompt).toContain('[SYSTEM REMINDER - TODO CONTINUATION]')
      expect(prompt).toContain('[Status: 1/2 completed, 1 remaining]')
      expect(prompt).toContain('Read the active plan file')
    })

    it('should include plan path from boulder state when available', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          active_plan: '/tmp/.sisyphus/plans/demo.md',
          session_ids: [sessionId]
        })
      )

      service.setTodos(sessionId, [
        { id: '1', content: 'pending', status: 'pending', priority: 'medium' }
      ])
      const prompt = service.getContinuationPrompt(sessionId)
      expect(prompt).toContain('/tmp/.sisyphus/plans/demo.md')
    })
  })

  describe('markRecovering and markRecoveryComplete', () => {
    it('should update isRecovering flag and cancel countdown', () => {
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])
      const onContinue = vi.fn()
      service.startCountdown(sessionId, onContinue)

      service.markRecovering(sessionId)
      expect(service.getState(sessionId).isRecovering).toBe(true)

      vi.advanceTimersByTime(3000)
      expect(onContinue).not.toHaveBeenCalled()
    })

    it('should reset isRecovering flag on recovery complete', () => {
      service.markRecovering(sessionId)
      service.markRecoveryComplete(sessionId)
      expect(service.getState(sessionId).isRecovering).toBe(false)
    })
  })

  describe('markAborted and wasRecentlyAborted', () => {
    it('should track abort timestamp and cancel countdown', () => {
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])
      const onContinue = vi.fn()
      service.startCountdown(sessionId, onContinue)

      const now = 1000
      vi.setSystemTime(now)
      service.markAborted(sessionId)

      expect(service.getState(sessionId).abortDetectedAt).toBe(now)
      expect(service.wasRecentlyAborted(sessionId)).toBe(true)

      vi.advanceTimersByTime(3000)
      expect(onContinue).not.toHaveBeenCalled()
    })

    it('should return false if abort was outside window', () => {
      const now = 1000
      vi.setSystemTime(now)
      service.markAborted(sessionId)

      vi.setSystemTime(now + 4000)
      expect(service.wasRecentlyAborted(sessionId)).toBe(false)
      expect(service.getState(sessionId).abortDetectedAt).toBeUndefined()
    })
  })

  describe('countdown management', () => {
    it('should trigger onContinue after countdown if shouldContinue is true', () => {
      const onContinue = vi.fn()
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])

      service.startCountdown(sessionId, onContinue)
      expect(service.getState(sessionId).countdownTimer).toBeDefined()

      vi.advanceTimersByTime(2000)
      expect(onContinue).toHaveBeenCalled()
      expect(service.getState(sessionId).countdownTimer).toBeUndefined()
    })

    it('should not start countdown if no incomplete todos', () => {
      const onContinue = vi.fn()
      service.startCountdown(sessionId, onContinue)
      expect(service.getState(sessionId).countdownTimer).toBeUndefined()
    })

    it('should cancel existing countdown when starting a new one', () => {
      const onContinue1 = vi.fn()
      const onContinue2 = vi.fn()
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])

      service.startCountdown(sessionId, onContinue1)
      service.startCountdown(sessionId, onContinue2)

      vi.advanceTimersByTime(2000)
      expect(onContinue1).not.toHaveBeenCalled()
      expect(onContinue2).toHaveBeenCalled()
    })

    it('should cancel countdown manually', () => {
      const onContinue = vi.fn()
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])

      service.startCountdown(sessionId, onContinue)
      service.cancelCountdown(sessionId)

      vi.advanceTimersByTime(2000)
      expect(onContinue).not.toHaveBeenCalled()
      expect(service.getState(sessionId).countdownTimer).toBeUndefined()
    })

    it('should dedupe duplicate idle continuation triggers in short window', () => {
      vi.setSystemTime(10_000)
      service.setTodos(sessionId, [
        { id: '1', content: 'pending', status: 'pending', priority: 'medium' }
      ])

      const state = service.getState(sessionId)
      state.lastContinuationTriggeredAt = Date.now() + 1800
      const onContinue = vi.fn()

      service.startCountdown(sessionId, onContinue)
      vi.advanceTimersByTime(2000)

      expect(onContinue).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should remove session state and cancel countdown', () => {
      const onContinue = vi.fn()
      service.setTodos(sessionId, [
        { id: '1', content: 'test', status: 'pending', priority: 'medium' }
      ])
      service.startCountdown(sessionId, onContinue)

      service.cleanup(sessionId)

      vi.advanceTimersByTime(2000)
      expect(onContinue).not.toHaveBeenCalled()
      expect(service.getState(sessionId)).toEqual({ todos: [], isRecovering: false })
    })
  })

  describe('updateTodoStatus', () => {
    it('should update status of specific todo', () => {
      const todos: Todo[] = [{ id: '1', content: 'test', status: 'pending', priority: 'medium' }]
      service.setTodos(sessionId, todos)

      service.updateTodoStatus(sessionId, '1', 'completed')
      expect(service.getState(sessionId).todos[0].status).toBe('completed')
    })

    it('should do nothing if todo not found', () => {
      const todos: Todo[] = [{ id: '1', content: 'test', status: 'pending', priority: 'medium' }]
      service.setTodos(sessionId, todos)

      service.updateTodoStatus(sessionId, 'non-existent', 'completed')
      expect(service.getState(sessionId).todos[0].status).toBe('pending')
    })
  })

  describe('boulder session filter', () => {
    it('should block continuation for sessions not listed in boulder session_ids', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          active_plan: '/tmp/.sisyphus/plans/demo.md',
          session_ids: ['ses_other']
        })
      )

      service.setTodos(sessionId, [
        { id: '1', content: 'pending', status: 'pending', priority: 'medium' }
      ])

      expect(service.shouldContinue(sessionId)).toBe(false)
      expect(service.getContinuationPrompt(sessionId)).toBeNull()
    })
  })
})

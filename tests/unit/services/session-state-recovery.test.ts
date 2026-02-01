import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the three integrated services
vi.mock('@/main/services/boulder-state.service')
vi.mock('@/main/services/plan-file.service')
vi.mock('@/main/services/todo-tracking.service')

import { BoulderStateService } from '@/main/services/boulder-state.service'
import { PlanFileService } from '@/main/services/plan-file.service'
import { TodoTrackingService } from '@/main/services/todo-tracking.service'
import { SessionStateRecoveryService } from '@/main/services/session-state-recovery.service'

describe('SessionStateRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock BoulderStateService
    vi.mocked(BoulderStateService.getInstance).mockReturnValue({
      getState: vi.fn().mockResolvedValue({
        active_plan: 'test-plan',
        status: 'in_progress',
        completed_tasks: 50,
        total_tasks: 100,
        completion_percentage: '50.0%',
        current_phase: 'Phase 8',
        phase_status: {},
        blockers: [],
        next_actionable_tasks: [],
        last_updated: '2026-01-31T12:00:00Z'
      })
    } as any)

    // Mock PlanFileService
    vi.mocked(PlanFileService.getInstance).mockReturnValue({
      getPlanMetadata: vi.fn().mockResolvedValue({
        name: 'test-plan',
        path: '/path/to/plan.md',
        totalTasks: 100,
        completedTasks: 50,
        pendingTasks: 50,
        completionPercentage: '50.0%',
        phases: ['Phase 8']
      }),
      parsePlan: vi.fn().mockResolvedValue([
        {
          id: '8.1.1',
          description: 'Task 1',
          completed: true,
          lineNumber: 10,
          phase: 'Phase 8',
          section: '8.1'
        },
        {
          id: '8.1.2',
          description: 'Task 2',
          completed: false,
          lineNumber: 11,
          phase: 'Phase 8',
          section: '8.1'
        }
      ])
    } as any)

    // Mock TodoTrackingService
    vi.mocked(TodoTrackingService.getInstance).mockReturnValue({
      getIncompleteTodos: vi.fn().mockResolvedValue([
        {
          id: 'todo-1',
          content: 'Pending task',
          status: 'pending',
          priority: 'high',
          sessionId: 'session-1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]),
      getTodoStats: vi.fn().mockResolvedValue({
        total: 5,
        pending: 1,
        inProgress: 0,
        completed: 4,
        cancelled: 0,
        byPriority: { low: 1, medium: 2, high: 2 }
      }),
      getTodosByStatus: vi.fn().mockResolvedValue([])
    } as any)
  })

  it('should be a singleton', () => {
    const instance1 = SessionStateRecoveryService.getInstance()
    const instance2 = SessionStateRecoveryService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('should capture session state snapshot', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const snapshot = await service.captureSessionState('session-1', 'test-plan')

    expect(snapshot).toBeDefined()
    expect(snapshot.sessionId).toBe('session-1')
    expect(snapshot.planName).toBe('test-plan')
    expect(snapshot.projectState.completionPercentage).toBe('50.0%')
    expect(snapshot.planState.totalTasks).toBe(100)
    expect(snapshot.todoState.incompleteTodos).toHaveLength(1)
    expect(snapshot.recoveryContext.shouldResume).toBe(true)
  })

  it('should save and load snapshot', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const snapshot = await service.captureSessionState('session-1', 'test-plan')

    await service.saveSnapshot(snapshot)
    const loaded = await service.loadSnapshot('session-1')

    expect(loaded).toBeDefined()
    expect(loaded?.sessionId).toBe('session-1')
    expect(loaded?.capturedAt).toBe(snapshot.capturedAt)
  })

  it('should get recovery context indicating resume needed', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const context = await service.getRecoveryContext('session-1', 'test-plan')

    expect(context.canResume).toBe(true)
    expect(context.reason).toContain('Pending TODO items')
    expect(context.todosPending).toBeGreaterThan(0)
    expect(context.suggestedAction).toContain('Resume pending TODOs')
  })

  it('should determine no resume needed if work complete', async () => {
    // Override mocks for clean state
    vi.mocked(TodoTrackingService.getInstance).mockReturnValue({
      getIncompleteTodos: vi.fn().mockResolvedValue([]),
      getTodoStats: vi.fn().mockResolvedValue({
        total: 5,
        pending: 0,
        inProgress: 0,
        completed: 5,
        cancelled: 0,
        byPriority: {}
      }),
      getTodosByStatus: vi.fn().mockResolvedValue([])
    } as any)

    vi.mocked(PlanFileService.getInstance).mockReturnValue({
      getPlanMetadata: vi.fn().mockResolvedValue({
        name: 'test-plan',
        path: '/path/to/plan.md',
        totalTasks: 100,
        completedTasks: 100,
        pendingTasks: 0,
        completionPercentage: '100.0%',
        phases: ['Phase 8']
      }),
      parsePlan: vi.fn().mockResolvedValue([]) // No tasks pending
    } as any)

    const service = SessionStateRecoveryService.getInstance()
    const context = await service.getRecoveryContext('session-1', 'test-plan')

    expect(context.canResume).toBe(false)
    expect(context.reason).toBe('No active work detected')
  })

  it('should generate resume prompt with TODOs', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const prompt = await service.generateResumePrompt('session-1', 'test-plan')

    expect(prompt).toContain('# Session Recovery - test-plan')
    expect(prompt).toContain('Pending TODOs')
    expect(prompt).toContain('Pending task')
  })

  it('should generate resume prompt with next tasks', async () => {
    // Ensure we have next actionable tasks but no TODOs
    vi.mocked(TodoTrackingService.getInstance).mockReturnValue({
      getIncompleteTodos: vi.fn().mockResolvedValue([]),
      getTodoStats: vi.fn().mockResolvedValue({
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        byPriority: {}
      }),
      getTodosByStatus: vi.fn().mockResolvedValue([])
    } as any)

    const service = SessionStateRecoveryService.getInstance()
    const prompt = await service.generateResumePrompt('session-1', 'test-plan')

    expect(prompt).toContain('Next Tasks:')
    expect(prompt).toContain('Task 8.1.2')
  })

  it('should detect interruption from in_progress TODOs', async () => {
    vi.mocked(TodoTrackingService.getInstance).mockReturnValue({
      getTodosByStatus: vi.fn().mockResolvedValue([
        {
          id: 'todo-1',
          content: 'Interrupted task',
          status: 'in_progress'
        }
      ]),
      getIncompleteTodos: vi.fn().mockResolvedValue([]),
      getTodoStats: vi.fn().mockResolvedValue({
        total: 1,
        pending: 0,
        inProgress: 1,
        completed: 0,
        cancelled: 0,
        byPriority: {}
      })
    } as any)

    const service = SessionStateRecoveryService.getInstance()
    const interrupted = await service.detectInterruption('session-1')

    expect(interrupted).toBe(true)

    const context = await service.getRecoveryContext('session-1', 'test-plan')
    expect(context.canResume).toBe(true)
    expect(context.reason).toContain('interrupted')
    expect(context.suggestedAction).toContain('Resume interrupted work')
  })

  it('should calculate progress correctly', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const progress = await service.calculateProgress('test-plan')

    expect(progress.completed).toBe(50)
    expect(progress.total).toBe(100)
    expect(progress.percentage).toBe('50.0%')
  })

  it('should get next actionable tasks', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const tasks = await service.getNextActionableTasks('test-plan')

    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('8.1.2')
  })

  it('should validate snapshot structure', async () => {
    const service = SessionStateRecoveryService.getInstance()
    const snapshot = await service.captureSessionState('session-1', 'test-plan')

    // @ts-ignore - access private method for testing
    const isValid = service.validateSnapshot(snapshot)
    expect(isValid).toBe(true)

    // @ts-ignore
    const isInvalid = service.validateSnapshot({})
    expect(isInvalid).toBe(false)
  })
})

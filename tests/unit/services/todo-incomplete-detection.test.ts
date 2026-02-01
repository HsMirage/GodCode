import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodoIncompleteDetectionService } from '../../../src/main/services/todo-incomplete-detection.service'
import { TodoTrackingService } from '../../../src/main/services/todo-tracking.service'
import { PlanFileService } from '../../../src/main/services/plan-file.service'
import { BoulderStateService } from '../../../src/main/services/boulder-state.service'

vi.mock('../../../src/main/services/todo-tracking.service')
vi.mock('../../../src/main/services/plan-file.service')
vi.mock('../../../src/main/services/boulder-state.service')

describe('TodoIncompleteDetectionService', () => {
  let service: TodoIncompleteDetectionService

  const mockTodoService = {
    getIncompleteTodos: vi.fn(),
    listTodos: vi.fn()
  }

  const mockPlanService = {
    parsePlan: vi.fn()
  }

  const mockBoulderService = {
    getState: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(TodoTrackingService.getInstance).mockReturnValue(mockTodoService as any)
    vi.mocked(PlanFileService.getInstance).mockReturnValue(mockPlanService as any)
    vi.mocked(BoulderStateService.getInstance).mockReturnValue(mockBoulderService as any)

    // @ts-ignore - Accessing private static property for testing
    TodoIncompleteDetectionService.instance = null
    service = TodoIncompleteDetectionService.getInstance()
  })

  it('should be a singleton', () => {
    const instance1 = TodoIncompleteDetectionService.getInstance()
    const instance2 = TodoIncompleteDetectionService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('should detect incomplete work correctly', async () => {
    const mockTodos = [{ id: '1', status: 'pending' }]
    const mockPlanTasks = [{ id: '1.1', completed: false }]
    const mockBoulderState = { blockers: [] }

    mockTodoService.getIncompleteTodos.mockResolvedValue(mockTodos)
    mockPlanService.parsePlan.mockResolvedValue(mockPlanTasks)
    mockBoulderService.getState.mockResolvedValue(mockBoulderState)

    const result = await service.detectIncompleteWork('session-1', 'plan-1')

    expect(result.incompleteTodos).toEqual(mockTodos)
    expect(result.incompletePlanTasks).toHaveLength(1)
    expect(result.totalIncomplete).toBe(2)
    expect(result.hasBlockers).toBe(false)
  })

  it('should return true when incomplete todos exist', async () => {
    mockTodoService.getIncompleteTodos.mockResolvedValue([{ id: '1' }])
    const result = await service.hasIncompleteTodos('session-1')
    expect(result).toBe(true)
  })

  it('should return true when incomplete plan tasks exist', async () => {
    mockPlanService.parsePlan.mockResolvedValue([{ completed: false }])
    const result = await service.hasIncompletePlanTasks('plan-1')
    expect(result).toBe(true)
  })

  it('should prioritize in_progress TODOs for next task', async () => {
    const inProgressTodo = { id: '1', status: 'in_progress' }
    const pendingTodo = { id: '2', status: 'pending' }

    mockTodoService.getIncompleteTodos.mockResolvedValue([inProgressTodo, pendingTodo])

    const nextTask = await service.getNextIncompleteTask('session-1', 'plan-1')
    expect(nextTask).toEqual(inProgressTodo)
  })

  it('should prioritize high priority TODOs over plan tasks', async () => {
    const highPriorityTodo = { id: '1', status: 'pending', priority: 'high' }
    const planTask = { id: '1.1', completed: false }

    mockTodoService.getIncompleteTodos.mockResolvedValue([highPriorityTodo])
    mockPlanService.parsePlan.mockResolvedValue([planTask])

    const nextTask = await service.getNextIncompleteTask('session-1', 'plan-1')
    expect(nextTask).toEqual(highPriorityTodo)
  })

  it('should fallback to plan task if no high priority todos', async () => {
    const lowPriorityTodo = { id: '1', status: 'pending', priority: 'low' }
    const planTask = { id: '1.1', completed: false }

    mockTodoService.getIncompleteTodos.mockResolvedValue([lowPriorityTodo])
    mockPlanService.parsePlan.mockResolvedValue([planTask])

    const nextTask = await service.getNextIncompleteTask('session-1', 'plan-1')
    expect(nextTask).toEqual(planTask)
  })

  it('should calculate completion ratio correctly', async () => {
    mockTodoService.getIncompleteTodos.mockResolvedValue([{ id: '2', status: 'pending' }])
    mockTodoService.listTodos.mockResolvedValue([
      { id: '1', status: 'completed' },
      { id: '2', status: 'pending' }
    ])

    mockPlanService.parsePlan.mockResolvedValue([
      { id: '1.1', completed: true },
      { id: '1.2', completed: false }
    ])

    const ratio = await service.calculateCompletionRatio('session-1', 'plan-1')
    expect(ratio).toBe(0.5)
  })

  it('should prioritize work in correct order', async () => {
    const inProgress = { id: '1', status: 'in_progress', priority: 'medium' }
    const highPriority = { id: '2', status: 'pending', priority: 'high' }
    const lowPriority = { id: '3', status: 'pending', priority: 'low' }
    const planTask = { id: '1.1', completed: false }

    mockTodoService.getIncompleteTodos.mockResolvedValue([inProgress, highPriority, lowPriority])
    mockPlanService.parsePlan.mockResolvedValue([planTask])

    const prioritized = await service.prioritizeIncompleteWork('session-1', 'plan-1')

    expect(prioritized[0]).toEqual(inProgress)
    expect(prioritized[1]).toEqual(highPriority)
    expect(prioritized[2]).toEqual(planTask)
    expect(prioritized[3]).toEqual(lowPriority)
  })

  it('should handle case with no incomplete work', async () => {
    mockTodoService.getIncompleteTodos.mockResolvedValue([])
    mockTodoService.listTodos.mockResolvedValue([])
    mockPlanService.parsePlan.mockResolvedValue([])
    mockBoulderService.getState.mockResolvedValue({ blockers: [] })

    const result = await service.detectIncompleteWork('session-1', 'plan-1')

    expect(result.totalIncomplete).toBe(0)
    expect(result.completionRatio).toBe(1)
    expect(result.nextTask).toBeNull()
  })
})

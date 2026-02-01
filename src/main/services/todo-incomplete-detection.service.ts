import { TodoTrackingService, TodoItem } from './todo-tracking.service'
import { PlanFileService, PlanTask } from './plan-file.service'
import { BoulderStateService } from './boulder-state.service'

export interface IncompleteWork {
  incompleteTodos: TodoItem[]
  incompletePlanTasks: PlanTask[]
  totalIncomplete: number
  completionRatio: number
  nextTask: PlanTask | TodoItem | null
  hasBlockers: boolean
  blockers: string[]
}

export class TodoIncompleteDetectionService {
  private static instance: TodoIncompleteDetectionService | null = null

  private constructor() {}

  static getInstance(): TodoIncompleteDetectionService {
    if (!TodoIncompleteDetectionService.instance) {
      TodoIncompleteDetectionService.instance = new TodoIncompleteDetectionService()
    }
    return TodoIncompleteDetectionService.instance
  }

  async detectIncompleteWork(sessionId: string, planName: string): Promise<IncompleteWork> {
    const todoService = TodoTrackingService.getInstance()
    const planService = PlanFileService.getInstance()
    const boulderService = BoulderStateService.getInstance()

    const incompleteTodos = await todoService.getIncompleteTodos(sessionId)
    const planTasks = await planService.parsePlan(planName)
    const incompletePlanTasks = planTasks.filter(t => !t.completed)
    const boulderState = await boulderService.getState()

    const totalIncomplete = incompleteTodos.length + incompletePlanTasks.length
    const totalWork = incompleteTodos.length + planTasks.length
    const completionRatio = totalWork > 0 ? (totalWork - totalIncomplete) / totalWork : 1

    const nextTask = await this.getNextIncompleteTask(sessionId, planName)

    return {
      incompleteTodos,
      incompletePlanTasks,
      totalIncomplete,
      completionRatio,
      nextTask,
      hasBlockers: boulderState.blockers.length > 0,
      blockers: boulderState.blockers
    }
  }

  async hasIncompleteTodos(sessionId: string): Promise<boolean> {
    const todoService = TodoTrackingService.getInstance()
    const todos = await todoService.getIncompleteTodos(sessionId)
    return todos.length > 0
  }

  async hasIncompletePlanTasks(planName: string): Promise<boolean> {
    const planService = PlanFileService.getInstance()
    const tasks = await planService.parsePlan(planName)
    return tasks.some(t => !t.completed)
  }

  async getNextIncompleteTask(
    sessionId: string,
    planName: string
  ): Promise<PlanTask | TodoItem | null> {
    const todoService = TodoTrackingService.getInstance()
    const planService = PlanFileService.getInstance()

    // Prioritize: in_progress TODOs > pending high-priority TODOs > next plan task
    const todos = await todoService.getIncompleteTodos(sessionId)

    const inProgressTodo = todos.find(t => t.status === 'in_progress')
    if (inProgressTodo) return inProgressTodo

    const highPriorityTodo = todos.find(t => t.priority === 'high' && t.status === 'pending')
    if (highPriorityTodo) return highPriorityTodo

    const planTasks = await planService.parsePlan(planName)
    const nextPlanTask = planTasks.find(t => !t.completed)

    if (nextPlanTask) return nextPlanTask

    // Fallback to any pending todo
    return todos.find(t => t.status === 'pending') || null
  }

  async calculateCompletionRatio(sessionId: string, planName: string): Promise<number> {
    const todoService = TodoTrackingService.getInstance()
    const planService = PlanFileService.getInstance()

    const todos = await todoService.getIncompleteTodos(sessionId)
    const planTasks = await planService.parsePlan(planName)
    const incompletePlanTasks = planTasks.filter(t => !t.completed)

    const allTodos = await todoService.listTodos({ sessionId })
    const totalTodos = allTodos.length
    const incompleteTodosCount = todos.length

    const totalPlanTasks = planTasks.length
    const incompletePlanTasksCount = incompletePlanTasks.length

    const totalWork = totalTodos + totalPlanTasks
    const totalIncomplete = incompleteTodosCount + incompletePlanTasksCount

    return totalWork > 0 ? (totalWork - totalIncomplete) / totalWork : 1
  }

  async prioritizeIncompleteWork(
    sessionId: string,
    planName: string
  ): Promise<(PlanTask | TodoItem)[]> {
    const todoService = TodoTrackingService.getInstance()
    const planService = PlanFileService.getInstance()

    const todos = await todoService.getIncompleteTodos(sessionId)
    const planTasks = await planService.parsePlan(planName)
    const incompletePlanTasks = planTasks.filter(t => !t.completed)

    const inProgressTodos = todos.filter(t => t.status === 'in_progress')
    const highPriorityTodos = todos.filter(t => t.status === 'pending' && t.priority === 'high')
    const otherTodos = todos.filter(t => t.status === 'pending' && t.priority !== 'high')

    return [...inProgressTodos, ...highPriorityTodos, ...incompletePlanTasks, ...otherTodos]
  }
}

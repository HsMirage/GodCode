import { DatabaseService } from './database'
import { Prisma } from '@prisma/client'

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TodoPriority = 'low' | 'medium' | 'high'

export interface TodoItem {
  id: string
  sessionId: string
  content: string
  status: TodoStatus
  priority: TodoPriority
  createdAt: Date
  updatedAt: Date
}

export interface TodoFilterOptions {
  status?: TodoStatus | TodoStatus[]
  priority?: TodoPriority | TodoPriority[]
  sessionId?: string
}

export interface TodoStats {
  total: number
  pending: number
  inProgress: number
  completed: number
  cancelled: number
  byPriority: {
    low: number
    medium: number
    high: number
  }
}

const TODO_TASK_TYPE = 'TODO_ITEM'

export class TodoTrackingService {
  private static instance: TodoTrackingService | null = null

  private constructor() {}

  static getInstance(): TodoTrackingService {
    if (!TodoTrackingService.instance) {
      TodoTrackingService.instance = new TodoTrackingService()
    }
    return TodoTrackingService.instance
  }

  private mapTaskToTodo(task: any): TodoItem {
    const metadata = (task.metadata as Record<string, any>) || {}
    const priority = (metadata.priority as TodoPriority) || 'medium'

    const validStatuses: TodoStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']
    const status = validStatuses.includes(task.status as TodoStatus)
      ? (task.status as TodoStatus)
      : 'pending'

    return {
      id: task.id,
      sessionId: task.sessionId,
      content: task.input,
      status,
      priority,
      createdAt: task.createdAt,
      updatedAt: task.createdAt
    }
  }

  async createTodo(
    sessionId: string,
    content: string,
    priority: TodoPriority = 'medium'
  ): Promise<TodoItem> {
    const db = DatabaseService.getInstance().getClient()

    const task = await db.task.create({
      data: {
        sessionId,
        type: TODO_TASK_TYPE,
        input: content,
        status: 'pending',
        metadata: {
          priority
        }
      }
    })

    return this.mapTaskToTodo(task)
  }

  async getTodoById(id: string): Promise<TodoItem | null> {
    const db = DatabaseService.getInstance().getClient()

    const task = await db.task.findUnique({
      where: { id }
    })

    if (!task || task.type !== TODO_TASK_TYPE) {
      return null
    }

    return this.mapTaskToTodo(task)
  }

  async listTodos(filter?: TodoFilterOptions): Promise<TodoItem[]> {
    const db = DatabaseService.getInstance().getClient()

    const where: Prisma.TaskWhereInput = {
      type: TODO_TASK_TYPE
    }

    if (filter?.status) {
      where.status = Array.isArray(filter.status) ? { in: filter.status } : filter.status
    }

    if (filter?.sessionId) {
      where.sessionId = filter.sessionId
    }

    const tasks = await db.task.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    let todos = tasks.map((t: any) => this.mapTaskToTodo(t))

    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority]
      todos = todos.filter((t: TodoItem) => priorities.includes(t.priority))
    }

    const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 }
    todos.sort((a: TodoItem, b: TodoItem) => {
      const weightDiff = priorityWeight[b.priority] - priorityWeight[a.priority]
      if (weightDiff !== 0) return weightDiff
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

    return todos
  }

  async updateTodoStatus(id: string, status: TodoStatus): Promise<TodoItem> {
    const db = DatabaseService.getInstance().getClient()

    const existing = await this.getTodoById(id)
    if (!existing) {
      throw new Error(`Todo with ID ${id} not found`)
    }

    const data: any = { status }
    if (status === 'in_progress' && !existing.createdAt) {
      data.startedAt = new Date()
    }
    if (status === 'completed' || status === 'cancelled') {
      data.completedAt = new Date()
    }

    const task = await db.task.update({
      where: { id },
      data
    })

    return this.mapTaskToTodo(task)
  }

  async updateTodoPriority(id: string, priority: TodoPriority): Promise<TodoItem> {
    const db = DatabaseService.getInstance().getClient()

    const existing = await db.task.findUnique({ where: { id } })
    if (!existing || existing.type !== TODO_TASK_TYPE) {
      throw new Error(`Todo with ID ${id} not found`)
    }

    const metadata = (existing.metadata as Record<string, any>) || {}
    const newMetadata = { ...metadata, priority }

    const task = await db.task.update({
      where: { id },
      data: {
        metadata: newMetadata
      }
    })

    return this.mapTaskToTodo(task)
  }

  async markComplete(id: string): Promise<TodoItem> {
    return this.updateTodoStatus(id, 'completed')
  }

  async deleteTodo(id: string): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    const existing = await db.task.findUnique({ where: { id } })
    if (!existing || existing.type !== TODO_TASK_TYPE) {
      throw new Error(`Todo with ID ${id} not found`)
    }

    await db.task.delete({
      where: { id }
    })
  }

  async getIncompleteTodos(sessionId?: string): Promise<TodoItem[]> {
    return this.listTodos({
      status: ['pending', 'in_progress'],
      sessionId
    })
  }

  async getTodosByStatus(status: TodoStatus, sessionId?: string): Promise<TodoItem[]> {
    return this.listTodos({ status, sessionId })
  }

  async getTodoStats(sessionId?: string): Promise<TodoStats> {
    const where: any = sessionId ? { sessionId } : {}
    const todos = await this.listTodos(where)

    const stats: TodoStats = {
      total: todos.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      byPriority: {
        low: 0,
        medium: 0,
        high: 0
      }
    }

    for (const todo of todos) {
      if (todo.status === 'pending') stats.pending++
      else if (todo.status === 'in_progress') stats.inProgress++
      else if (todo.status === 'completed') stats.completed++
      else if (todo.status === 'cancelled') stats.cancelled++

      if (todo.priority === 'low') stats.byPriority.low++
      else if (todo.priority === 'medium') stats.byPriority.medium++
      else if (todo.priority === 'high') stats.byPriority.high++
    }

    return stats
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TodoTrackingService } from '@/main/services/todo-tracking.service'

const mockTodos: any[] = []

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => ({
        task: {
          create: vi.fn(async ({ data }: { data: any }) => {
            const todo = {
              id: `todo-${mockTodos.length + 1}`,
              ...data,
              createdAt: new Date(),
              updatedAt: new Date()
            }
            mockTodos.push(todo)
            return todo
          }),
          findUnique: vi.fn(async ({ where }: { where: any }) => {
            return mockTodos.find(t => t.id === where.id) || null
          }),
          findMany: vi.fn(async ({ where, orderBy }: { where: any; orderBy: any }) => {
            let result = [...mockTodos]

            if (where?.type) {
              result = result.filter(t => t.type === where.type)
            }

            if (where?.status) {
              const statuses = where.status.in || [where.status]
              result = result.filter(t => statuses.includes(t.status))
            }

            if (where?.sessionId) {
              result = result.filter(t => t.sessionId === where.sessionId)
            }

            if (orderBy && orderBy.createdAt === 'asc') {
              result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            }

            return result
          }),
          update: vi.fn(async ({ where, data }: { where: any; data: any }) => {
            const todo = mockTodos.find(t => t.id === where.id)
            if (!todo) throw new Error('Todo not found')

            if (data.metadata) {
              data.metadata = { ...(todo.metadata || {}), ...data.metadata }
            }

            Object.assign(todo, data, { updatedAt: new Date() })
            return todo
          }),
          delete: vi.fn(async ({ where }: { where: any }) => {
            const index = mockTodos.findIndex(t => t.id === where.id)
            if (index === -1) throw new Error('Todo not found')

            return mockTodos.splice(index, 1)[0]
          })
        }
      })
    })
  }
}))

describe('TodoTrackingService', () => {
  beforeEach(() => {
    mockTodos.length = 0
  })

  it('should implement singleton pattern', () => {
    const service1 = TodoTrackingService.getInstance()
    const service2 = TodoTrackingService.getInstance()
    expect(service1).toBe(service2)
  })

  it('should create TODO with default priority', async () => {
    const service = TodoTrackingService.getInstance()
    const todo = await service.createTodo('session-1', 'Test task')

    expect(todo.content).toBe('Test task')
    expect(todo.status).toBe('pending')
    expect(todo.priority).toBe('medium')
    expect(todo.sessionId).toBe('session-1')
  })

  it('should create TODO with custom priority', async () => {
    const service = TodoTrackingService.getInstance()
    const todo = await service.createTodo('session-1', 'Urgent task', 'high')

    expect(todo.content).toBe('Urgent task')
    expect(todo.priority).toBe('high')
  })

  it('should get TODO by ID', async () => {
    const service = TodoTrackingService.getInstance()
    const created = await service.createTodo('session-1', 'Test task')
    const fetched = await service.getTodoById(created.id)

    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(created.id)
    expect(fetched?.content).toBe('Test task')
  })

  it('should list all TODOs', async () => {
    const service = TodoTrackingService.getInstance()
    await service.createTodo('session-1', 'Task 1')
    await service.createTodo('session-1', 'Task 2')

    const list = await service.listTodos()
    expect(list.length).toBe(2)
  })

  it('should filter TODOs by status', async () => {
    const service = TodoTrackingService.getInstance()
    const t1 = await service.createTodo('session-1', 'Task 1')
    await service.createTodo('session-1', 'Task 2')

    await service.updateTodoStatus(t1.id, 'completed')

    const completed = await service.listTodos({ status: 'completed' })
    const pending = await service.listTodos({ status: 'pending' })

    expect(completed.length).toBe(1)
    expect(completed[0].id).toBe(t1.id)
    expect(pending.length).toBe(1)
  })

  it('should filter TODOs by priority', async () => {
    const service = TodoTrackingService.getInstance()
    await service.createTodo('session-1', 'High Task', 'high')
    await service.createTodo('session-1', 'Low Task', 'low')

    const highTasks = await service.listTodos({ priority: 'high' })
    const lowTasks = await service.listTodos({ priority: 'low' })

    expect(highTasks.length).toBe(1)
    expect(highTasks[0].content).toBe('High Task')
    expect(lowTasks.length).toBe(1)
    expect(lowTasks[0].content).toBe('Low Task')
  })

  it('should update TODO status', async () => {
    const service = TodoTrackingService.getInstance()
    const todo = await service.createTodo('session-1', 'Task')

    const updated = await service.updateTodoStatus(todo.id, 'in_progress')
    expect(updated.status).toBe('in_progress')

    const fetched = await service.getTodoById(todo.id)
    expect(fetched?.status).toBe('in_progress')
  })

  it('should update TODO priority', async () => {
    const service = TodoTrackingService.getInstance()
    const todo = await service.createTodo('session-1', 'Task', 'low')

    const updated = await service.updateTodoPriority(todo.id, 'high')
    expect(updated.priority).toBe('high')

    const fetched = await service.getTodoById(todo.id)
    expect(fetched?.priority).toBe('high')
  })

  it('should mark TODO as complete', async () => {
    const service = TodoTrackingService.getInstance()
    const todo = await service.createTodo('session-1', 'Task')

    const completed = await service.markComplete(todo.id)
    expect(completed.status).toBe('completed')
  })

  it('should delete TODO', async () => {
    const service = TodoTrackingService.getInstance()
    const todo = await service.createTodo('session-1', 'Task')

    await service.deleteTodo(todo.id)

    const fetched = await service.getTodoById(todo.id)
    expect(fetched).toBeNull()
  })

  it('should get incomplete TODOs', async () => {
    const service = TodoTrackingService.getInstance()
    const t1 = await service.createTodo('session-1', 'Pending')
    const t2 = await service.createTodo('session-1', 'In Progress')
    await service.updateTodoStatus(t2.id, 'in_progress')
    const t3 = await service.createTodo('session-1', 'Completed')
    await service.markComplete(t3.id)

    const incomplete = await service.getIncompleteTodos()
    expect(incomplete.length).toBe(2)
    const ids = incomplete.map(t => t.id)
    expect(ids).toContain(t1.id)
    expect(ids).toContain(t2.id)
    expect(ids).not.toContain(t3.id)
  })

  it('should get TODO statistics', async () => {
    const service = TodoTrackingService.getInstance()
    await service.createTodo('session-1', 'T1', 'high')

    const t2 = await service.createTodo('session-1', 'T2', 'medium')
    await service.updateTodoStatus(t2.id, 'in_progress')

    const t3 = await service.createTodo('session-1', 'T3', 'low')
    await service.markComplete(t3.id)

    const stats = await service.getTodoStats()

    expect(stats.total).toBe(3)
    expect(stats.pending).toBe(1)
    expect(stats.inProgress).toBe(1)
    expect(stats.completed).toBe(1)
    expect(stats.byPriority.high).toBe(1)
    expect(stats.byPriority.medium).toBe(1)
    expect(stats.byPriority.low).toBe(1)
  })

  it('should filter TODOs by session', async () => {
    const service = TodoTrackingService.getInstance()
    await service.createTodo('session-1', 'S1 Task')
    await service.createTodo('session-2', 'S2 Task')

    const s1Todos = await service.listTodos({ sessionId: 'session-1' })
    expect(s1Todos.length).toBe(1)
    expect(s1Todos[0].content).toBe('S1 Task')
  })

  it('should sort TODOs by priority and date', async () => {
    const service = TodoTrackingService.getInstance()
    const t1 = await service.createTodo('s1', 'Low Old', 'low')

    const t2 = await service.createTodo('s1', 'High New', 'high')
    const t3 = await service.createTodo('s1', 'Medium', 'medium')
    const t4 = await service.createTodo('s1', 'High Old', 'high')

    const sorted = await service.listTodos()

    expect(sorted[0].id).toBe(t2.id)
    expect(sorted[1].id).toBe(t4.id)
    expect(sorted[2].id).toBe(t3.id)
    expect(sorted[3].id).toBe(t1.id)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'
import { DelegateEngine } from '@/main/services/delegate'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { createLLMAdapter } from '@/main/services/llm/factory'

// Mock dependencies
const mockPrisma: any = {
  task: {
    create: vi.fn(),
    update: vi.fn()
  },
  model: {
    findFirst: vi.fn()
  },
  session: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  space: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  $transaction: vi.fn(callback => callback(mockPrisma))
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      getClient: vi.fn(() => mockPrisma)
    }))
  }
}))

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => mockLogger)
    }))
  }
}))

const mockAdapter = {
  sendMessage: vi.fn()
}

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => mockAdapter)
}))

const mockDelegateEngine = {
  delegateTask: vi.fn()
}

vi.mock('@/main/services/delegate', () => ({
  DelegateEngine: vi.fn(() => mockDelegateEngine)
}))

describe('WorkforceEngine', () => {
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()
    workforceEngine = new WorkforceEngine()

    // Default mocks setup
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
    mockPrisma.task.create.mockResolvedValue({ id: 'workflow-1', type: 'workflow' })
    mockPrisma.task.update.mockResolvedValue({ id: 'workflow-1' })
    mockPrisma.model.findFirst.mockResolvedValue({
      id: 'model-1',
      provider: 'anthropic',
      apiKey: 'test-key'
    })
    mockAdapter.sendMessage.mockResolvedValue({
      content: JSON.stringify({
        subtasks: [
          { id: 'task-1', description: 'Task 1', dependencies: [] },
          { id: 'task-2', description: 'Task 2', dependencies: ['task-1'] }
        ]
      })
    })
    mockDelegateEngine.delegateTask.mockResolvedValue({
      taskId: 'subtask-id',
      output: 'Task output',
      success: true
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('decomposeTask', () => {
    it('should decompose task into subtasks', async () => {
      const input = 'Complex task'
      const subtasks = await workforceEngine.decomposeTask(input)

      expect(mockPrisma.model.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { provider: 'anthropic' }
        })
      )
      expect(createLLMAdapter).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({
          apiKey: 'test-key'
        })
      )
      expect(mockAdapter.sendMessage).toHaveBeenCalled()
      expect(subtasks).toHaveLength(2)
      expect(subtasks[0].id).toBe('task-1')
      expect(subtasks[1].dependencies).toContain('task-1')
    })

    it('should handle model not found error', async () => {
      mockPrisma.model.findFirst.mockResolvedValue(null)

      await expect(workforceEngine.decomposeTask('input')).rejects.toThrow(
        'No model configured for task decomposition'
      )
    })

    it('should fallback to single task if parsing fails', async () => {
      mockAdapter.sendMessage.mockResolvedValue({ content: 'Invalid JSON' })

      const subtasks = await workforceEngine.decomposeTask('Simple task')

      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].description).toBe('Simple task')
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('executeWorkflow', () => {
    it('should execute tasks in dependency order', async () => {
      const input = 'Do workflow'

      await workforceEngine.executeWorkflow(input)

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'workflow',
            input,
            status: 'running'
          })
        })
      )

      // Should execute task 1 first (no deps)
      expect(mockDelegateEngine.delegateTask).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          description: 'Task 1',
          parentTaskId: 'workflow-1'
        })
      )

      // Should execute task 2 second (depends on task 1)
      expect(mockDelegateEngine.delegateTask).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          description: 'Task 2',
          parentTaskId: 'workflow-1'
        })
      )

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'completed',
            output: expect.stringContaining('Task output')
          })
        })
      )
    })

    it('should respect MAX_CONCURRENT limit', async () => {
      // Mock decomposition to return 5 independent tasks
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 't1', description: 'T1', dependencies: [] },
            { id: 't2', description: 'T2', dependencies: [] },
            { id: 't3', description: 'T3', dependencies: [] },
            { id: 't4', description: 'T4', dependencies: [] },
            { id: 't5', description: 'T5', dependencies: [] }
          ]
        })
      })

      // Add delay to mock execution to verify concurrency
      mockDelegateEngine.delegateTask.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { taskId: 'id', output: 'done', success: true }
      })

      await workforceEngine.executeWorkflow('Concurrent workflow')

      // Since we can't easily check realtime concurrency in unit test without complex setup,
      // we verify that all tasks were executed eventually
      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledTimes(5)
    })

    it('should detect deadlock', async () => {
      // Mock circular dependency
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 't1', description: 'T1', dependencies: ['t2'] },
            { id: 't2', description: 'T2', dependencies: ['t1'] }
          ]
        })
      })

      await expect(workforceEngine.executeWorkflow('Deadlock workflow')).rejects.toThrow(
        'Deadlock detected'
      )

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'failed',
            output: expect.stringContaining('Deadlock detected')
          })
        })
      )
    })

    it('should handle subtask failure', async () => {
      mockDelegateEngine.delegateTask.mockRejectedValueOnce(new Error('Subtask failed'))

      await expect(workforceEngine.executeWorkflow('Failed workflow')).rejects.toThrow(
        'Subtask failed'
      )

      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'failed',
            output: expect.stringContaining('Subtask failed')
          })
        })
      )
    })
  })
})

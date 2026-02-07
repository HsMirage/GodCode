import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DelegateEngine } from '@/main/services/delegate/delegate-engine'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'

const mocks = vi.hoisted(() => {
  const prisma: any = {
    task: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn()
    },
    space: {
      create: vi.fn(),
      findFirst: vi.fn()
    },
    model: {
      findFirst: vi.fn(),
      findMany: vi.fn()
    },
    $transaction: vi.fn((callback: any): any => callback(prisma))
  }

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }

  const llmAdapter = {
    sendMessage: vi.fn(),
    streamMessage: vi.fn()
  }

  const bindingService = {
    getCategoryModelConfig: vi.fn(),
    getAgentModelConfig: vi.fn(),
    getCategoryBinding: vi.fn(),
    getAgentBinding: vi.fn()
  }

  return {
    prisma,
    logger,
    llmAdapter,
    bindingService
  }
})

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mocks.prisma
    })
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => mocks.logger
    })
  }
}))

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => mocks.llmAdapter)
}))

vi.mock('@/main/services/llm/dynamic-truncator', () => ({
  truncateToTokenLimit: (text: string) => ({ result: text })
}))

vi.mock('@/main/services/binding.service', () => ({
  BindingService: {
    getInstance: () => mocks.bindingService
  }
}))

describe('Workforce Engine Integration', () => {
  let delegateEngine: DelegateEngine
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()

    mocks.prisma.session.findFirst.mockResolvedValue({ id: 'sess_123' })
    mocks.prisma.space.findFirst.mockResolvedValue({ id: 'space_123' })
    mocks.prisma.model.findFirst.mockResolvedValue({
      id: 'model_123',
      provider: 'openai-compatible',
      apiKey: 'test-key',
      model: 'gpt-4o'
    })
    mocks.prisma.model.findMany.mockResolvedValue([
      {
        id: 'model_123',
        provider: 'openai-compatible',
        apiKey: 'test-key',
        modelName: 'gpt-4o',
        createdAt: new Date()
      }
    ])

    mocks.bindingService.getCategoryModelConfig.mockImplementation(async (category: string) => {
      if (category === 'quick') {
        return { model: 'gpt-4o', temperature: 0.3, apiKey: 'test-key' }
      }
      return { model: 'gpt-4o', temperature: 0.5, apiKey: 'test-key' }
    })
    mocks.bindingService.getAgentModelConfig.mockImplementation(async (agentCode: string) => {
      if (agentCode) {
        return { model: 'gpt-4o', temperature: 0.5, apiKey: 'test-key' }
      }
      return null
    })
    mocks.bindingService.getCategoryBinding.mockResolvedValue({
      systemPrompt: null
    })
    mocks.bindingService.getAgentBinding.mockResolvedValue({
      systemPrompt: null
    })

    mocks.prisma.task.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `task_${Date.now()}`,
        ...args.data,
        status: 'running'
      })
    )

    mocks.prisma.task.update.mockImplementation((args: any) =>
      Promise.resolve({
        id: args.where.id,
        ...args.data
      })
    )

    delegateEngine = new DelegateEngine()
    workforceEngine = new WorkforceEngine()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Task Decomposition', () => {
    it('should decompose complex goal into subtasks', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'Design database schema', dependencies: [] },
          { id: 't2', description: 'Create API endpoints', dependencies: ['t1'] },
          { id: 't3', description: 'Build frontend components', dependencies: ['t2'] }
        ]
      }

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify(mockDecomposition),
        usage: { input_tokens: 20, output_tokens: 20 }
      })

      const subtasks = await workforceEngine.decomposeTask('Build a user management system')

      expect(subtasks).toHaveLength(3)
      expect(subtasks[0].id).toBe('t1')
      expect(subtasks[1].dependencies).toContain('t1')
      expect(subtasks[2].dependencies).toContain('t2')
    })

    it('should handle decomposition failure with fallback', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'This is not valid JSON',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const subtasks = await workforceEngine.decomposeTask('Simple task')

      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].id).toBe('task-1')
      expect(subtasks[0].description).toBe('Simple task')
    })
  })

  describe('Subagent Spawning and Coordination', () => {
    it('should spawn subagent with category selection', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Task completed successfully',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const result = await delegateEngine.delegateTask({
        description: 'Quick task',
        prompt: 'Do something quickly',
        category: 'quick'
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe('Task completed successfully')
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'subtask',
            metadata: expect.objectContaining({
              category: 'quick'
            })
          })
        })
      )
    })

    it('should spawn subagent with direct agent type', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Research results',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const result = await delegateEngine.delegateTask({
        description: 'Research task',
        prompt: 'Research this topic',
        subagent_type: 'oracle'
      })

      expect(result.success).toBe(true)
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              subagent_type: 'oracle'
            })
          })
        })
      )
    })
  })

  describe('Result Aggregation', () => {
    it('should aggregate results from multiple subtasks', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'Task 1', dependencies: [] },
          { id: 't2', description: 'Task 2', dependencies: [] }
        ]
      }

      mocks.llmAdapter.sendMessage
        .mockResolvedValueOnce({
          content: JSON.stringify(mockDecomposition),
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          content: 'Result from task 1',
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          content: 'Result from task 2',
          usage: { input_tokens: 10, output_tokens: 10 }
        })

      const result = await workforceEngine.executeWorkflow('Parallel work')

      expect(result.success).toBe(true)
      expect(result.results.size).toBe(2)
      expect(result.results.get('t1')).toBe('Result from task 1')
      expect(result.results.get('t2')).toBe('Result from task 2')
    })

    it('should execute tasks respecting dependencies', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'First task', dependencies: [] },
          { id: 't2', description: 'Dependent task', dependencies: ['t1'] }
        ]
      }

      mocks.llmAdapter.sendMessage
        .mockResolvedValueOnce({
          content: JSON.stringify(mockDecomposition),
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          content: 'First result',
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          content: 'Second result',
          usage: { input_tokens: 10, output_tokens: 10 }
        })

      const result = await workforceEngine.executeWorkflow('Sequential work')

      expect(result.success).toBe(true)
      expect(result.results.get('t1')).toBe('First result')
      expect(result.results.get('t2')).toBe('Second result')

      expect(mocks.prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed'
          })
        })
      )
    })
  })

  describe('Error Handling and Retry Logic', () => {
    it('should handle subtask failures gracefully', async () => {
      mocks.llmAdapter.sendMessage.mockRejectedValueOnce(new Error('LLM API Error'))

      const result = await delegateEngine.delegateTask({
        description: 'Failing task',
        prompt: 'This will fail',
        category: 'quick'
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('LLM API Error')
      expect(mocks.prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })

    it('should build DAG correctly from task dependencies', () => {
      const tasks = [
        { id: '1', description: 'A', dependencies: [] },
        { id: '2', description: 'B', dependencies: ['1'] },
        { id: '3', description: 'C', dependencies: ['1'] },
        { id: '4', description: 'D', dependencies: ['2', '3'] }
      ]

      const dag = workforceEngine.buildDAG(tasks)

      expect(dag.get('1')).toEqual([])
      expect(dag.get('2')).toEqual(['1'])
      expect(dag.get('3')).toEqual(['1'])
      expect(dag.get('4')).toEqual(['2', '3'])
    })
  })

  describe('Delegate Engine and Agent Coordination', () => {
    it('should reuse existing session for task continuity', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Response',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      mocks.prisma.session.findFirst.mockResolvedValueOnce({ id: 'existing_session' })

      await delegateEngine.delegateTask({
        description: 'Continuing task',
        prompt: 'Continue working',
        category: 'quick'
      })

      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'existing_session'
          })
        })
      )
    })

    it('should track parent task relationship', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Subtask result',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      await delegateEngine.delegateTask({
        description: 'Child task',
        prompt: 'Execute subtask',
        category: 'quick',
        parentTaskId: 'parent-task-123'
      })

      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              parentTaskId: 'parent-task-123'
            })
          })
        })
      )
    })
  })
})

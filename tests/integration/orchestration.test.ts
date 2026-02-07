import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DelegateEngine } from '@/main/services/delegate/delegate-engine'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'

// Define mocks using vi.hoisted to share state between factory and tests
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

describe('Orchestration Engines Integration', () => {
  let delegateEngine: DelegateEngine
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()

    mocks.prisma.session.findFirst.mockResolvedValue({ id: 'sess_123' })
    mocks.prisma.space.findFirst.mockResolvedValue({ id: 'space_123' })
    mocks.prisma.model.findFirst.mockResolvedValue({
      id: 'model_123',
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20240620'
    })
    mocks.prisma.model.findMany.mockResolvedValue([
      {
        id: 'model_123',
        provider: 'anthropic',
        apiKey: 'test-key',
        modelName: 'claude-3-5-sonnet-20240620',
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

  describe('DelegateEngine', () => {
    it('should delegate task with category selection', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Task output content',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const result = await delegateEngine.delegateTask({
        description: 'Test task',
        prompt: 'Do this',
        category: 'quick'
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe('Task output content')
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

    it('should delegate task with direct agent type', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Oracle analysis',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const result = await delegateEngine.delegateTask({
        description: 'Research task',
        prompt: 'Search this',
        subagent_type: 'oracle'
      })

      expect(result.success).toBe(true)
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'subtask',
            metadata: expect.objectContaining({
              subagent_type: 'oracle'
            })
          })
        })
      )
    })

    it('should reuse session for continuity', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Response',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      mocks.prisma.session.findFirst.mockResolvedValueOnce({ id: 'existing_session_id' })

      await delegateEngine.delegateTask({
        description: 'Test',
        prompt: 'Test',
        category: 'quick'
      })

      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'existing_session_id'
          })
        })
      )
    })

    it('should handle LLM failures gracefully', async () => {
      mocks.llmAdapter.sendMessage.mockRejectedValueOnce(new Error('API Error'))

      const result = await delegateEngine.delegateTask({
        description: 'Test',
        prompt: 'Test',
        category: 'quick'
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('API Error')
      expect(mocks.prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })
  })

  describe('WorkforceEngine', () => {
    it('should decompose goal into subtasks correctly', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'Step 1', dependencies: [] },
          { id: 't2', description: 'Step 2', dependencies: ['t1'] }
        ]
      }

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify(mockDecomposition),
        usage: { input_tokens: 20, output_tokens: 20 }
      })

      const subtasks = await workforceEngine.decomposeTask('Build a house')

      expect(subtasks).toHaveLength(2)
      expect(subtasks[0].id).toBe('t1')
      expect(subtasks[1].dependencies).toContain('t1')
    })

    it('should build DAG from dependencies', () => {
      const tasks = [
        { id: '1', description: 'A', dependencies: [] },
        { id: '2', description: 'B', dependencies: ['1'] },
        { id: '3', description: 'C', dependencies: ['1'] },
        { id: '4', description: 'D', dependencies: ['2', '3'] }
      ]

      const dag = workforceEngine.buildDAG(tasks)

      expect(dag.get('1')).toEqual([])
      expect(dag.get('2')).toEqual(['1'])
      expect(dag.get('4')).toEqual(['2', '3'])
    })

    it('should execute workflow sequentially based on dependencies', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'Task 1', dependencies: [] },
          { id: 't2', description: 'Task 2', dependencies: ['t1'] }
        ]
      }

      // Sequence: Decomposition -> Task 1 -> Task 2
      mocks.llmAdapter.sendMessage
        .mockResolvedValueOnce({
          content: JSON.stringify(mockDecomposition),
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          content: 'Result 1',
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          content: 'Result 2',
          usage: { input_tokens: 10, output_tokens: 10 }
        })

      const result = await workforceEngine.executeWorkflow('Do project')

      expect(result.success).toBe(true)
      expect(result.results.get('t1')).toBe('Result 1')
      expect(result.results.get('t2')).toBe('Result 2')

      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'workflow'
          })
        })
      )

      expect(mocks.prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed'
          })
        })
      )
    })

    it('should handle parallel execution', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 'p1', description: 'Parallel 1', dependencies: [] },
          { id: 'p2', description: 'Parallel 2', dependencies: [] }
        ]
      }

      mocks.llmAdapter.sendMessage
        .mockResolvedValueOnce({
          content: JSON.stringify(mockDecomposition),
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValue({
          content: 'Parallel Result',
          usage: { input_tokens: 10, output_tokens: 10 }
        })

      const result = await workforceEngine.executeWorkflow('Parallel Work')

      expect(result.success).toBe(true)
      expect(result.results.size).toBe(2)
    })

    it('should handle decomposition failure fallback', async () => {
      // Mock invalid JSON response to trigger fallback path
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Not valid JSON',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const subtasks = await workforceEngine.decomposeTask('Simple task')

      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].id).toBe('task-1')
      expect(subtasks[0].description).toBe('Simple task')
    })
  })
})

// Mock DatabaseService
vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mocks.prisma
    })
  }
}))

// Mock LoggerService
vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => mocks.logger
    })
  }
}))

// Mock LLM Factory
vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => mocks.llmAdapter)
}))

// Mock Dynamic Truncator
vi.mock('@/main/services/llm/dynamic-truncator', () => ({
  truncateToTokenLimit: (text: string) => ({ result: text })
}))

describe('Orchestration Engines Integration', () => {
  let delegateEngine: DelegateEngine
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default prisma responses
    mocks.prisma.session.findFirst.mockResolvedValue({ id: 'sess_123' })
    mocks.prisma.space.findFirst.mockResolvedValue({ id: 'space_123' })
    mocks.prisma.model.findFirst.mockResolvedValue({
      id: 'model_123',
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-5-sonnet-20240620'
    })

    // Setup task create response
    mocks.prisma.task.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: `task_${Date.now()}`,
        ...args.data,
        status: 'running'
      })
    )

    // Setup task update response
    mocks.prisma.task.update.mockImplementation((args: any) =>
      Promise.resolve({
        id: args.where.id,
        ...args.data
      })
    )

    delegateEngine = new DelegateEngine()
    workforceEngine = new WorkforceEngine()
  })

  describe('DelegateEngine', () => {
    it('should delegate task with category selection', async () => {
      // Mock LLM response
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Task output content',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const result = await delegateEngine.delegateTask({
        description: 'Test task',
        prompt: 'Do this',
        category: 'quick'
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe('Task output content')
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

    it('should delegate task with direct agent type', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Oracle analysis',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const result = await delegateEngine.delegateTask({
        description: 'Research task',
        prompt: 'Search this',
        subagent_type: 'oracle'
      })

      expect(result.success).toBe(true)
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'subtask',
            metadata: expect.objectContaining({
              subagent_type: 'oracle'
            })
          })
        })
      )
    })

    it('should reuse session for continuity', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Response',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      mocks.prisma.session.findFirst.mockResolvedValueOnce({ id: 'existing_session_id' })

      await delegateEngine.delegateTask({
        description: 'Test',
        prompt: 'Test',
        category: 'quick'
      })

      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'existing_session_id'
          })
        })
      )
    })

    it('should handle LLM failures gracefully', async () => {
      mocks.llmAdapter.sendMessage.mockRejectedValueOnce(new Error('API Error'))

      const result = await delegateEngine.delegateTask({
        description: 'Test',
        prompt: 'Test',
        category: 'quick'
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('API Error')
      expect(mocks.prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })
  })

  describe('WorkforceEngine', () => {
    it('should decompose goal into subtasks correctly', async () => {
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'Step 1', dependencies: [] },
          { id: 't2', description: 'Step 2', dependencies: ['t1'] }
        ]
      }

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify(mockDecomposition),
        usage: { input_tokens: 20, output_tokens: 20 }
      })

      const subtasks = await workforceEngine.decomposeTask('Build a house')

      expect(subtasks).toHaveLength(2)
      expect(subtasks[0].id).toBe('t1')
      expect(subtasks[1].dependencies).toContain('t1')
    })

    it('should build DAG from dependencies', () => {
      const tasks = [
        { id: '1', description: 'A', dependencies: [] },
        { id: '2', description: 'B', dependencies: ['1'] },
        { id: '3', description: 'C', dependencies: ['1'] },
        { id: '4', description: 'D', dependencies: ['2', '3'] }
      ]

      const dag = workforceEngine.buildDAG(tasks)

      expect(dag.get('1')).toEqual([])
      expect(dag.get('2')).toEqual(['1'])
      expect(dag.get('4')).toEqual(['2', '3'])
    })

    it('should execute workflow sequentially based on dependencies', async () => {
      // 1. Mock Decomposition
      const mockDecomposition = {
        subtasks: [
          { id: 't1', description: 'Task 1', dependencies: [] },
          { id: 't2', description: 'Task 2', dependencies: ['t1'] }
        ]
      }

      // Sequence of LLM calls:
      // 1. Decomposition call
      // 2. Task 1 execution
      // 3. Task 2 execution
      mocks.llmAdapter.sendMessage
        .mockResolvedValueOnce({
          // Decomposition
          content: JSON.stringify(mockDecomposition),
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          // Task 1
          content: 'Result 1',
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValueOnce({
          // Task 2
          content: 'Result 2',
          usage: { input_tokens: 10, output_tokens: 10 }
        })

      const result = await workforceEngine.executeWorkflow('Do project')

      expect(result.success).toBe(true)
      expect(result.results.get('t1')).toBe('Result 1')
      expect(result.results.get('t2')).toBe('Result 2')

      // Verify workflow task was created
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'workflow'
          })
        })
      )

      // Verify workflow was completed
      expect(mocks.prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed'
          })
        })
      )
    })

    it('should handle parallel execution', async () => {
      // 1. Mock Decomposition
      const mockDecomposition = {
        subtasks: [
          { id: 'p1', description: 'Parallel 1', dependencies: [] },
          { id: 'p2', description: 'Parallel 2', dependencies: [] }
        ]
      }

      mocks.llmAdapter.sendMessage
        .mockResolvedValueOnce({
          // Decomposition
          content: JSON.stringify(mockDecomposition),
          usage: { input_tokens: 10, output_tokens: 10 }
        })
        .mockResolvedValue({
          // Both tasks (mocks don't guarantee order in parallel, so generic response)
          content: 'Parallel Result',
          usage: { input_tokens: 10, output_tokens: 10 }
        })

      const result = await workforceEngine.executeWorkflow('Parallel Work')

      expect(result.success).toBe(true)
      expect(result.results.size).toBe(2)
      // Both tasks depend on nothing, so they are eligible immediately.
      // The engine implementation executes batch based on MAX_CONCURRENT.
    })

    it('should handle decomposition failure fallback', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Not valid JSON',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      // The mock implementation of sendMessage returns 'Not valid JSON',
      // which will cause JSON.parse to throw or logic to fail.
      // The engine should catch this and return a single fallback task.

      // But wait, the engine implementation checks for jsonMatch.
      // If no JSON match, it throws. Then catch block returns fallback.

      const subtasks = await workforceEngine.decomposeTask('Simple task')

      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].id).toBe('task-1')
      expect(subtasks[0].description).toBe('Simple task')
    })
  })
})

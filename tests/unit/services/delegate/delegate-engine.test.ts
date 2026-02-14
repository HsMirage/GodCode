import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DelegateEngine } from '@/main/services/delegate/delegate-engine'
import { createLLMAdapter } from '@/main/services/llm/factory'

// vi.mock() is hoisted; keep shared mocks in a hoisted factory to avoid TDZ issues.
const mocks = vi.hoisted(() => {
  const mockPrisma = {
    task: {
      create: vi.fn(),
      update: vi.fn()
    },
    model: {
      findFirst: vi.fn()
    },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn()
    },
    space: {
      findFirst: vi.fn(),
      create: vi.fn()
    }
  }

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }

  const mockAdapter = {
    sendMessage: vi.fn()
  }

  return { mockPrisma, mockLogger, mockAdapter }
})

const bindingMocks = vi.hoisted(() => ({
  getCategoryModelConfig: vi.fn(async (categoryCode: string) => {
    if (categoryCode === 'quick') {
      return {
        model: 'claude-3-haiku-20240307',
        provider: 'openai-compatible',
        temperature: 0.3,
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1'
      }
    }
    return null
  }),
  getAgentModelConfig: vi.fn(async (agentCode: string) => {
    if (agentCode === 'explore') {
      return {
        model: 'claude-3-5-sonnet-20240620',
        provider: 'openai-compatible',
        temperature: 0.2,
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1'
      }
    }
    return null
  }),
  getCategoryBinding: vi.fn(async () => null),
  getAgentBinding: vi.fn(async () => null)
}))

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      getClient: vi.fn(() => mocks.mockPrisma)
    }))
  }
}))

vi.mock('@/main/services/binding.service', () => ({
  BindingService: {
    getInstance: vi.fn(() => bindingMocks)
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => mocks.mockLogger)
    }))
  }
}))

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => mocks.mockAdapter)
}))

describe('DelegateEngine', () => {
  let delegateEngine: DelegateEngine

  beforeEach(() => {
    vi.clearAllMocks()
    delegateEngine = new DelegateEngine()

    // Default mocks setup
    mocks.mockPrisma.session.findUnique.mockResolvedValue({
      id: 'test-session-123',
      space: { id: 'space-1', workDir: '/tmp/workspace-a' }
    })
    mocks.mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
    mocks.mockPrisma.task.create.mockResolvedValue({ id: 'task-1', type: 'subtask' })
    mocks.mockPrisma.task.update.mockResolvedValue({ id: 'task-1' })
    mocks.mockPrisma.model.findFirst.mockResolvedValue({
      id: 'model-1',
      provider: 'openai-compatible',
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      config: {}
    })
    mocks.mockAdapter.sendMessage.mockResolvedValue({
      content: 'Task completed result',
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('delegateTask', () => {
    it('should delegate task successfully with category', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick',
        sessionId: 'test-session-123'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(mocks.mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            input: input.description,
            metadata: expect.objectContaining({
              category: 'quick',
              model: 'claude-3-haiku-20240307'
            })
          })
        })
      )

      expect(createLLMAdapter).toHaveBeenCalledWith(
        'openai-compatible',
        expect.objectContaining({
          apiKey: 'test-key'
        })
      )

      expect(mocks.mockAdapter.sendMessage).toHaveBeenCalled()
      expect(mocks.mockAdapter.sendMessage).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          workspaceDir: '/tmp/workspace-a',
          sessionId: 'test-session-123'
        })
      )
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            status: 'completed',
            output: 'Task completed result'
          })
        })
      )

      expect(result.success).toBe(true)
      expect(result.output).toBe('Task completed result')
    })

    it('should delegate task successfully with subagent_type', async () => {
      const input = {
        description: 'Research task',
        prompt: 'Research this',
        subagent_type: 'explore',
        sessionId: 'test-session-123'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(mocks.mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              subagent_type: 'explore',
              model: 'claude-3-5-sonnet-20240620'
            })
          })
        })
      )

      expect(result.success).toBe(true)
    })

    it('should use provided sessionId directly', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick',
        sessionId: 'test-session-123'
      }

      await delegateEngine.delegateTask(input)

      // With the new session isolation, the engine uses the provided sessionId directly
      expect(mocks.mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'test-session-123'
          })
        })
      )
    })

    it('should throw error for unknown category', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'unknown-category',
        sessionId: 'test-session-123'
      }

      await expect(delegateEngine.delegateTask(input)).rejects.toThrow(
        '任务类别「unknown-category」未配置可用模型'
      )
    })

    it('should throw error for unknown agent type', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        subagent_type: 'unknown-agent',
        sessionId: 'test-session-123'
      }

      await expect(delegateEngine.delegateTask(input)).rejects.toThrow(
        'Agent「unknown-agent」未配置可用模型'
      )
    })

    it('should throw error if neither category nor subagent_type provided', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        sessionId: 'test-session-123'
      }

      await expect(delegateEngine.delegateTask(input)).rejects.toThrow(
        'Must provide either category or subagent_type'
      )
    })

    it('should handle model not found error', async () => {
      // Force fallback to provider-level model lookup by using overrideModel without apiKey/baseURL.
      mocks.mockPrisma.model.findFirst.mockResolvedValue(null)

      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        model: 'openai-compatible/gpt-4o',
        sessionId: 'test-session-123'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(result.success).toBe(false)
      expect(result.output).toContain('No model configured for provider')
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })

    it('should handle LLM adapter error', async () => {
      const errorMessage = 'API Error'
      mocks.mockAdapter.sendMessage.mockRejectedValue(errorMessage)

      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick',
        sessionId: 'test-session-123'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(result.success).toBe(false)
      expect(result.output).toBe(errorMessage)
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })

    it('should mark task as cancelled when abort signal is triggered', async () => {
      const controller = new AbortController()
      controller.abort()
      mocks.mockAdapter.sendMessage.mockRejectedValue(new Error('Request aborted by user'))

      const input = {
        description: 'Cancelable task',
        prompt: 'Run this',
        category: 'quick',
        sessionId: 'test-session-123',
        abortSignal: controller.signal
      }

      const result = await delegateEngine.delegateTask(input)

      expect(result.success).toBe(false)
      expect(result.output).toBe('Cancelled by user')
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            status: 'cancelled',
            output: 'Cancelled by user'
          })
        })
      )
    })
  })

  describe('cancelTask', () => {
    it('should cancel task successfully', async () => {
      await delegateEngine.cancelTask('task-1')

      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: 'cancelled',
          completedAt: expect.any(Date)
        })
      })

      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Task cancelled', { taskId: 'task-1' })
    })
  })
})

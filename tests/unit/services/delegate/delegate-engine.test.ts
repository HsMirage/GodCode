import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DelegateEngine } from '@/main/services/delegate/delegate-engine'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { createLLMAdapter } from '@/main/services/llm/factory'

// Mock dependencies
const mockPrisma = {
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
  }
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

describe('DelegateEngine', () => {
  let delegateEngine: DelegateEngine

  beforeEach(() => {
    vi.clearAllMocks()
    delegateEngine = new DelegateEngine()

    // Default mocks setup
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
    mockPrisma.task.create.mockResolvedValue({ id: 'task-1', type: 'subtask' })
    mockPrisma.task.update.mockResolvedValue({ id: 'task-1' })
    mockPrisma.model.findFirst.mockResolvedValue({
      id: 'model-1',
      provider: 'anthropic',
      apiKey: 'test-key',
      config: { baseURL: 'https://api.anthropic.com' }
    })
    mockAdapter.sendMessage.mockResolvedValue({ content: 'Task completed result' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('delegateTask', () => {
    it('should delegate task successfully with category', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
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
        'anthropic',
        expect.objectContaining({
          apiKey: 'test-key'
        })
      )

      expect(mockAdapter.sendMessage).toHaveBeenCalled()
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
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
        subagent_type: 'explore'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
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

    it('should create new session if none exists', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null)
      mockPrisma.space.findFirst.mockResolvedValue({ id: 'space-1' })
      mockPrisma.session.create.mockResolvedValue({ id: 'session-new' })

      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick'
      }

      await delegateEngine.delegateTask(input)

      expect(mockPrisma.session.create).toHaveBeenCalled()
      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-new'
          })
        })
      )
    })

    it('should throw error for unknown category', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'unknown-category'
      }

      await expect(delegateEngine.delegateTask(input)).rejects.toThrow(
        'Unknown category: unknown-category'
      )
    })

    it('should throw error for unknown agent type', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        subagent_type: 'unknown-agent'
      }

      await expect(delegateEngine.delegateTask(input)).rejects.toThrow(
        'Unknown agent type: unknown-agent'
      )
    })

    it('should throw error if neither category nor subagent_type provided', async () => {
      const input = {
        description: 'Test task',
        prompt: 'Do this task'
      }

      await expect(delegateEngine.delegateTask(input)).rejects.toThrow(
        'Must provide either category or subagent_type'
      )
    })

    it('should handle model not found error', async () => {
      mockPrisma.model.findFirst.mockResolvedValue(null)

      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(result.success).toBe(false)
      expect(result.output).toContain('No model configured for provider')
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })

    it('should handle LLM adapter error', async () => {
      const errorMessage = 'API Error'
      mockAdapter.sendMessage.mockRejectedValue(errorMessage)

      const input = {
        description: 'Test task',
        prompt: 'Do this task',
        category: 'quick'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(result.success).toBe(false)
      expect(result.output).toBe(errorMessage)
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed'
          })
        })
      )
    })
  })

  describe('cancelTask', () => {
    it('should cancel task successfully', async () => {
      await delegateEngine.cancelTask('task-1')

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: 'cancelled',
          completedAt: expect.any(Date)
        })
      })

      expect(mockLogger.info).toHaveBeenCalledWith('Task cancelled', { taskId: 'task-1' })
    })
  })
})

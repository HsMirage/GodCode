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
      findFirst: vi.fn(),
      findMany: vi.fn()
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
  getCategoryBinding: vi.fn(async (..._args: any[]) => null as any),
  getAgentBinding: vi.fn(async (..._args: any[]) => null as any)
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
    mocks.mockAdapter.sendMessage.mockReset()
    delegateEngine = new DelegateEngine()

    bindingMocks.getCategoryModelConfig.mockImplementation(async (categoryCode: string) => {
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
    })
    bindingMocks.getAgentModelConfig.mockImplementation(async (agentCode: string) => {
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
    })
    bindingMocks.getCategoryBinding.mockImplementation(async () => null)
    bindingMocks.getAgentBinding.mockImplementation(async () => null)

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
        category: 'tianbing',
        sessionId: 'test-session-123'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(mocks.mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            input: input.description,
            metadata: expect.objectContaining({
              category: 'tianbing',
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

    it('should include builtin category prompt when delegating by category', async () => {
      const input = {
        description: 'Build UI task',
        prompt: 'Create UI components',
        category: 'tianbing',
        sessionId: 'test-session-123',
        useDynamicPrompt: false as const
      }

      await delegateEngine.delegateTask(input)

      const sentMessages = mocks.mockAdapter.sendMessage.mock.calls[0]?.[0] as Array<{
        role: string
        content: string
      }>
      const systemMessage = sentMessages.find(message => message.role === 'system')

      expect(systemMessage?.content).toContain('<Category_Execution_Contract>')
      expect(systemMessage?.content).toContain('CATEGORY-RUN EXECUTION MODE')
      expect(systemMessage?.content).toContain('<Category_Context>')
      expect(systemMessage?.content).toContain('SMALL / QUICK tasks')
    })

    it('should append category execution contract in dynamic category-only mode', async () => {
      await delegateEngine.delegateTask({
        description: 'Category-only dynamic mode task',
        prompt: 'Implement a quick backend fix and verify output',
        category: 'tianbing',
        sessionId: 'test-session-123'
      })

      const sentMessages = mocks.mockAdapter.sendMessage.mock.calls.at(-1)?.[0] as Array<{
        role: string
        content: string
      }>
      const systemMessage = sentMessages.find(message => message.role === 'system')

      expect(systemMessage?.content).toContain('<Category_Execution_Contract>')
      expect(systemMessage?.content).toContain('CATEGORY-RUN EXECUTION MODE')
      expect(systemMessage?.content).toContain('<Category_Context>')
    })

    it('should apply category binding system prompt in dynamic mode and still append category context', async () => {
      bindingMocks.getCategoryBinding.mockImplementation(async () => {
        return {
          id: 'cat-1',
          categoryCode: 'quick',
          categoryName: '天兵',
          description: 'quick tasks',
          modelId: null,
          modelName: null,
          temperature: 0.3,
          systemPrompt: 'CUSTOM CATEGORY SYSTEM PROMPT',
          enabled: true
        }
      })

      await delegateEngine.delegateTask({
        description: 'Category prompt override task',
        prompt: 'Implement quick fix with strict output',
        category: 'tianbing',
        sessionId: 'test-session-123'
      })

      const sentMessages = mocks.mockAdapter.sendMessage.mock.calls.at(-1)?.[0] as Array<{
        role: string
        content: string
      }>
      const systemMessage = sentMessages.find(message => message.role === 'system')

      expect(systemMessage?.content).toContain('CUSTOM CATEGORY SYSTEM PROMPT')
      expect(systemMessage?.content).toContain('<Category_Execution_Contract>')
      expect(systemMessage?.content).toContain('<Category_Context>')
      expect(systemMessage?.content).toContain('SMALL / QUICK tasks')
    })

    it('should not append category execution contract when subagent_type is explicit', async () => {
      await delegateEngine.delegateTask({
        description: 'Explicit subagent task',
        prompt: 'Research and propose optimization',
        category: 'tianbing',
        subagent_type: 'qianliyan',
        sessionId: 'test-session-123'
      })

      const sentMessages = mocks.mockAdapter.sendMessage.mock.calls.at(-1)?.[0] as Array<{
        role: string
        content: string
      }>
      const systemMessage = sentMessages.find(message => message.role === 'system')

      expect(systemMessage?.content).not.toContain('<Category_Execution_Contract>')
      expect(systemMessage?.content).toContain('<Category_Context>')
    })

    it('should delegate task successfully with subagent_type', async () => {
      const input = {
        description: 'Research task',
        prompt: 'Research this',
        subagent_type: 'qianliyan',
        sessionId: 'test-session-123'
      }

      const result = await delegateEngine.delegateTask(input)

      expect(mocks.mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              subagent_type: 'qianliyan',
              model: 'claude-3-haiku-20240307'
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
        category: 'tianbing',
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

    it('should reject unknown primary role alias in metadata payload', async () => {
      const result = await delegateEngine.delegateTask({
        description: 'Test task',
        prompt: 'Do this task',
        category: 'tianbing',
        sessionId: 'test-session-123',
        metadata: {
          primaryAgentRoleAlias: 'unknown-role'
        }
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('Unknown primary role alias')
      expect(result.output).toContain('fuxi/planning')
      expect(result.output).toContain('haotian/orchestration')
      expect(result.output).toContain('kuafu/execution')
      expect(mocks.mockAdapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should include primary role policy snapshot metadata when alias is valid', async () => {
      const result = await delegateEngine.delegateTask({
        description: 'Test task',
        prompt: 'Do this task',
        category: 'tianbing',
        sessionId: 'test-session-123',
        metadata: {
          primaryAgentRoleAlias: 'fuxi',
          workflowStage: 'plan'
        }
      })

      expect(result.success).toBe(true)
      const createCall = mocks.mockPrisma.task.create.mock.calls.at(-1)?.[0]
      expect(createCall?.data?.metadata).toEqual(
        expect.objectContaining({
          primaryAgentRolePolicy: expect.objectContaining({
            alias: 'fuxi',
            canonicalAgent: 'fuxi',
            canonicalRole: 'planning',
            workflowStage: 'plan'
          })
        })
      )
    })

    it('should persist recovery request context in task metadata when provided', async () => {
      const result = await delegateEngine.delegateTask({
        description: 'Recover failed task',
        prompt: 'Attempt repair and validate output',
        category: 'tianbing',
        sessionId: 'test-session-123',
        metadata: {
          recoveryContext: {
            sourceError: 'network timeout while validating migration',
            failureClass: 'transient',
            attemptId: 'workflow-1:task-2:1',
            repairObjective: 'retry migration and confirm success',
            orchestratorOwner: 'haotian'
          }
        }
      })

      expect(result.success).toBe(true)
      const createCall = mocks.mockPrisma.task.create.mock.calls.at(-1)?.[0]
      expect(createCall?.data?.metadata?.recoveryContext).toEqual(
        expect.objectContaining({
          sourceError: 'network timeout while validating migration',
          failureClass: 'transient',
          attemptId: 'workflow-1:task-2:1',
          repairObjective: 'retry migration and confirm success',
          orchestratorOwner: 'haotian'
        })
      )
    })

    it('should fail fast when explicit subagent conflicts with primary role alias', async () => {
      const result = await delegateEngine.delegateTask({
        description: 'Conflict task',
        prompt: 'Do this task',
        subagent_type: 'haotian',
        sessionId: 'test-session-123',
        metadata: {
          primaryAgentRoleAlias: 'fuxi',
          workflowStage: 'plan'
        }
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('Primary role policy conflict')
      expect(result.output).toContain('fuxi')
      expect(result.output).toContain('haotian')
      expect(mocks.mockAdapter.sendMessage).not.toHaveBeenCalled()
    })

    it('should enforce stage ownership in strict role mode', async () => {
      const previous = process.env.WORKFORCE_STRICT_ROLE_MODE
      process.env.WORKFORCE_STRICT_ROLE_MODE = 'true'

      try {
        const result = await delegateEngine.delegateTask({
          description: 'Invalid stage owner',
          prompt: 'Do this task',
          subagent_type: 'fuxi',
          sessionId: 'test-session-123',
          metadata: {
            primaryAgentRoleAlias: 'fuxi',
            workflowStage: 'dispatch'
          }
        })

        expect(result.success).toBe(false)
        expect(result.output).toContain('Role boundary violation')
        expect(result.output).toContain('dispatch')
        expect(result.output).toContain('haotian')
      } finally {
        if (previous === undefined) {
          delete process.env.WORKFORCE_STRICT_ROLE_MODE
        } else {
          process.env.WORKFORCE_STRICT_ROLE_MODE = previous
        }
      }
    })

    it('should allow strict boundary override and audit override metadata', async () => {
      const previous = process.env.WORKFORCE_STRICT_ROLE_MODE
      process.env.WORKFORCE_STRICT_ROLE_MODE = 'true'

      try {
        const result = await delegateEngine.delegateTask({
          description: 'Override stage owner',
          prompt: 'Do this task',
          subagent_type: 'fuxi',
          sessionId: 'test-session-123',
          metadata: {
            primaryAgentRoleAlias: 'fuxi',
            workflowStage: 'dispatch',
            roleBoundaryOverride: {
              actor: 'integration-test',
              reason: 'temporary controlled override',
              scope: 'dispatch',
              expiry: '2026-12-31T00:00:00Z'
            }
          }
        })

        expect(result.success).toBe(true)
        const createCall = mocks.mockPrisma.task.create.mock.calls.at(-1)?.[0]
        expect(createCall?.data?.metadata?.primaryAgentRolePolicy?.override).toEqual(
          expect.objectContaining({
            actor: 'integration-test',
            reason: 'temporary controlled override',
            scope: 'dispatch',
            expiry: '2026-12-31T00:00:00Z'
          })
        )
      } finally {
        if (previous === undefined) {
          delete process.env.WORKFORCE_STRICT_ROLE_MODE
        } else {
          process.env.WORKFORCE_STRICT_ROLE_MODE = previous
        }
      }
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

    it('returns pending result when runInBackground is true', async () => {
      const result = await delegateEngine.delegateTask({
        description: 'Background task',
        prompt: 'Run in background',
        category: 'tianbing',
        sessionId: 'test-session-123',
        runInBackground: true
      })

      expect(result.success).toBe(true)
      expect(result.output).toContain('Background task started:')
      expect(createLLMAdapter).not.toHaveBeenCalled()
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              runInBackground: true,
              backgroundPending: true
            })
          })
        })
      )
    })

    it('should recover from empty model output with a follow-up prompt', async () => {
      mocks.mockAdapter.sendMessage
        .mockResolvedValueOnce({
          content: '',
          usage: { prompt_tokens: 8, completion_tokens: 0 }
        })
        .mockResolvedValueOnce({
          content: 'Recovered summary with concrete output',
          usage: { prompt_tokens: 5, completion_tokens: 9 }
        })

      const result = await delegateEngine.delegateTask({
        description: 'Implement feature X',
        prompt: 'Implement feature X in codebase',
        category: 'tianbing',
        sessionId: 'test-session-123'
      })

      expect(result.success).toBe(true)
      expect(result.output).toContain('Recovered summary')
      expect(mocks.mockAdapter.sendMessage).toHaveBeenCalledTimes(2)
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            status: 'completed',
            output: expect.stringContaining('Recovered summary')
          })
        })
      )
    })

    it('should fail when model keeps returning empty content after recovery prompt', async () => {
      mocks.mockAdapter.sendMessage
        .mockResolvedValueOnce({
          content: '',
          usage: {}
        })
        .mockResolvedValueOnce({
          content: '',
          usage: {}
        })

      const result = await delegateEngine.delegateTask({
        description: 'Implement feature Y',
        prompt: 'Implement feature Y in codebase',
        category: 'tianbing',
        sessionId: 'test-session-123'
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('empty output after recovery prompt')
      expect(mocks.mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            status: 'failed',
            output: expect.stringContaining('Error: Delegate task returned empty output after recovery prompt')
          })
        })
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
        category: 'tianbing',
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
        category: 'tianbing',
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

    it('should reject fuxi execution-stage request even when strict role mode is off', async () => {
      const result = await delegateEngine.delegateTask({
        description: '实现支付链路并修改后端代码',
        prompt: '请直接实现并提交代码',
        subagent_type: 'fuxi',
        sessionId: 'test-session-123',
        metadata: { workflowStage: 'execution' }
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('FuXi is planning-only')
      expect(result.output).toContain('handoff')
    })

    it('should allow fuxi plan-stage request', async () => {
      const result = await delegateEngine.delegateTask({
        description: '为支付链路生成执行计划',
        prompt: '输出计划文件到 .fuxi/plans/payment.md',
        subagent_type: 'fuxi',
        sessionId: 'test-session-123',
        metadata: { workflowStage: 'plan' }
      })

      expect(result.success).toBe(true)
    })

    it('should reject fuxi implementation intent when workflow stage is missing', async () => {
      const result = await delegateEngine.delegateTask({
        description: '实现支付链路并修改后端代码',
        prompt: '请直接实现并提交代码',
        subagent_type: 'fuxi',
        sessionId: 'test-session-123'
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('FuXi is planning-only')
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

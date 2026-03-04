import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import { DelegateEngine } from '@/main/services/delegate/delegate-engine'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'

const mocks = vi.hoisted(() => {
  const prisma: any = {
    task: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    agentBinding: {
      findUnique: vi.fn()
    },
    categoryBinding: {
      findUnique: vi.fn()
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn()
    },
    space: {
      create: vi.fn(),
      findFirst: vi.fn()
    },
    model: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn()
    },
    systemSetting: {
      findUnique: vi.fn()
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
  const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
  const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '')

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.llmAdapter.sendMessage.mockReset()
    mocks.llmAdapter.streamMessage.mockReset()
    mocks.prisma.task.create.mockReset()
    mocks.prisma.task.update.mockReset()
    mocks.prisma.task.findUnique.mockReset()
    mocks.prisma.model.findMany.mockReset()
    mocks.prisma.model.findFirst.mockReset()
    mocks.prisma.model.findUnique.mockReset()
    mocks.prisma.systemSetting.findUnique.mockReset()
    mocks.prisma.session.findFirst.mockReset()
    mocks.prisma.session.findUnique.mockReset()
    mocks.prisma.space.findFirst.mockReset()
    mocks.bindingService.getCategoryModelConfig.mockReset()
    mocks.bindingService.getAgentModelConfig.mockReset()
    mocks.bindingService.getCategoryBinding.mockReset()
    mocks.bindingService.getAgentBinding.mockReset()

    mocks.prisma.session.findFirst.mockResolvedValue({ id: 'sess_123' })
    mocks.prisma.session.findUnique.mockResolvedValue({
      id: 'test-session-123',
      space: { id: 'space_123', workDir: '/tmp/workspace-a' }
    })
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
    mocks.prisma.systemSetting.findUnique.mockResolvedValue({ key: 'defaultModelId', value: 'model_123' })
    mocks.prisma.model.findUnique.mockResolvedValue({
      id: 'model_123',
      provider: 'openai-compatible',
      apiKey: 'test-key',
      baseURL: null,
      modelName: 'gpt-4o',
      config: { apiProtocol: 'chat/completions' },
      apiKeyRef: null
    })

    mocks.bindingService.getCategoryModelConfig.mockImplementation(async (category: string) => {
      if (category === 'quick') {
        return {
          model: 'gpt-4o',
          provider: 'openai-compatible',
          temperature: 0.3,
          apiKey: 'test-key'
        }
      }
      return {
        model: 'gpt-4o',
        provider: 'openai-compatible',
        temperature: 0.5,
        apiKey: 'test-key'
      }
    })
    mocks.bindingService.getAgentModelConfig.mockImplementation(async (agentCode: string) => {
      if (agentCode) {
        return {
          model: 'gpt-4o',
          provider: 'openai-compatible',
          temperature: 0.5,
          apiKey: 'test-key'
        }
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

    mocks.prisma.task.findUnique.mockResolvedValue(null)

    delegateEngine = new DelegateEngine()
    workforceEngine = new WorkforceEngine()
  })

  afterEach(() => {
    existsSyncSpy.mockReset()
    existsSyncSpy.mockReturnValue(false)
    readFileSyncSpy.mockReset()
    readFileSyncSpy.mockImplementation(() => '')
    delete process.env.WORKFORCE_STRICT_ROLE_MODE
    vi.restoreAllMocks()
  })

  describe('Workflow Observability', () => {
    it('returns terminal continuation status when metadata snapshot is missing', async () => {
      const now = new Date('2026-02-22T09:00:00.000Z')
      mocks.prisma.task.findUnique.mockResolvedValue({
        id: 'workflow-xyz',
        status: 'completed',
        updatedAt: now,
        metadata: {
          graph: { workflowId: 'workflow-xyz', nodeOrder: [], nodes: [] },
          integration: {
            summary: 'integration summary',
            conflicts: [],
            unresolvedItems: [],
            taskOutputs: [],
            rawTaskOutputs: []
          },
          sharedContext: {
            workflowId: 'workflow-xyz',
            totalEntries: 0,
            activeEntries: 0,
            archivedEntries: 0,
            entries: [],
            archived: []
          }
        }
      })

      const snapshot = await workforceEngine.getWorkflowObservability('workflow-xyz')

      expect(snapshot).not.toBeNull()
      expect(snapshot?.continuationSnapshot.status).toBe('completed')
      expect(snapshot?.continuationSnapshot.updatedAt).toEqual(expect.any(String))
    })
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
      expect(mocks.prisma.systemSetting.findUnique).toHaveBeenCalledWith({
        where: { key: 'defaultModelId' }
      })
      expect(mocks.prisma.model.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'model_123' } })
      )
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
        category: 'tianbing',
        sessionId: 'test-session-123'
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe('Task completed successfully')
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'subtask',
            metadata: expect.objectContaining({
              category: 'tianbing'
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
        subagent_type: 'baize',
        sessionId: 'test-session-123'
      })

      expect(result.success).toBe(true)
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              subagent_type: 'baize'
            })
          })
        })
      )
    })
  })

  describe('Role-aligned workflow lifecycle', () => {
    it('should record plan→dispatch→checkpoint→integration→finalize lifecycle with stage owners and evidence gaps', async () => {
      const decomposition = {
        subtasks: [{ id: 't1', description: 'Implement feature task', dependencies: [] }]
      }

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify(decomposition),
        usage: { input_tokens: 20, output_tokens: 20 }
      })

      const dispatchCalls: Array<any> = []
      const checkpointOutputs = [
        JSON.stringify({ status: 'continue', approved_task_ids: ['t1'] }),
        JSON.stringify({ status: 'continue', approved_task_ids: [] }),
        JSON.stringify({ status: 'continue', approved_task_ids: [] })
      ]

      const workerDispatcherModule = await import('@/main/services/workforce/worker-dispatcher')
      const dispatchSpy = vi
        .spyOn(workerDispatcherModule.WorkforceWorkerDispatcher.prototype, 'dispatch')
        .mockImplementation(async (input: any) => {
          dispatchCalls.push(input)
          const metadata = input.metadata || {}
          if (metadata.orchestrationCheckpoint) {
            const output = checkpointOutputs.shift() || JSON.stringify({ status: 'continue' })
            return {
              taskId: `checkpoint_${dispatchCalls.length}`,
              output,
              success: true,
              runId: `run_checkpoint_${dispatchCalls.length}`,
              model: 'openai-compatible::gpt-4o',
              modelSource: 'system-default'
            }
          }

          return {
            taskId: `exec_${dispatchCalls.length}`,
            output: ['changes: updated src/main/services/workforce/workforce-engine.ts', 'validation: pnpm vitest --run'].join('\n'),
            success: true,
            runId: `run_exec_${dispatchCalls.length}`,
            model: 'openai-compatible::gpt-4o',
            modelSource: 'system-default'
          }
        })

      try {
        await workforceEngine.executeWorkflow('Build role aligned workflow', 'test-session-123', {
          agentCode: 'haotian',
          enableRetry: false
        })
      } finally {
        dispatchSpy.mockRestore()
      }

      const finalUpdate = mocks.prisma.task.update.mock.calls.at(-1)?.[0]
      const lifecycle = finalUpdate?.data?.metadata?.timeline?.workflow || []
      expect(lifecycle.map((item: any) => item.stage)).toEqual([
        'plan',
        'dispatch',
        'checkpoint',
        'integration',
        'finalize'
      ])
      expect(lifecycle.map((item: any) => item.details?.stageOwner)).toEqual([
        'fuxi',
        'haotian',
        'haotian',
        'haotian',
        'haotian'
      ])

      const unresolvedItems = finalUpdate?.data?.metadata?.integration?.unresolvedItems || []
      expect(unresolvedItems.some((entry: string) => entry.includes('evidence-gap'))).toBe(true)

      const executionDispatch = dispatchCalls.find(call => !call?.metadata?.orchestrationCheckpoint)
      expect(executionDispatch?.metadata?.workflowPhase).toBe('execution')
      expect(executionDispatch?.metadata?.runtimeBindingSnapshot).toEqual(
        expect.objectContaining({
          primaryAgentRolePolicy: expect.objectContaining({
            alias: 'haotian',
            canonicalAgent: 'haotian',
            canonicalRole: 'orchestration'
          })
        })
      )
    })

    it('should reject non-haotian orchestrator when strict role mode is enabled', async () => {
      process.env.WORKFORCE_STRICT_ROLE_MODE = 'true'

      await expect(
        workforceEngine.executeWorkflow('Run strict role flow', 'test-session-123', {
          agentCode: 'fuxi',
          enableRetry: false
        })
      ).rejects.toThrow('Strict role mode requires orchestration owner "haotian"')
    })

    it('should keep workflow executable in soft mode when strict role mode is disabled', async () => {
      process.env.WORKFORCE_STRICT_ROLE_MODE = 'false'

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify({ subtasks: [{ id: 't1', description: 'Implement task', dependencies: [] }] }),
        usage: { input_tokens: 20, output_tokens: 20 }
      })

      const workerDispatcherModule = await import('@/main/services/workforce/worker-dispatcher')
      const checkpointOutputs = [
        JSON.stringify({ status: 'continue', approved_task_ids: ['t1'] }),
        JSON.stringify({ status: 'continue', approved_task_ids: [] }),
        JSON.stringify({ status: 'continue', approved_task_ids: [] })
      ]
      const dispatchSpy = vi
        .spyOn(workerDispatcherModule.WorkforceWorkerDispatcher.prototype, 'dispatch')
        .mockImplementation(async (input: any) => {
          if (input?.metadata?.orchestrationCheckpoint) {
            return {
              taskId: `checkpoint_${Date.now()}`,
              output: checkpointOutputs.shift() || JSON.stringify({ status: 'continue' }),
              success: true,
              runId: `run_checkpoint_${Date.now()}`,
              model: 'openai-compatible::gpt-4o',
              modelSource: 'system-default'
            }
          }

          return {
            taskId: `exec_${Date.now()}`,
            output: [
              'objective: implement role-aligned flow',
              'changes: src/main/services/workforce/workforce-engine.ts',
              'validation: pnpm vitest tests/integration/workforce-engine.test.ts --run',
              'residual-risk: none'
            ].join('\n'),
            success: true,
            runId: `run_exec_${Date.now()}`,
            model: 'openai-compatible::gpt-4o',
            modelSource: 'system-default'
          }
        })

      try {
        const result = await workforceEngine.executeWorkflow('Run soft role flow', 'test-session-123', {
          agentCode: 'fuxi',
          enableRetry: false
        })

        expect(result.success).toBe(true)
      } finally {
        dispatchSpy.mockRestore()
      }
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

      const result = await workforceEngine.executeWorkflow('Parallel work', 'test-session-123')

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

      const result = await workforceEngine.executeWorkflow('Sequential work', 'test-session-123')

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
        category: 'tianbing',
        sessionId: 'test-session-123'
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

    it('should recover failed workflow task and complete with recovery observability', async () => {
      const mockDecomposition = {
        subtasks: [{ id: 't1', description: 'Recoverable task', dependencies: [] }]
      }

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify(mockDecomposition),
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const dispatchSpy = vi
        .spyOn((workforceEngine as any).workerDispatcher, 'dispatch')
        .mockImplementation(async (input: any) => {
          if (input?.metadata?.recoveryContext) {
            return {
              success: true,
              output: [
                'objective: recover from transient task error',
                'changes: src/main/services/workforce/workforce-engine.ts',
                'validation: pnpm vitest tests/integration/workforce-engine.test.ts --run',
                'residual-risk: low'
              ].join('\n'),
              taskId: 'subtask_recovery',
              runId: 'run_recovery_1',
              model: 'openai-compatible::gpt-4o',
              modelSource: 'system-default'
            }
          }

          throw new Error('network timeout while executing subtask')
        })

      try {
        const result = await workforceEngine.executeWorkflow('Recover and continue workflow', 'test-session-123', {
          enableRetry: false,
          recoveryConfig: {
            enabled: true,
            maxAttempts: 2,
            classBudget: {
              transient: 2,
              config: 1,
              dependency: 1,
              implementation: 1,
              permission: 1,
              unknown: 1
            },
            fallbackPolicy: 'category-first'
          }
        })

        expect(result.success).toBe(true)

        const finalWorkflowUpdate = mocks.prisma.task.update.mock.calls
          .map((call: any[]) => call[0])
          .reverse()
          .find((call: Record<string, any>) => call?.data?.status === 'completed')

        expect(finalWorkflowUpdate?.data?.metadata?.recoveryState?.recoveredTasks).toContain('t1')
        expect(finalWorkflowUpdate?.data?.metadata?.recoveryState?.history?.length).toBeGreaterThan(0)
        expect(
          finalWorkflowUpdate?.data?.metadata?.timeline?.task?.some(
            (item: any) => item.taskId === 't1' && item.status === 'completed'
          )
        ).toBe(true)

        const recoveryDispatchCall = dispatchSpy.mock.calls.find(
          (call: any[]) => call?.[0]?.metadata?.recoveryContext
        )?.[0] as Record<string, any> | undefined
        expect(recoveryDispatchCall?.metadata?.primaryAgentRoleAlias).toBe('haotian')
        expect(recoveryDispatchCall?.metadata?.workflowStage).toBe('dispatch')
      } finally {
        dispatchSpy.mockRestore()
      }
    })

    it('should record terminal unrecovered diagnostics for permission failures', async () => {
      const mockDecomposition = {
        subtasks: [{ id: 't_perm', description: 'Permission task', dependencies: [] }]
      }

      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify(mockDecomposition),
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      const dispatchSpy = vi
        .spyOn((workforceEngine as any).workerDispatcher, 'dispatch')
        .mockRejectedValue(new Error('403 forbidden for this operation'))

      try {
        await expect(
          workforceEngine.executeWorkflow('Permission failure workflow', 'test-session-123', {
            enableRetry: false,
            recoveryConfig: {
              enabled: true,
              maxAttempts: 2,
              classBudget: {
                transient: 2,
                config: 1,
                dependency: 1,
                implementation: 1,
                permission: 1,
                unknown: 1
              },
              fallbackPolicy: 'category-first'
            }
          })
        ).rejects.toThrow('403 forbidden')

        const finalWorkflowUpdate = mocks.prisma.task.update.mock.calls
          .map((call: any[]) => call[0])
          .reverse()
          .find((call: Record<string, any>) => call?.data?.status === 'failed')

        expect(finalWorkflowUpdate?.data?.metadata?.recoveryState?.unrecoveredTasks).toContain('t_perm')
        expect(finalWorkflowUpdate?.data?.metadata?.recoveryState?.terminalDiagnostics?.[0]).toEqual(
          expect.objectContaining({
            taskId: 't_perm',
            failureClass: 'permission'
          })
        )
        expect(
          finalWorkflowUpdate?.data?.metadata?.recoveryState?.history?.some(
            (item: any) => item.taskId === 't_perm' && item.status === 'aborted'
          )
        ).toBe(true)
      } finally {
        dispatchSpy.mockRestore()
      }
    })
  })

  describe('Delegate Engine and Agent Coordination', () => {
    it('should reuse existing session for task continuity', async () => {
      mocks.llmAdapter.sendMessage.mockResolvedValueOnce({
        content: 'Response',
        usage: { input_tokens: 10, output_tokens: 10 }
      })

      await delegateEngine.delegateTask({
        description: 'Continuing task',
        prompt: 'Continue working',
        category: 'tianbing',
        sessionId: 'test-session-123'
      })

      // With session isolation, the engine uses the provided sessionId directly
      expect(mocks.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'test-session-123'
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
        category: 'tianbing',
        sessionId: 'test-session-123',
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'
import { calculateBackoffDelay, RetryableErrorType } from '@/main/services/workforce/retry'
import { createLLMAdapter } from '@/main/services/llm/factory'
import fs from 'node:fs'
import path from 'node:path'

// Mock dependencies
const mockPrisma: any = {
  task: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn()
  },
  model: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  systemSetting: {
    findUnique: vi.fn()
  },
  agentBinding: {
    findUnique: vi.fn()
  },
  categoryBinding: {
    findUnique: vi.fn()
  },
  session: {
    findUnique: vi.fn(),
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

const mockSecureStorage = {
  decrypt: vi.fn((s: string) => s)
}

vi.mock('@/main/services/secure-storage.service', () => ({
  SecureStorageService: {
    getInstance: vi.fn(() => mockSecureStorage)
  }
}))

const mockWorkerDispatcher = {
  dispatch: vi.fn()
}

vi.mock('@/main/services/workforce/worker-dispatcher', () => ({
  WorkforceWorkerDispatcher: vi.fn(() => mockWorkerDispatcher)
}))

const mockBoulderService = {
  getState: vi.fn(),
  isSessionTracked: vi.fn()
}

vi.mock('@/main/services/boulder-state.service', () => ({
  BoulderStateService: {
    getInstance: vi.fn(() => mockBoulderService)
  }
}))

describe('WorkforceEngine', () => {
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.WORKFORCE_STRICT_BINDING
    workforceEngine = new WorkforceEngine()
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => '')
    mockBoulderService.getState.mockResolvedValue({})
    mockBoulderService.isSessionTracked.mockResolvedValue(false)

    // Default mocks setup
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'test-session-123',
      space: { id: 'space-1', workDir: '/tmp/workspace-a' }
    })
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1' })
    mockPrisma.task.create.mockResolvedValue({ id: 'workflow-1', type: 'workflow' })
    mockPrisma.task.update.mockResolvedValue({ id: 'workflow-1' })
    mockPrisma.task.findUnique.mockResolvedValue(null)
    mockPrisma.model.findMany.mockResolvedValue([
      {
        id: 'model-1',
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20240620',
        apiKey: 'test-key',
        apiKeyRef: null,
        baseURL: null,
        config: {}
      }
    ])
    mockPrisma.systemSetting.findUnique.mockResolvedValue({
      key: 'defaultModelId',
      value: 'model-1'
    })
    mockPrisma.model.findUnique.mockImplementation(async ({ where }: any) => {
      if (!where?.id) return null
      return {
        id: where.id,
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20240620',
        apiKey: 'test-key',
        baseURL: null,
        config: {},
        apiKeyRef: null,
        updatedAt: new Date()
      }
    })
    mockPrisma.agentBinding.findUnique.mockResolvedValue(null)
    mockPrisma.categoryBinding.findUnique.mockResolvedValue(null)
    mockAdapter.sendMessage.mockResolvedValue({
      content: JSON.stringify({
        subtasks: [
          { id: 'task-1', description: 'Task 1', dependencies: [] },
          { id: 'task-2', description: 'Task 2', dependencies: ['task-1'] }
        ]
      })
    })
    mockWorkerDispatcher.dispatch.mockResolvedValue({
      taskId: 'subtask-id',
      output: 'Task output',
      success: true,
      runId: 'run-123',
      model: 'openai-compatible::gpt-4o-mini',
      modelSource: 'system-default'
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getWorkflowObservability', () => {
    it('returns fallback continuation snapshot status from workflow task state', async () => {
      const now = new Date('2026-02-22T07:00:00.000Z')
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'workflow-1',
        status: 'completed',
        createdAt: now,
        startedAt: now,
        completedAt: now,
        metadata: {
          graph: { workflowId: 'workflow-1', nodeOrder: [], nodes: [] },
          integration: {
            summary: 'ok',
            conflicts: [],
            unresolvedItems: [],
            taskOutputs: [],
            rawTaskOutputs: []
          },
          sharedContext: {
            workflowId: 'workflow-1',
            totalEntries: 0,
            activeEntries: 0,
            archivedEntries: 0,
            entries: [],
            archived: []
          },
          timeline: { workflow: [], task: [], run: [] }
        }
      })

      const snapshot = await workforceEngine.getWorkflowObservability('workflow-1')

      expect(snapshot).not.toBeNull()
      expect(snapshot?.workflowId).toBe('workflow-1')
      expect(snapshot?.continuationSnapshot.status).toBe('completed')
      expect(snapshot?.continuationSnapshot.updatedAt).toBe(now.toISOString())
      expect(snapshot?.recoveryState.phase).toBe('classify')
      expect(snapshot?.recoveryState.history).toEqual([])
    })
  })

  describe('decomposeTask', () => {

    it('should decompose task into subtasks', async () => {
      const input = 'Complex task'
      const subtasks = await workforceEngine.decomposeTask(input)

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

    it('should use agent-bound model when agentCode is provided', async () => {
      mockPrisma.model.findMany.mockResolvedValue([])
      mockPrisma.agentBinding.findUnique.mockResolvedValue({
        enabled: true,
        temperature: 0.2,
        modelId: 'agent-model-1',
        model: {
          id: 'agent-model-1',
          provider: 'openai-compatible',
          modelName: 'gpt-4o-mini',
          apiKeyRef: { encryptedKey: 'encrypted-key', baseURL: 'https://example.test' },
          apiKey: null,
          baseURL: null,
          config: { apiProtocol: 'responses' }
        }
      })
      mockSecureStorage.decrypt.mockReturnValue('decrypted-key')

      const subtasks = await workforceEngine.decomposeTask('input', { agentCode: 'haotian' })

      expect(mockPrisma.agentBinding.findUnique).toHaveBeenCalled()
      expect(createLLMAdapter).toHaveBeenCalledWith(
        'openai-compatible',
        expect.objectContaining({ apiKey: 'decrypted-key' })
      )
      expect(subtasks).toHaveLength(2)
    })

    it('should handle model not configured error', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null)

      await expect(workforceEngine.decomposeTask('input')).rejects.toThrow('MODEL_NOT_CONFIGURED')
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

      const workflowResult = await workforceEngine.executeWorkflow(input, 'test-session-123')

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
      expect(mockWorkerDispatcher.dispatch).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          description: 'Task 1',
          parentTaskId: 'workflow-1',
          metadata: expect.objectContaining({
            dispatchMode: 'sync',
            concurrencyKey: expect.any(String),
            concurrencyLimit: expect.any(Number)
          })
        })
      )

      // Should execute task 2 second (depends on task 1)
      expect(mockWorkerDispatcher.dispatch).toHaveBeenNthCalledWith(
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
            output: expect.stringContaining('integration summary')
          })
        })
      )

      expect(workflowResult.executions.size).toBe(2)
      const finalUpdateCall = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      expect(finalUpdateCall?.data?.metadata?.graph?.workflowId).toBe('workflow-1')
      expect(finalUpdateCall?.data?.metadata?.correlation?.workflowId).toBe('workflow-1')
      expect(finalUpdateCall?.data?.metadata?.timeline?.workflow?.length).toBeGreaterThan(0)
      expect(finalUpdateCall?.data?.metadata?.integration?.summary).toContain('integration summary')
      expect(finalUpdateCall?.data?.metadata?.sharedContext?.totalEntries).toBeGreaterThan(0)
      expect(finalUpdateCall?.data?.metadata?.sharedContext?.activeEntries).toBeGreaterThan(0)
      expect(Array.isArray(finalUpdateCall?.data?.metadata?.sharedContext?.entries)).toBe(true)
      expect(Array.isArray(finalUpdateCall?.data?.metadata?.sharedContext?.archived)).toBe(true)
      expect(finalUpdateCall?.data?.metadata?.sharedContextQueries?.byWorkflow).toBeGreaterThan(0)
      expect(workflowResult.executions.get('task-1')?.persistedTaskId).toBe('subtask-id')
      expect(workflowResult.executions.get('task-1')?.runId).toBe('run-123')
      expect(workflowResult.executions.get('task-1')?.concurrencyKey).toBeDefined()
      expect(workflowResult.sharedContextStore.workflowId).toBe('workflow-1')
      expect(workflowResult.sharedContextStore.entries.length).toBeGreaterThan(0)
      const artifactEntries = workforceEngine.querySharedContextEntries(workflowResult, {
        workflowId: workflowResult.workflowId,
        category: 'artifacts'
      })
      expect(artifactEntries.length).toBeGreaterThan(0)
    })

    it('sanitizes user-facing integration output while preserving raw observability payloads', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-1', description: 'Task 1', dependencies: [] }]
        })
      })

      const rawOutput = [
        'Running validation (typecheck/build)',
        'assistant to=functions.bash',
        '{"command":"npm run build","timeout":600000}',
        'Validation passed.'
      ].join('\n')

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'subtask-id',
        output: rawOutput,
        success: true,
        runId: 'run-123',
        model: 'openai-compatible::gpt-4o-mini',
        modelSource: 'system-default'
      })

      await workforceEngine.executeWorkflow('Do workflow', 'test-session-123', { enableRetry: false })

      const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      const integration = finalUpdate?.data?.metadata?.integration
      expect(finalUpdate?.data?.output).toContain('Running validation (typecheck/build)')
      expect(finalUpdate?.data?.output).toContain('Validation passed.')
      expect(finalUpdate?.data?.output).not.toContain('assistant to=functions.bash')
      expect(finalUpdate?.data?.output).not.toContain('"command"')

      expect(integration?.taskOutputs?.[0]?.outputPreview).toContain('Running validation (typecheck/build)')
      expect(integration?.taskOutputs?.[0]?.outputPreview).toContain('Validation passed.')
      expect(integration?.taskOutputs?.[0]?.outputPreview).not.toContain('assistant to=functions.bash')

      expect(integration?.rawTaskOutputs?.[0]?.outputPreview).toContain('assistant to=functions.bash')
      expect(integration?.rawTaskOutputs?.[0]?.outputPreview).toContain('"command"')
    })

    it('should run pre-dispatch/between-waves/final orchestrator checkpoints for dependent waves', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-1',
              description: '扫描代码并汇总证据',
              dependencies: [],
              subagent_type: 'qianliyan'
            },
            {
              id: 'task-2',
              description: '实现后端接口修复并给出验证',
              dependencies: ['task-1'],
              category: 'dayu'
            }
          ]
        })
      })

      const callTrace: any[] = []
      let seq = 0
      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        callTrace.push(delegateInput)

        if (delegateInput.metadata?.orchestrationCheckpoint) {
          return {
            taskId: `checkpoint-${++seq}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: ['task-2']
            }),
            success: true
          }
        }

        return {
          taskId: `subtask-${++seq}`,
          output: delegateInput.description === '实现后端接口修复并给出验证'
            ? [
                'Changed files:',
                '- src/main/services/workforce/workforce-engine.ts',
                '',
                'Verification command:',
                '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
              ].join('\n')
            : [
                'EVIDENCE_PATHS:',
                '- src/main/services/workforce/workforce-engine.ts',
                'KEY_FINDINGS:',
                '- 依赖链完整',
                'RISKS_AND_CONCLUSIONS:',
                '- 可继续执行'
              ].join('\n'),
          success: true
        }
      })

      await workforceEngine.executeWorkflow('请先扫描代码，再实现后端接口修复', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      const task1Index = callTrace.findIndex(call => call.description === '扫描代码并汇总证据')
      const task2Index = callTrace.findIndex(call => call.description === '实现后端接口修复并给出验证')
      const checkpointCalls = callTrace.filter(call => call.metadata?.orchestrationCheckpoint === true)
      const checkpointIndices = callTrace
        .map((call, index) => ({ call, index }))
        .filter(item => item.call.metadata?.orchestrationCheckpoint === true)

      expect(task1Index).toBeGreaterThan(-1)
      expect(task2Index).toBeGreaterThan(task1Index)
      expect(checkpointCalls.length).toBeGreaterThanOrEqual(3)
      expect(checkpointIndices[0]?.index).toBeLessThan(task1Index) // pre-dispatch
      expect(checkpointIndices[1]?.index).toBeGreaterThan(task1Index) // between-waves
      expect(checkpointIndices[1]?.index).toBeLessThan(task2Index)
      expect(checkpointIndices[checkpointIndices.length - 1]?.index).toBeGreaterThan(task2Index) // final

      expect(checkpointCalls[0]?.subagent_type).toBe('haotian')
      expect(checkpointCalls[0]?.availableTools).toEqual([])
      expect(checkpointCalls[0]?.metadata?.checkpointPhase).toBe('pre-dispatch')
      expect(checkpointCalls.some(call => call.metadata?.checkpointPhase === 'between-waves')).toBe(true)
      expect(checkpointCalls.some(call => call.metadata?.checkpointPhase === 'final')).toBe(true)
    })

    it('should only require orchestrator checkpoint for haotian', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-1', description: '实现首页', dependencies: [] }]
        })
      })

      const callTrace: any[] = []
      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        callTrace.push(delegateInput)

        return {
          taskId: `subtask-${delegateInput.description}`,
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      await workforceEngine.executeWorkflow('执行流程', 'test-session-123', {
        agentCode: 'fuxi',
        enableRetry: false
      })

      const checkpointCalls = callTrace.filter(input => input.metadata?.orchestrationCheckpoint)
      expect(checkpointCalls).toHaveLength(0)
    })

    it('should dispatch checkpoint reviewer as haotian', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-1', description: '实现首页', dependencies: [] }]
        })
      })

      const callTrace: any[] = []
      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        callTrace.push(delegateInput)
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          return {
            taskId: `checkpoint-${delegateInput.metadata.checkpointPhase}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        return {
          taskId: `subtask-${delegateInput.description}`,
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      await workforceEngine.executeWorkflow('执行流程', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      const checkpointCall = callTrace.find(input => input.metadata?.orchestrationCheckpoint)
      expect(checkpointCall?.subagent_type).toBe('haotian')
    })

    it('should trigger orchestrator checkpoint in single-wave workflows', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现首页', dependencies: [] },
            { id: 'task-2', description: '实现后端接口', dependencies: [] }
          ]
        })
      })

      const callTrace: any[] = []
      let seq = 0
      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        callTrace.push(delegateInput)
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          const readyTaskIds = Array.isArray(delegateInput.metadata?.readyTaskIds)
            ? delegateInput.metadata.readyTaskIds
            : []
          return {
            taskId: `checkpoint-${++seq}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: readyTaskIds
            }),
            success: true
          }
        }

        return {
          taskId: `subtask-${++seq}`,
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      await workforceEngine.executeWorkflow('请实现网站首页、后端接口和后台页面', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      const checkpointCalls = callTrace.filter(call => call.metadata?.orchestrationCheckpoint === true)
      const checkpointPhases = checkpointCalls.map(call => call.metadata?.checkpointPhase)

      expect(checkpointPhases).toContain('pre-dispatch')
      expect(checkpointPhases).toContain('final')
      expect(checkpointPhases).not.toContain('between-waves')
    })

    it('should persist final checkpoint phase and orchestrator participation metadata', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现首页', dependencies: [] },
            { id: 'task-2', description: '实现后端接口', dependencies: ['task-1'] }
          ]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          return {
            taskId: `checkpoint-${delegateInput.metadata.checkpointPhase}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        return {
          taskId: `subtask-${delegateInput.description}`,
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow('请实现网站首页和后端接口', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.orchestratorParticipation).toBe(true)
      expect(result.orchestratorCheckpoints?.some(item => item.phase === 'final')).toBe(true)
      expect(result.continuationSnapshot).toBeDefined()

      const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      const metadata = finalUpdate?.data?.metadata || {}
      const checkpoints = metadata.orchestratorCheckpoints || []
      expect(metadata.orchestratorParticipation).toBe(true)
      expect(checkpoints.some((item: any) => item.phase === 'final')).toBe(true)
      expect(Array.isArray(metadata.timeline?.task)).toBe(true)
      expect(Array.isArray(metadata.timeline?.run)).toBe(true)
      expect(Array.isArray(metadata.timeline?.workflow)).toBe(true)
    })

    it('should fallback to DAG scheduling when checkpoint output is not parseable JSON', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-1', description: '实现首页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          return {
            taskId: `checkpoint-${delegateInput.metadata.checkpointPhase}`,
            output: 'checkpoint acknowledged without structured json',
            success: true
          }
        }

        return {
          taskId: 'subtask-impl',
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow('请实现网站首页', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(result.orchestratorCheckpoints?.some(item => item.status === 'fallback')).toBe(true)
    })

    it('should downgrade no-evidence halt when completed output contains concrete evidence', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现 Prisma schema', dependencies: [] },
            { id: 'task-2', description: '实现后端接口', dependencies: ['task-1'] }
          ]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          if (delegateInput.metadata.checkpointPhase === 'between-waves') {
            return {
              taskId: 'checkpoint-between',
              output: JSON.stringify({
                status: 'halt',
                approved_task_ids: [],
                reason:
                  'task-1 output_preview only shows intent/plan, no evidence of actual execution: no schema content, no Prisma validation.'
              }),
              success: true
            }
          }

          return {
            taskId: `checkpoint-${delegateInput.metadata.checkpointPhase}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        if (delegateInput.description === '实现 Prisma schema') {
          return {
            taskId: 'subtask-schema',
            output: [
              '完成了 schema 设计与实体关系收敛。',
              '',
              'Changed files:',
              '- prisma/schema.prisma',
              '- src/main/services/user.service.ts',
              '',
              'Verification command:',
              '- pnpm prisma validate',
              '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
            ].join('\n'),
            success: true
          }
        }

        return {
          taskId: 'subtask-api',
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow('实现 schema 后继续实现后端接口', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(result.orchestratorCheckpoints?.some(item => item.status === 'halt')).toBe(false)
      expect(
        result.orchestratorCheckpoints?.some(
          item =>
            item.phase === 'between-waves' &&
            item.status === 'continue' &&
            String(item.reason || '').includes('auto-downgraded')
        )
      ).toBe(true)
    })

    it('should retry halted checkpoint tasks instead of failing user request', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现 Prisma schema', dependencies: [] },
            { id: 'task-2', description: '实现后端接口', dependencies: ['task-1'] }
          ]
        })
      })

      let schemaRunCount = 0
      let betweenWavesCheckpointCount = 0

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          const phase = delegateInput.metadata.checkpointPhase
          if (phase === 'between-waves') {
            betweenWavesCheckpointCount++
            if (betweenWavesCheckpointCount === 1) {
              return {
                taskId: 'checkpoint-between-1',
                output: JSON.stringify({
                  status: 'halt',
                  approved_task_ids: [],
                  reason:
                    "task-1 evidence_detected=no 且 output_preview 被截断，末尾显示'让我开始创建缺失的部分'，需验证 schema/依赖是否已就绪。"
                }),
                success: true
              }
            }
          }

          return {
            taskId: `checkpoint-${phase}-${betweenWavesCheckpointCount}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        if (delegateInput.description === '实现 Prisma schema') {
          schemaRunCount++
          if (schemaRunCount === 1) {
            return {
              taskId: 'subtask-schema-1',
              output: '已经完成初步分析，让我开始创建缺失的部分。',
              success: true
            }
          }

          return {
            taskId: 'subtask-schema-2',
            output: [
              'Changed files:',
              '- prisma/schema.prisma',
              '- src/main/services/user.service.ts',
              '',
              'Verification command:',
              '- pnpm prisma validate',
              '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
            ].join('\n'),
            success: true
          }
        }

        return {
          taskId: 'subtask-api',
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow('实现 schema 后继续实现后端接口', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(schemaRunCount).toBe(2)
      expect(result.orchestratorCheckpoints?.some(item => item.status === 'halt')).toBe(true)
      expect(
        result.orchestratorCheckpoints?.some(
          item => item.phase === 'between-waves' && item.status === 'continue'
        )
      ).toBe(true)
    })

    it('should recover from final checkpoint halt on server-start confirmation gap instead of exiting', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '准备配置文件', dependencies: [] },
            { id: 'task-4', description: 'run npm run dev', dependencies: ['task-1'] }
          ]
        })
      })

      let task1RunCount = 0
      let task4RunCount = 0
      let finalCheckpointCount = 0

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          const phase = delegateInput.metadata.checkpointPhase
          if (phase === 'final') {
            finalCheckpointCount++
            if (finalCheckpointCount === 1) {
              return {
                taskId: 'checkpoint-final-1',
                output: JSON.stringify({
                  status: 'halt',
                  approved_task_ids: [],
                  reason:
                    'Task 4 (run npm run dev) did not confirm successful server startup. The output ends with an intent to start the server, not a success confirmation.'
                }),
                success: true
              }
            }
          }

          return {
            taskId: `checkpoint-${phase}-${finalCheckpointCount}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        if (delegateInput.description === '准备配置文件') {
          task1RunCount++
          return {
            taskId: `subtask-config-${task1RunCount}`,
            output:
              'Changed files:\n- package.json\n\nVerification command:\n- pnpm -s typecheck\n- pnpm -s vitest run tests/unit/services/workforce/workforce-engine.test.ts --run',
            success: true
          }
        }

        task4RunCount++
        if (task4RunCount === 1) {
          return {
            taskId: 'subtask-dev-1',
            output: '让我先执行 npm run dev，然后确认服务是否启动成功。',
            success: true
          }
        }

        return {
          taskId: 'subtask-dev-2',
          output: [
            'Server startup confirmation:',
            '- Command: npm run dev',
            '- Status: listening on http://127.0.0.1:5173',
            '',
            'Verification command:',
            '- lsof -i :5173',
            '- curl -I http://127.0.0.1:5173'
          ].join('\n'),
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow('运行开发服务并确认可访问', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(task1RunCount).toBe(1)
      expect(task4RunCount).toBeGreaterThanOrEqual(2)
      expect(result.orchestratorCheckpoints?.some(item => item.phase === 'final' && item.status === 'halt')).toBe(
        true
      )
      expect(
        result.orchestratorCheckpoints?.some(item => item.phase === 'final' && item.status === 'continue')
      ).toBe(true)
    })

    it('should recover from chinese evidence-gap halt reason instead of interrupting workflow', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现基础结构', dependencies: [] },
            { id: 'task-2', description: '修复核心功能', dependencies: ['task-1'] },
            { id: 'task-3', description: '联调并验证', dependencies: ['task-2'] }
          ]
        })
      })

      let task2RunCount = 0
      let betweenWavesCheckpointCount = 0

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          const phase = delegateInput.metadata.checkpointPhase
          if (phase === 'between-waves') {
            betweenWavesCheckpointCount++
            if (betweenWavesCheckpointCount === 2) {
              return {
                taskId: 'checkpoint-between-2',
                output: JSON.stringify({
                  status: 'halt',
                  approved_task_ids: [],
                  reason:
                    "Task-2 缺乏实现证据，输出仅显示探索与分析（如'让我继续检查这些功能'），未提供代码变更或具体修复内容，导致 Task-3 的依赖不满足。"
                }),
                success: true
              }
            }
          }

          return {
            taskId: `checkpoint-${phase}-${betweenWavesCheckpointCount}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        if (delegateInput.description === '实现基础结构') {
          return {
            taskId: 'subtask-base',
            output:
              'Changed files:\n- src/main/services/workforce/workforce-engine.ts\n\nVerification command:\n- pnpm -s vitest run tests/unit/services/workforce/workforce-engine.test.ts --run',
            success: true
          }
        }

        if (delegateInput.description === '修复核心功能') {
          task2RunCount++
          if (task2RunCount === 1) {
            return {
              taskId: 'subtask-core-1',
              output: '让我继续检查这些功能。',
              success: true
            }
          }

          return {
            taskId: 'subtask-core-2',
            output:
              'Changed files:\n- src/main/services/workforce/workforce-engine.ts\n\nVerification command:\n- pnpm -s vitest run tests/unit/services/workforce/workforce-engine.test.ts --run',
            success: true
          }
        }

        return {
          taskId: 'subtask-verify',
          output:
            'Changed files:\n- src/main/services/workforce/workforce-engine.ts\n\nVerification command:\n- pnpm -s vitest run tests/unit/services/workforce/workforce-engine.test.ts --run',
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow('修复并完成联调', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(task2RunCount).toBeGreaterThanOrEqual(2)
      expect(
        result.orchestratorCheckpoints?.some(
          item => item.phase === 'between-waves' && item.status === 'halt'
        )
      ).toBe(true)
      expect(
        result.orchestratorCheckpoints?.some(
          item => item.phase === 'between-waves' && item.status === 'continue'
        )
      ).toBe(true)
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
      mockWorkerDispatcher.dispatch.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { taskId: 'id', output: 'done', success: true }
      })

      await workforceEngine.executeWorkflow('Concurrent workflow', 'test-session-123')

      // Since we can't easily check realtime concurrency in unit test without complex setup,
      // we verify that all tasks were executed eventually
      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(5)
      for (const [dispatchInput] of mockWorkerDispatcher.dispatch.mock.calls) {
        expect(dispatchInput.metadata?.concurrencyKey).toBeDefined()
        expect(typeof dispatchInput.metadata?.concurrencyLimit).toBe('number')
      }
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

      await expect(
        workforceEngine.executeWorkflow('Deadlock workflow', 'test-session-123')
      ).rejects.toThrow('Deadlock detected')

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
      mockWorkerDispatcher.dispatch.mockRejectedValueOnce(new Error('Subtask failed'))

      await expect(
        workforceEngine.executeWorkflow('Failed workflow', 'test-session-123')
      ).rejects.toThrow('Subtask failed')

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

    it('should fail fast for kuafu when no executable plan can be resolved', async () => {
      await expect(
        workforceEngine.executeWorkflow('执行计划', 'test-session-123', { agentCode: 'kuafu' })
      ).rejects.toThrow('未找到可执行计划文件')

      expect(mockAdapter.sendMessage).not.toHaveBeenCalled()
      expect(mockWorkerDispatcher.dispatch).not.toHaveBeenCalled()
    })

    it('should parse plan tasks with dependencies and inject chongming plan review gate', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(path => String(path).includes('.sisyphus'))
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        [
          '# Plan',
          '- [ ] Task 1: 搜索代码位置 [agent: qianliyan]',
          '- [ ] Task 2: 修复后端 API 错误',
          '  depends on: 1',
          '- [ ] Task 3: 更新页面样式',
          '  category: zhinv',
          '  依赖: 1'
        ].join('\n')
      )

      let counter = 0
      mockWorkerDispatcher.dispatch.mockImplementation(async (input: any) => ({
        taskId: `persisted-${++counter}`,
        output: `done:${input.description}`,
        success: true
      }))

      const result = await workforceEngine.executeWorkflow(
        '执行计划 .sisyphus/plans/test-plan.md',
        'test-session-123',
        { agentCode: 'haotian' }
      )

      expect(result.success).toBe(true)
      const planReviewTask = result.tasks.find(task => task.assignedAgent === 'chongming')
      expect(planReviewTask).toBeDefined()

      const byDescription = new Map(
        mockWorkerDispatcher.dispatch.mock.calls.map(call => [call[0].description, call[0]])
      )

      expect(byDescription.get('Task 1: 搜索代码位置 [agent: qianliyan]')?.subagent_type).toBe(
        'qianliyan'
      )
      expect(byDescription.get('Task 2: 修复后端 API 错误')?.category).toBe('dayu')
      expect(byDescription.get('Task 3: 更新页面样式')?.category).toBe('zhinv')
      expect(byDescription.get('Task 2: 修复后端 API 错误')?.subagent_type).toBeUndefined()
      expect(byDescription.get('Task 3: 更新页面样式')?.subagent_type).toBeUndefined()
      expect(
        byDescription.get('由 chongming 审查任务分解与依赖关系，指出歧义、缺失和风险，并给出可执行修正建议。')
          ?.subagent_type
      ).toBe('chongming')
      expect(byDescription.get('Task 2: 修复后端 API 错误')?.metadata?.logicalDependencies).toContain(
        'plan-1'
      )
      expect(byDescription.get('Task 2: 修复后端 API 错误')?.metadata?.logicalDependencies).toContain(
        planReviewTask?.id
      )
    })

    it('should enforce discovery-to-execution flow for implementation requests', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-1',
              description: '扫描代码库定位后端相关模块',
              dependencies: [],
              subagent_type: 'qianliyan'
            },
            {
              id: 'task-2',
              description: '评估实现风险并给出建议',
              dependencies: ['task-1'],
              subagent_type: 'baize'
            },
            {
              id: 'task-3',
              description: '整理第三方依赖相关文档约束',
              dependencies: ['task-1'],
              subagent_type: 'diting'
            }
          ]
        })
      })

      let counter = 0
      mockWorkerDispatcher.dispatch.mockImplementation(async (input: any) => ({
        taskId: `persisted-${++counter}`,
        output: `done:${input.description}`,
        success: true
      }))

      const result = await workforceEngine.executeWorkflow(
        '新增某个后端功能，并且在前端页面中设置对应UI按钮',
        'test-session-123',
        {
          agentCode: 'haotian',
          enableRetry: false
        }
      )

      const planReviewTask = result.tasks.find(task => task.assignedAgent === 'chongming')
      expect(planReviewTask).toBeUndefined()

      const backendExecutionTask = result.tasks.find(
        task => task.workflowPhase === 'execution' && task.assignedCategory === 'dayu'
      )
      const frontendExecutionTask = result.tasks.find(
        task => task.workflowPhase === 'execution' && task.assignedCategory === 'zhinv'
      )
      expect(backendExecutionTask?.assignedCategory).toBe('dayu')
      expect(frontendExecutionTask?.assignedCategory).toBe('zhinv')
      expect(backendExecutionTask?.dependencies).toContain('task-1')
      expect(frontendExecutionTask?.dependencies).not.toContain(planReviewTask?.id)

      const byDescription = new Map(
        mockWorkerDispatcher.dispatch.mock.calls.map(call => [call[0].description, call[0]])
      )
      expect(byDescription.get(backendExecutionTask!.description)?.category).toBe('dayu')
      expect(byDescription.get(frontendExecutionTask!.description)?.category).toBe('zhinv')
      expect(byDescription.get(backendExecutionTask!.description)?.subagent_type).toBeUndefined()
      expect(byDescription.get(frontendExecutionTask!.description)?.subagent_type).toBeUndefined()
    })


    it('should split mixed frontend/backend execution subtask into parallel category tasks', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-1',
              description: '交付网站完成度矩阵（页面、功能模块、API、数据库）并输出未完成项清单',
              dependencies: []
            }
          ]
        })
      })

      let seq = 0
      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          return {
            taskId: `checkpoint-${++seq}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: delegateInput.metadata.readyTaskIds || []
            }),
            success: true
          }
        }

        return {
          taskId: `subtask-${++seq}`,
          output: [
            'Changed files:',
            '- src/main/services/workforce/workforce-engine.ts',
            '',
            'Verification command:',
            '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
          ].join('\n'),
          success: true
        }
      })

      const result = await workforceEngine.executeWorkflow(
        '请交付网站完成度矩阵（页面、功能模块、API、数据库）和按优先级排序的未完成项清单',
        'test-session-123',
        {
          agentCode: 'haotian',
          enableRetry: false
        }
      )

      const executionTasks = result.tasks.filter(task => task.workflowPhase === 'execution')
      expect(executionTasks.length).toBeGreaterThanOrEqual(2)
      expect(executionTasks.some(task => task.assignedCategory === 'dayu')).toBe(true)
      expect(executionTasks.some(task => task.assignedCategory === 'zhinv')).toBe(true)

      const executionCalls = mockWorkerDispatcher.dispatch.mock.calls
        .map(call => call[0])
        .filter((input: any) => input.metadata?.workflowPhase === 'execution')
      expect(executionCalls.some((input: any) => input.category === 'dayu')).toBe(true)
      expect(executionCalls.some((input: any) => input.category === 'zhinv')).toBe(true)
      expect(executionCalls.every((input: any) => input.subagent_type === undefined)).toBe(true)
    })

    it('should avoid synthetic discovery/review tasks when markdown specification is explicitly referenced', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(candidate =>
        path.normalize(String(candidate)).replace(/\\/g, '/').endsWith('/tmp/workspace-a/网站规划.md')
      )
      const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true
      } as unknown as fs.Stats)
      vi.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        if (String(filePath).includes('网站规划.md')) {
          return '# 网站规划\n- 首页\n- 黑榜页\n- 红榜页'
        }
        return ''
      })

      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-1', description: '实现首页与事件列表页面', dependencies: [] }]
        })
      })

      try {
        const result = await workforceEngine.executeWorkflow(
          '请根据 网站规划.md 制作一个网站',
          'test-session-123',
          { agentCode: 'haotian', enableRetry: false }
        )

        expect(result.tasks.some(task => task.id.startsWith('stage-discovery-'))).toBe(false)
        expect(result.tasks.some(task => task.id.startsWith('stage-plan-review-'))).toBe(false)
      } finally {
        statSpy.mockRestore()
      }
    })

    it('should participate with orchestrator checkpoints for /experiments/ceshi 网站规划 prompt', async () => {
      const ceshiDir = path.resolve(process.cwd(), 'experiments/ceshi')

      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'test-session-123',
        space: { id: 'space-1', workDir: ceshiDir }
      })

      vi.spyOn(fs, 'existsSync').mockImplementation(candidate =>
        path
          .normalize(String(candidate))
          .replace(/\\/g, '/')
          .endsWith(`${path.normalize(ceshiDir).replace(/\\/g, '/')}/网站规划.md`)
      )
      const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true
      } as unknown as fs.Stats)
      vi.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        if (String(filePath).includes('网站规划.md')) {
          return '# 网站规划\n- 首页\n- 黑榜页\n- 红榜页'
        }
        return ''
      })

      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现首页与导航', dependencies: [] },
            { id: 'task-2', description: '实现后端审核API', dependencies: [] }
          ]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.orchestrationCheckpoint) {
          const readyTaskIds = Array.isArray(delegateInput.metadata?.readyTaskIds)
            ? delegateInput.metadata.readyTaskIds
            : []
          return {
            taskId: `checkpoint-${delegateInput.metadata.checkpointPhase}`,
            output: JSON.stringify({
              status: 'continue',
              approved_task_ids: readyTaskIds
            }),
            success: true
          }
        }
        return {
          taskId: `subtask-${delegateInput.description}`,
          output:
            'Changed files:\n- src/renderer/src/pages/ChatPage.tsx\n\nVerification command:\n- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts',
          success: true
        }
      })

      try {
        const result = await workforceEngine.executeWorkflow(
          '请你根据 网站规划.md 制作一个网站',
          'test-session-123',
          { agentCode: 'haotian', enableRetry: false }
        )

        expect(result.success).toBe(true)
        expect(result.orchestratorParticipation).toBe(true)
        expect(result.orchestratorCheckpoints?.some(item => item.phase === 'pre-dispatch')).toBe(true)
        expect(result.orchestratorCheckpoints?.some(item => item.phase === 'final')).toBe(true)
        expect(result.tasks.some(task => task.id.startsWith('stage-discovery-'))).toBe(false)
        expect(result.tasks.some(task => task.id.startsWith('stage-plan-review-'))).toBe(false)
      } finally {
        statSpy.mockRestore()
      }
    })

    it('should keep implementation prompt contract in read-only execution tasks', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-1',
              description: '扫描代码库定位后端相关模块',
              dependencies: [],
              subagent_type: 'qianliyan'
            },
            {
              id: 'task-2',
              description: '评估实现风险并给出建议',
              dependencies: ['task-1'],
              subagent_type: 'baize'
            }
          ]
        })
      })

      await workforceEngine.executeWorkflow(
        '只读模式下新增后端接口并在前端页面增加按钮，不要改代码',
        'test-session-123',
        {
          agentCode: 'haotian',
          enableRetry: false
        }
      )

      const delegateCalls = mockWorkerDispatcher.dispatch.mock.calls.map((call: any[]) => call[0])
      const backendExecutionCall = delegateCalls.find(input => input.category === 'dayu')
      expect(backendExecutionCall?.prompt).toContain(
        '当前工作流是只读模式：请输出可执行实现方案与验证方案，不得改代码。'
      )
      expect(backendExecutionCall?.prompt).not.toContain('EVIDENCE_PATHS / KEY_FINDINGS')
    })

    it('should resolve canonical subagent_type and category hints from plan blocks', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(path => String(path).includes('.sisyphus'))
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        [
          '# Plan',
          '- [ ] Task 1: 扫描代码结构',
          '  task(subagent_type="qianliyan")',
          '- [ ] Task 2: 快速修复小问题',
          "  task(category='tianbing')"
        ].join('\n')
      )

      await workforceEngine.executeWorkflow('执行计划 .sisyphus/plans/test-plan.md', 'test-session-123', {
        agentCode: 'haotian'
      })

      const byDescription = new Map(
        mockWorkerDispatcher.dispatch.mock.calls.map(call => [call[0].description, call[0]])
      )

      expect(byDescription.get('Task 1: 扫描代码结构')?.subagent_type).toBe('qianliyan')
      expect(byDescription.get('Task 2: 快速修复小问题')?.category).toBe('tianbing')
    })

    it('should remap explicit kuafu assignment to luban when orchestrator is haotian', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(path => String(path).includes('.sisyphus'))
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        ['# Plan', '- [ ] Task 1: 修复后端接口超时 [agent: kuafu]'].join('\n')
      )

      await workforceEngine.executeWorkflow('执行计划 .sisyphus/plans/test-plan.md', 'test-session-123', {
        agentCode: 'haotian'
      })

      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Task 1: 修复后端接口超时 [agent: kuafu]',
          subagent_type: 'luban'
        })
      )
    })

    it('should fail subtask when delegate returns empty output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-empty', description: '执行真实实现', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'empty-task',
        output: '',
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('空输出检查', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('empty-output')
    })

    it('should recover when delegate reports empty-output failure status', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-empty', description: '执行真实实现', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch
        .mockResolvedValueOnce({
          taskId: 'empty-task-1',
          output: 'Delegate task returned empty output after recovery prompt',
          success: false
        })
        .mockResolvedValueOnce({
          taskId: 'empty-task-2',
          output: 'Changed files:\n- src/main/services/workforce/workforce-engine.ts\n\nVerification command:\n- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run',
          success: true
        })

      const result = await workforceEngine.executeWorkflow('空输出恢复检查', 'test-session-123', {
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(2)
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.prompt).toContain('reason: empty-output')
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.useDynamicPrompt).toBe(false)
    })

    it('should fail subtask when delegate returns non-actionable read-only output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-impl', description: '实现网站首页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'impl-task',
        output:
          'I am unable to execute because this environment is read-only and cannot modify files.',
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('请实现网站首页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('non-actionable output')
    })

    it('should map execution tasks into diverse categories (not only dayu/zhinv)', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 't1', description: '实现数据库迁移脚本', dependencies: [] },
            { id: 't2', description: '修复测试用例并补充断言', dependencies: [] },
            { id: 't3', description: '增加CI工作流和发布脚本', dependencies: [] }
          ]
        })
      })

      await workforceEngine.executeWorkflow('按实现任务执行', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      const calls = mockWorkerDispatcher.dispatch.mock.calls.map(call => call[0])
      const executionCalls = calls.filter(input => input.metadata?.workflowPhase === 'execution')
      expect(executionCalls).toHaveLength(3)

      const categoryByDescription = new Map(
        executionCalls.map(input => [input.description as string, input.category as string | undefined])
      )

      expect(categoryByDescription.get('实现数据库迁移脚本')).toBe('guigu')
      expect(categoryByDescription.get('修复测试用例并补充断言')).toBe('tianbing')
      expect(categoryByDescription.get('增加CI工作流和发布脚本')).toBe('cangjie')
      expect(executionCalls.every(input => input.subagent_type === undefined)).toBe(true)
    })

    it('should parse both .fuxi and legacy .sisyphus plan paths from input', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(candidate => {
        const normalized = String(candidate).replace(/\\/g, '/')
        return (
          normalized.includes('/tmp/workspace-a/.fuxi/plans/new-plan.md') ||
          normalized.includes('/tmp/workspace-a/.sisyphus/plans/old-plan.md')
        )
      })
      vi.spyOn(fs, 'readFileSync').mockReturnValue('- [ ] Task 1: 实现接口')

      await workforceEngine.executeWorkflow('执行计划 .fuxi/plans/new-plan.md', 'test-session-123', {
        agentCode: 'kuafu'
      })
      await workforceEngine.executeWorkflow('执行计划 .sisyphus/plans/old-plan.md', 'test-session-123', {
        agentCode: 'kuafu'
      })

      const executionCalls = mockWorkerDispatcher.dispatch.mock.calls
        .map(call => call[0])
        .filter(input => input.description === 'Task 1: 实现接口')
      expect(executionCalls).toHaveLength(2)
    })

    it('should resolve relative plan path against session workspace directory', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'test-session-123',
        space: { id: 'space-2', workDir: '/tmp/other-project' }
      })
      vi.spyOn(fs, 'existsSync').mockImplementation(candidate =>
        path
          .normalize(String(candidate))
          .replace(/\\/g, '/')
          .includes('/tmp/other-project/.sisyphus/plans/site.md')
      )
      vi.spyOn(fs, 'readFileSync').mockReturnValue('- [ ] Task 1: 根据网站规划实现首页')

      await workforceEngine.executeWorkflow(
        '执行计划 .sisyphus/plans/site.md',
        'test-session-123',
        { agentCode: 'kuafu' }
      )

      expect(mockAdapter.sendMessage).not.toHaveBeenCalled()
      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Task 1: 根据网站规划实现首页'
        })
      )
    })

    it('should route local documentation analysis tasks to qianliyan', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-doc', description: '分析项目规划文档并提取约束', dependencies: [] }]
        })
      })

      await workforceEngine.executeWorkflow('根据项目规划文档完成实现', 'test-session-123')

      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '分析项目规划文档并提取约束',
          subagent_type: 'qianliyan'
        })
      )
    })

    it('should fail early when required referenced markdown file is missing', async () => {
      await expect(
        workforceEngine.executeWorkflow('请根据 网站规划.md 制作一个网站', 'test-session-123', {
          enableRetry: false
        })
      ).rejects.toThrow('请求依赖的 Markdown 文件不存在')

      expect(mockAdapter.sendMessage).not.toHaveBeenCalled()
      expect(mockWorkerDispatcher.dispatch).not.toHaveBeenCalled()
    })

    it('should include referenced markdown content in decomposition prompt when file exists', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(candidate =>
        path.normalize(String(candidate)).replace(/\\/g, '/').endsWith('/tmp/workspace-a/项目规划.md')
      )
      const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
        isFile: () => true
      } as unknown as fs.Stats)
      vi.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        if (String(filePath).includes('项目规划.md')) {
          return '# 项目规划\n- 目标: 落地首页、功能页与API'
        }
        return ''
      })

      try {
        await workforceEngine.executeWorkflow('请根据 项目规划.md 实现网站', 'test-session-123', {
          enableRetry: false
        })

        const sentMessages = mockAdapter.sendMessage.mock.calls[0]?.[0]
        expect(sentMessages?.[1]?.content).toContain('REFERENCED MARKDOWN CONTEXT')
        expect(sentMessages?.[1]?.content).toContain('FILE: 项目规划.md')
      } finally {
        statSpy.mockRestore()
      }
    })

    it('should not append haotian review task for decomposed workflows', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            { id: 'task-1', description: '实现首页', dependencies: [] },
            { id: 'task-2', description: '实现后端接口', dependencies: [] }
          ]
        })
      })

      const result = await workforceEngine.executeWorkflow('做一个网站', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      expect(result.tasks.find(task => task.id === 'haotian-review')).toBeUndefined()
    })

    it('should fail subtask when delegate returns status-only placeholder output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-status', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'status-task',
        output: 'Inspecting repository',
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('status-only-placeholder')
    })

    it('should fail subtask when delegate returns deciding status-only output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-status', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'status-task',
        output: 'Deciding on task organization method',
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('status-only-placeholder')
    })

    it('should fail subtask when delegate returns chinese status-only placeholder output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-status', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'status-task',
        output: '我将先探索代码库并继续分析现状。',
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('status-only-placeholder')
    })

    it('should recover once when delegate first returns status-only placeholder', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-status', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch
        .mockResolvedValueOnce({
          taskId: 'status-task-1',
          output: 'Inspecting repository',
          success: true
        })
        .mockResolvedValueOnce({
          taskId: 'status-task-2',
          output:
            'Changed files:\n- src/renderer/src/pages/ChatPage.tsx\n\nVerification command:\n- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts',
          success: true
        })

      const result = await workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(2)
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.prompt).toContain(
        'ACTIONABILITY RECOVERY DIRECTIVE'
      )
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.useDynamicPrompt).toBe(false)
    })

    it('should recover once when delegate first returns chinese status-only placeholder', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-status', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch
        .mockResolvedValueOnce({
          taskId: 'status-task-1',
          output: '让我先检查这些功能并梳理依赖关系。',
          success: true
        })
        .mockResolvedValueOnce({
          taskId: 'status-task-2',
          output:
            'Changed files:\n- src/renderer/src/pages/ChatPage.tsx\n\nVerification command:\n- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts',
          success: true
        })

      const result = await workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(2)
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.prompt).toContain(
        'ACTIONABILITY RECOVERY DIRECTIVE'
      )
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.useDynamicPrompt).toBe(false)
    })

    it('should fail fast with diagnostics when strict binding rejects fallback model', async () => {
      const previousStrict = process.env.WORKFORCE_STRICT_BINDING
      process.env.WORKFORCE_STRICT_BINDING = 'true'
      const strictEngine = new WorkforceEngine()
      try {
        mockAdapter.sendMessage.mockResolvedValue({
          content: JSON.stringify({
            subtasks: [
              {
                id: 'task-strict',
                description: '实现网站主页',
                dependencies: [],
                assignedCategory: 'dayu'
              }
            ]
          })
        })

        mockPrisma.model.findMany.mockResolvedValue([
          {
            id: 'model-2',
            provider: 'openai-compatible',
            modelName: 'gpt-4o-mini',
            apiKey: 'test-key-2',
            apiKeyRef: null,
            baseURL: null,
            config: { apiProtocol: 'responses' },
            updatedAt: new Date()
          }
        ])

        mockWorkerDispatcher.dispatch.mockResolvedValue({
          taskId: 'status-task-1',
          output: 'Inspecting repository',
          success: true
        })

        await expect(
          strictEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
        ).rejects.toThrow(/Delegate task "task-strict" returned non-actionable output/)
      } finally {
        if (previousStrict === undefined) {
          delete process.env.WORKFORCE_STRICT_BINDING
        } else {
          process.env.WORKFORCE_STRICT_BINDING = previousStrict
        }
      }
    })

    it('should validate category binding consistency before dispatch', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-binding-category',
              description: '实现网站主页',
              dependencies: [],
              assignedCategory: 'zhinv'
            }
          ]
        })
      })

      mockPrisma.categoryBinding.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.categoryCode === 'zhinv') {
          return {
            enabled: true,
            modelId: 'missing-model',
            model: null,
            temperature: null
          }
        }
        return null
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('MODEL_NOT_FOUND')

      expect(mockWorkerDispatcher.dispatch).not.toHaveBeenCalled()
    })

    it('should validate agent binding consistency before dispatch', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-binding-agent',
              description: '实现网站主页',
              dependencies: [],
              assignedAgent: 'qianliyan'
            }
          ]
        })
      })

      mockPrisma.agentBinding.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.agentCode === 'qianliyan') {
          return {
            enabled: true,
            modelId: 'agent-model-1',
            model: {
              id: 'agent-model-1',
              provider: 'openai-compatible',
              modelName: 'gpt-4o-mini',
              apiKey: null,
              apiKeyRef: null,
              baseURL: null,
              config: { apiProtocol: 'responses' }
            },
            temperature: null
          }
        }
        return null
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('MODEL_CREDENTIAL_MISSING')

      expect(mockWorkerDispatcher.dispatch).not.toHaveBeenCalled()
    })

    it('should persist runtime binding snapshot metadata on dispatched subtask', async () => {
      const workflowResult = await workforceEngine.executeWorkflow('Do workflow', 'test-session-123')

      expect(workflowResult.executions.get('task-1')?.persistedTaskId).toBe('subtask-id')

      const persistedSubtaskUpdateCall = mockPrisma.task.update.mock.calls.find(
        (call: any[]) => call?.[0]?.where?.id === 'subtask-id'
      )

      expect(persistedSubtaskUpdateCall?.[0]?.data?.metadata?.runtimeBindingSnapshot).toEqual(
        expect.objectContaining({
          assignedCategory: expect.any(String),
          workflowCategory: expect.any(String),
          workflowId: 'workflow-1',
          model: 'openai-compatible::gpt-4o-mini',
          modelSource: 'system-default',
          modelSelection: expect.objectContaining({
            modelSelectionSource: 'system-default',
            modelSelectionReason: 'system-default-hit',
            modelSelectionSummary: expect.any(String)
          }),
          concurrencyKey: expect.any(String),
          fallbackTrail: expect.any(Array)
        })
      )
    })

    it('should persist role-policy snapshot in runtime binding metadata for explicit primary agent', async () => {
      await workforceEngine.executeWorkflow('Do workflow', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      const persistedSubtaskUpdateCall = mockPrisma.task.update.mock.calls.find(
        (call: any[]) => call?.[0]?.where?.id === 'subtask-id'
      )
      const runtimeBindingSnapshot =
        persistedSubtaskUpdateCall?.[0]?.data?.metadata?.runtimeBindingSnapshot

      expect(runtimeBindingSnapshot).toEqual(
        expect.objectContaining({
          primaryAgentRolePolicy: expect.objectContaining({
            alias: 'haotian',
            canonicalAgent: 'haotian',
            canonicalRole: 'orchestration'
          })
        })
      )
    })

    it('should include evidence-gap unresolved items when execution output lacks required evidence fields', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-1', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'subtask-id',
        output: [
          'Changed files:',
          '- src/main/services/workforce/workforce-engine.ts',
          '',
          'Verification command:',
          '- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run'
        ].join('\n'),
        success: true
      })

      await workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
        agentCode: 'haotian',
        enableRetry: false
      })

      const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      const unresolvedItems = finalUpdate?.data?.metadata?.integration?.unresolvedItems || []

      expect(Array.isArray(unresolvedItems)).toBe(true)
      expect(
        unresolvedItems.some((item: string) =>
          item.includes('evidence-gap') &&
          item.includes('missing fields') &&
          item.includes('objective') &&
          item.includes('residual-risk')
        )
      ).toBe(true)
    })

    it('should apply deterministic backoff per failure class', () => {
      const timeoutDelayAttempt1 = calculateBackoffDelay(1, {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterFactor: 0,
        enableLogging: false
      })
      const timeoutDelayAttempt2 = calculateBackoffDelay(2, {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterFactor: 0,
        enableLogging: false
      })

      expect(timeoutDelayAttempt1).toBe(100)
      expect(timeoutDelayAttempt2).toBe(200)
    })

    it('should keep workflow metadata backward compatible when recovery config is provided', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              id: 'task-recovery',
              description: '修复失败任务并验证',
              dependencies: [],
              assignedAgent: 'luban'
            }
          ]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async () => ({
        taskId: 'subtask-recovery',
        output: [
          'objective: retry failed command with fixed dependency',
          'changes: src/main/services/workforce/workforce-engine.ts',
          'validation: pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run',
          'residual-risk: none'
        ].join('\n'),
        success: true,
        runId: 'run-recovery',
        model: 'openai-compatible::gpt-4o-mini',
        modelSource: 'system-default'
      }))

      await workforceEngine.executeWorkflow('修复失败任务并继续执行', 'test-session-123', {
        agentCode: 'haotian',
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
      } as any)

      const workflowUpdates = mockPrisma.task.update.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: Record<string, any>) => call?.where?.id === 'workflow-1')

      const finalUpdate = workflowUpdates.at(-1)
      expect(finalUpdate?.data?.metadata?.retryState).toBeDefined()
      expect(finalUpdate?.data?.metadata?.continuationSnapshot?.status).toBe('completed')
      expect(finalUpdate?.data?.metadata?.integration).toBeDefined()
      expect(finalUpdate?.data?.metadata?.recoveryState).toBeDefined()
      expect(finalUpdate?.data?.metadata?.recoveryState?.recoveredTasks).toEqual([])
    })

    it('should recover failed subtask through autonomous recovery flow and continue workflow', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-recovery-flow', description: '修复失败任务', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.recoveryContext) {
          return {
            taskId: 'recovery-task-1',
            output: [
              'objective: retry task with repaired settings',
              'changes: src/main/services/workforce/workforce-engine.ts',
              'validation: pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run',
              'residual-risk: low'
            ].join('\n'),
            success: true,
            runId: 'run-recovery-1',
            model: 'openai-compatible::gpt-4o-mini',
            modelSource: 'system-default'
          }
        }

        throw new Error('network timeout while executing task')
      })

      const result = await workforceEngine.executeWorkflow('修复失败任务并继续执行', 'test-session-123', {
        agentCode: 'haotian',
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
      } as any)

      expect(result.success).toBe(true)
      const recoveryCall = mockWorkerDispatcher.dispatch.mock.calls.find(
        (call: any[]) => call?.[0]?.metadata?.recoveryContext
      )?.[0]
      expect(recoveryCall?.metadata?.recoveryContext).toEqual(
        expect.objectContaining({
          failureClass: 'transient',
          orchestratorOwner: 'haotian'
        })
      )
      expect(recoveryCall?.metadata?.primaryAgentRoleAlias).toBe('haotian')
      expect(recoveryCall?.metadata?.workflowStage).toBe('dispatch')

      const workflowUpdates = mockPrisma.task.update.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: Record<string, any>) => call?.where?.id === 'workflow-1')

      const finalUpdate = workflowUpdates.at(-1)
      expect(finalUpdate?.data?.metadata?.recoveryState?.recoveredTasks).toContain('task-recovery-flow')
      expect(
        finalUpdate?.data?.metadata?.recoveryState?.history?.some(
          (item: any) =>
            item.taskId === 'task-recovery-flow' &&
            item.status === 'succeeded' &&
            item.phase === 'validate' &&
            item.validatorResult === 'passed'
        )
      ).toBe(true)
    })

    it('should fail fast and persist terminal diagnostic for non-recoverable permission errors', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-permission', description: '修改受限资源', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockRejectedValue(new Error('403 forbidden for this operation'))

      await expect(
        workforceEngine.executeWorkflow('修复受限任务', 'test-session-123', {
          agentCode: 'haotian',
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
        } as any)
      ).rejects.toThrow('403 forbidden')

      const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      expect(finalUpdate?.data?.metadata?.recoveryState?.unrecoveredTasks).toContain('task-permission')
      expect(finalUpdate?.data?.metadata?.recoveryState?.terminalDiagnostics?.[0]).toEqual(
        expect.objectContaining({
          taskId: 'task-permission',
          failureClass: 'permission'
        })
      )
      expect(
        finalUpdate?.data?.metadata?.recoveryState?.history?.some(
          (item: any) => item.taskId === 'task-permission' && item.status === 'aborted'
        )
      ).toBe(true)
    })

    it('should disable autonomous recovery and fail fast when recovery mode is off', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-disabled-recovery', description: '关闭恢复后失败', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockRejectedValue(new Error('network timeout while executing task'))

      await expect(
        workforceEngine.executeWorkflow('禁用恢复并执行', 'test-session-123', {
          agentCode: 'haotian',
          enableRetry: false,
          recoveryConfig: {
            enabled: false,
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
        } as any)
      ).rejects.toThrow('network timeout')

      const recoveryCall = mockWorkerDispatcher.dispatch.mock.calls.find(
        (call: any[]) => call?.[0]?.metadata?.recoveryContext
      )
      expect(recoveryCall).toBeUndefined()

      const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      expect(finalUpdate?.data?.metadata?.recoveryMode?.enabled).toBe(false)
      expect(finalUpdate?.data?.metadata?.recoveryState?.unrecoveredTasks).toContain(
        'task-disabled-recovery'
      )
    })

    it('should persist in-progress recovery phase snapshots for restart resume', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-resume', description: '修复并恢复执行', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockImplementation(async (delegateInput: any) => {
        if (delegateInput.metadata?.recoveryContext) {
          return {
            taskId: 'task-resume-recovery',
            output: [
              'objective: recover workflow execution',
              'changes: src/main/services/workforce/workforce-engine.ts',
              'validation: pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts --run',
              'residual-risk: low'
            ].join('\n'),
            success: true,
            runId: 'run-recovery-resume',
            model: 'openai-compatible::gpt-4o-mini',
            modelSource: 'system-default'
          }
        }

        throw new Error('network timeout while executing task')
      })

      await workforceEngine.executeWorkflow('恢复执行流程', 'test-session-123', {
        agentCode: 'haotian',
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
      } as any)

      const workflowUpdates = mockPrisma.task.update.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: Record<string, any>) => call?.where?.id === 'workflow-1')

      const phases = workflowUpdates
        .map((call: Record<string, any>) => call?.data?.metadata?.recoveryState?.phase)
        .filter((phase: unknown): phase is string => typeof phase === 'string')

      expect(phases).toContain('plan')
      expect(phases).toContain('fix')
      expect(phases).toContain('validate')
    })

    it('should fail fast when fallback policy has no available recovery route', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-no-route', description: '无可用恢复路由', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockRejectedValue(new Error('network timeout while executing task'))

      await expect(
        workforceEngine.executeWorkflow('触发无路由恢复', 'test-session-123', {
          agentCode: 'haotian',
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
            fallbackPolicy: 'model-first'
          }
        } as any)
      ).rejects.toThrow('network timeout')

      const workflowUpdates = mockPrisma.task.update.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: Record<string, any>) => call?.where?.id === 'workflow-1')
      const finalUpdate = workflowUpdates.at(-1)
      expect(finalUpdate?.data?.metadata?.recoveryState?.unrecoveredTasks).toContain('task-no-route')
      expect(
        finalUpdate?.data?.metadata?.recoveryState?.terminalDiagnostics?.some((item: any) => {
          const reason = String(item.reason || '')
          return (
            reason.includes('No recoverable route available') ||
            reason.includes('No compatible model token available')
          )
        })
      ).toBe(true)
    })

    it('should persist retry state snapshot for restart recovery', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-retry', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce({ taskId: 'retry-task', output: 'done', success: true })

      const result = await workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
        enableRetry: true,
        retryConfig: { baseDelayMs: 1, maxDelayMs: 2, jitterFactor: 0 }
      })

      const retryState = result.retryStates?.get('task-retry')
      expect(retryState?.attemptNumber).toBeGreaterThanOrEqual(2)
      expect(retryState?.status).toBe('succeeded')
      expect(retryState?.errors[0]?.errorType).toBe(RetryableErrorType.NETWORK_ERROR)

      const workflowUpdates = mockPrisma.task.update.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: Record<string, any>) => call?.where?.id === 'workflow-1')

      const runningRetrySnapshot = workflowUpdates.find(
        (call: Record<string, any>) =>
          call?.data?.metadata?.continuationSnapshot?.status === 'running' &&
          call?.data?.metadata?.retryState?.tasks?.['task-retry']
      )
      expect(runningRetrySnapshot).toBeDefined()

      const finalUpdate = workflowUpdates.at(-1)
      const persistedRetryState = finalUpdate?.data?.metadata?.retryState?.tasks?.['task-retry']
      expect(persistedRetryState?.attemptNumber).toBeGreaterThanOrEqual(2)
      expect(persistedRetryState?.errors?.[0]?.errorType).toBe(RetryableErrorType.NETWORK_ERROR)
      expect(finalUpdate?.data?.metadata?.retryStats?.tasksRetried).toBeGreaterThanOrEqual(1)

    })

    it('should persist failure continuation snapshot for recovery consumers', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-failed', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockRejectedValue(new Error('network timeout'))

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
          enableRetry: false
        })
      ).rejects.toThrow('network timeout')

      const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
      expect(finalUpdate?.data?.metadata?.correlation?.workflowId).toBe('workflow-1')
      expect(Array.isArray(finalUpdate?.data?.metadata?.timeline?.workflow)).toBe(true)
      expect(finalUpdate?.data?.metadata?.retryState).toBeDefined()
      expect(finalUpdate?.data?.metadata?.continuationSnapshot?.status).toBe('failed')
      expect(finalUpdate?.data?.metadata?.continuationSnapshot?.resumable).toBe(false)
    })

    it('should recover once when delegate first returns capability-limited output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-capability', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch
        .mockResolvedValueOnce({
          taskId: 'capability-task-1',
          output: 'I cannot modify files in this environment.',
          success: true
        })
        .mockResolvedValueOnce({
          taskId: 'capability-task-2',
          output:
            'Changed files:\n- src/renderer/src/pages/ChatPage.tsx\n\nVerification command:\n- pnpm vitest tests/unit/services/workforce/workforce-engine.test.ts',
          success: true
        })

      const result = await workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
        enableRetry: false
      })

      expect(result.success).toBe(true)
      expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledTimes(2)
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.prompt).toContain(
        'reason: capability-limited-output'
      )
      expect(mockWorkerDispatcher.dispatch.mock.calls[1]?.[0]?.useDynamicPrompt).toBe(false)
    })

    it('should fail subtask when delegate returns markdown-wrapped status placeholder', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-status', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'status-task',
        output: '**Inspecting repository structure**',
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('status-only-placeholder')
    })

    it('should fail subtask when delegate returns instruction-conflict meta output', async () => {
      mockAdapter.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          subtasks: [{ id: 'task-meta', description: '实现网站主页', dependencies: [] }]
        })
      })

      mockWorkerDispatcher.dispatch.mockResolvedValue({
        taskId: 'meta-task',
        output:
          "Resolving conflicting instructions for initial actions. I'm wrestling with instructions that say to launch 3+ tools simultaneously in the first action.",
        success: true
      })

      await expect(
        workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', { enableRetry: false })
      ).rejects.toThrow('meta-process-output')
    })

    it('should cancel workflow immediately when abort signal is already requested', async () => {
      const controller = new AbortController()
      controller.abort()

      await expect(
        workforceEngine.executeWorkflow('Cancelled workflow', 'test-session-123', {
          abortSignal: controller.signal
        })
      ).rejects.toThrow('Workflow cancelled by user')

      expect(mockWorkerDispatcher.dispatch).not.toHaveBeenCalled()
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'workflow-1' },
          data: expect.objectContaining({
            status: 'cancelled',
            output: 'Cancelled by user'
          })
        })
      )
    })
  })
})

describe('WorkforceEngine trace propagation', () => {
  let workforceEngine: WorkforceEngine

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.WORKFORCE_STRICT_BINDING
    workforceEngine = new WorkforceEngine()
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => '')
    mockBoulderService.getState.mockResolvedValue({})
    mockBoulderService.isSessionTracked.mockResolvedValue(false)
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'test-session-123',
      space: { id: 'space-1', workDir: '/tmp/workspace-a' }
    })
    mockPrisma.task.create.mockResolvedValue({ id: 'workflow-1', type: 'workflow', metadata: {} })
    mockPrisma.task.update.mockResolvedValue({ id: 'workflow-1' })
    mockPrisma.task.findUnique.mockResolvedValue(null)
    mockPrisma.model.findMany.mockResolvedValue([
      {
        id: 'model-1',
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20240620',
        apiKey: 'test-key',
        apiKeyRef: null,
        baseURL: null,
        config: {}
      }
    ])
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ key: 'defaultModelId', value: 'model-1' })
    mockPrisma.model.findUnique.mockResolvedValue({
      id: 'model-1',
      provider: 'anthropic',
      modelName: 'claude-3-5-sonnet-20240620',
      apiKey: 'test-key',
      baseURL: null,
      config: {},
      apiKeyRef: null,
      updatedAt: new Date()
    })
    mockPrisma.agentBinding.findUnique.mockResolvedValue(null)
    mockPrisma.categoryBinding.findUnique.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('propagates traceId to workflow metadata and delegated subtasks', async () => {
    mockAdapter.sendMessage.mockResolvedValue({
      content: JSON.stringify({
        subtasks: [{ id: 'task-trace', description: '实现网站主页', dependencies: [] }]
      })
    })

    mockWorkerDispatcher.dispatch.mockResolvedValue({
      taskId: 'subtask-trace-1',
      output: 'Traceable workflow output',
      success: true,
      runId: 'run-trace-1',
      model: 'openai-compatible::gpt-4o-mini',
      modelSource: 'system-default'
    })

    const result = await workforceEngine.executeWorkflow('实现网站主页', 'test-session-123', {
      enableRetry: false,
      traceContext: {
        traceId: 'tr-workflow-001',
        startedAt: '2026-03-06T00:00:00.000Z'
      }
    })

    expect(result.success).toBe(true)
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            traceId: 'tr-workflow-001'
          })
        })
      })
    )
    expect(mockWorkerDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          traceId: 'tr-workflow-001'
        })
      })
    )

    const finalUpdate = mockPrisma.task.update.mock.calls.at(-1)?.[0]
    expect(finalUpdate?.data?.metadata?.traceId).toBe('tr-workflow-001')
    expect(finalUpdate?.data?.metadata?.correlation?.traceId).toBe('tr-workflow-001')
  })
})

import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn()
}))

vi.mock('@/main/services/llm/model-selection.service', () => ({
  ModelSelectionService: {
    getInstance: () => ({
      resolveModelSelection: vi.fn()
    })
  }
}))

vi.mock('@/main/services/llm/cost-tracker', () => ({
  costTracker: {
    trackUsage: vi.fn()
  }
}))

vi.mock('@/main/services/tools/tool-execution.service', () => ({
  toolExecutionService: {
    getToolDefinitions: vi.fn().mockReturnValue([]),
    withAllowedTools: vi.fn()
  }
}))

vi.mock('@/main/services/delegate/agents', () => ({
  getAgentPromptByCode: vi.fn()
}))

vi.mock('@/main/services/delegate/tool-allowlist', () => ({
  resolveScopedRuntimeToolNames: vi.fn()
}))

vi.mock('@/main/services/hooks', () => ({
  hookManager: {
    emitMessageCreate: vi.fn()
  }
}))

describe('message-execution.service routed paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('maps routed delegate result to delegate execution metadata', async () => {
    const { executeMessage } = await import('../../../../src/main/services/message/message-execution.service')

    const stream = {
      signal: new AbortController().signal,
      wasAborted: false,
      sendDone: vi.fn()
    }

    const result = await executeMessage({
      prisma: {} as any,
      router: {
        route: vi.fn().mockResolvedValue({ taskId: 'task-1', output: 'delegated output' })
      } as any,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      },
      runtimeContext: {
        input: { sessionId: 'session-1', content: 'delegate this' },
        resolvedContent: 'delegate this',
        strategy: 'delegate',
        workspaceDir: '/tmp/workspace',
        selectedDefinition: { code: 'haotian', defaultStrategy: 'workforce' },
        initialAssistantMetadata: { agentCode: 'haotian' }
      } as any,
      stream: stream as any
    })

    expect(stream.sendDone).toHaveBeenCalledWith('delegated output')
    expect(result).toEqual({
      assistantContent: 'delegated output',
      assistantMetadata: {
        agentCode: 'haotian',
        routeStrategy: 'delegate',
        executionPath: 'delegate',
        skillModelOverride: null,
        skillToolScopeCount: null
      }
    })
  })

  test('maps routed workforce result to workforce execution metadata', async () => {
    const { executeMessage } = await import('../../../../src/main/services/message/message-execution.service')

    const stream = {
      signal: new AbortController().signal,
      wasAborted: false,
      sendDone: vi.fn()
    }

    const result = await executeMessage({
      prisma: {} as any,
      router: {
        route: vi.fn().mockResolvedValue({
          workflowId: 'workflow-1',
          tasks: [
            {
              id: 'wf-task-1',
              description: 'workflow output task',
              assignedAgent: 'kuafu'
            }
          ],
          executions: new Map([
            ['wf-task-1', { model: 'test-workflow-model' }]
          ]),
          results: new Map([
            ['wf-task-1', 'workflow output']
          ]),
          orchestratorParticipation: true,
          orchestratorCheckpoints: []
        })
      } as any,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      },
      runtimeContext: {
        input: { sessionId: 'session-2', content: 'orchestrate this' },
        resolvedContent: 'orchestrate this',
        strategy: 'workforce',
        workspaceDir: '/tmp/workspace',
        selectedDefinition: { code: 'kuafu', defaultStrategy: 'workforce' },
        initialAssistantMetadata: { agentCode: 'kuafu' }
      } as any,
      stream: stream as any
    })

    expect(stream.sendDone).toHaveBeenCalledWith(result.assistantContent)
    expect(result.assistantContent).toContain('工作流执行完成')
    expect(result.assistantContent).toContain('workflow output')
    expect(result.assistantMetadata).toEqual({
      agentCode: 'kuafu',
      routeStrategy: 'workforce',
      executionPath: 'workforce',
      skillModelOverride: null,
      skillToolScopeCount: null
    })
  })
})

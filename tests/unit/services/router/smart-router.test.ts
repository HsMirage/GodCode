import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SmartRouter, RoutingRule } from '@/main/services/router/smart-router'
import { DelegateEngine } from '@/main/services/delegate'
import { WorkforceEngine } from '@/main/services/workforce'

// Mock dependencies
const mockDelegateEngine = {
  delegateTask: vi.fn()
}

vi.mock('@/main/services/delegate', () => ({
  DelegateEngine: vi.fn(() => mockDelegateEngine)
}))

const mockWorkforceEngine = {
  executeWorkflow: vi.fn()
}

vi.mock('@/main/services/workforce', () => ({
  WorkforceEngine: vi.fn(() => mockWorkforceEngine)
}))

describe('SmartRouter', () => {
  let router: SmartRouter

  beforeEach(() => {
    vi.clearAllMocks()
    router = new SmartRouter()

    // Default mocks
    mockDelegateEngine.delegateTask.mockResolvedValue({
      taskId: 'delegate-id',
      output: 'Delegate result',
      success: true
    })

    mockWorkforceEngine.executeWorkflow.mockResolvedValue({
      workflowId: 'workforce-id',
      tasks: [],
      results: new Map(),
      executions: new Map(),
      success: true
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('analyzeTask', () => {
    it('should route frontend tasks to delegate', () => {
      expect(router.analyzeTask('实现前端页面')).toBe('delegate')
      expect(router.analyzeTask('优化UI组件')).toBe('delegate')
    })

    it('should route backend tasks to delegate', () => {
      expect(router.analyzeTask('设计数据库schema')).toBe('delegate')
      expect(router.analyzeTask('开发API接口')).toBe('delegate')
    })

    it('should route complex creation tasks to workforce', () => {
      expect(router.analyzeTask('创建用户注册功能')).toBe('workforce')
      expect(router.analyzeTask('实现完整的支付流程')).toBe('workforce')
    })

    it('should route explicit workforce requests to workforce', () => {
      expect(router.analyzeTask('请使用workforce来编排这个任务')).toBe('workforce')
    })

    it('should route high complexity requests to workforce by score', () => {
      expect(router.analyzeTask('请分步重构这个系统，涉及跨模块和多模型协同治理')).toBe('workforce')
    })

    it('should route general tasks to direct by default', () => {
      expect(router.analyzeTask('What is the weather?')).toBe('direct')
    })
  })

  describe('selectStrategy', () => {
    it('should validate and return valid strategies', () => {
      expect(router.selectStrategy('delegate')).toBe('delegate')
      expect(router.selectStrategy('workforce')).toBe('workforce')
      expect(router.selectStrategy('direct')).toBe('direct')
    })

    it('should fallback to direct for invalid strategies', () => {
      expect(router.selectStrategy('invalid')).toBe('direct')
    })
  })

  describe('route', () => {
    it('should route primary agentCode through workforce even when input matches delegate rules', async () => {
      await router.route('分析模块边界', {
        sessionId: 'session-1',
        agentCode: 'haotian'
      })

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
        '分析模块边界',
        'session-1',
        expect.objectContaining({ agentCode: 'haotian' })
      )
      expect(mockDelegateEngine.delegateTask).not.toHaveBeenCalled()
    })

    it('should keep subagent agentCode on delegate route', async () => {
      await router.route('分析模块边界', {
        sessionId: 'session-1',
        agentCode: 'qianliyan'
      })

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          subagent_type: 'qianliyan',
          metadata: expect.objectContaining({
            routing: expect.objectContaining({
              rationale: expect.arrayContaining([expect.stringContaining('capability boundary matched subagent')])
            })
          })
        })
      )
    })

    it('should execute delegate strategy correctly', async () => {
      const input = '实现前端页面'
      const context = { prompt: 'Specific prompt', parentTaskId: 'parent-1' }

      await router.route(input, context)

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: input,
          prompt: expect.stringContaining('### 任务卡'),
          category: 'zhinv',
          parentTaskId: 'parent-1',
          metadata: expect.objectContaining({
            routing: expect.objectContaining({
              strategy: 'delegate',
              complexityScore: expect.any(Number),
              semanticScores: expect.objectContaining({
                riskScore: expect.any(Number),
                infoSufficiencyScore: expect.any(Number),
                approvalScore: expect.any(Number),
                workforceFitScore: expect.any(Number)
              }),
              rationale: expect.any(Array)
            }),
            taskTemplate: expect.anything(),
            taskBrief: expect.objectContaining({
              goal: expect.any(String),
              acceptanceCriteria: expect.any(Array)
            })
          })
        })
      )
      expect(mockDelegateEngine.delegateTask.mock.calls[0]?.[0]?.prompt).toContain(context.prompt)
    })

    it('should execute workforce strategy correctly', async () => {
      const input = '创建用户注册功能'

      await router.route(input)

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
        input,
        expect.objectContaining({
          category: 'dayu',
          taskBrief: expect.objectContaining({
            strategy: 'workforce',
            acceptanceCriteria: expect.any(Array)
          }),
          routingContext: expect.objectContaining({
            strategy: 'workforce',
            complexityScore: expect.any(Number),
            semanticScores: expect.objectContaining({
              riskScore: expect.any(Number),
              infoSufficiencyScore: expect.any(Number),
              approvalScore: expect.any(Number),
              workforceFitScore: expect.any(Number)
            }),
            rationale: expect.any(Array),
            taskBriefGenerated: true
          })
        })
      )
    })

    it('should prioritize explicit primary agent over rule-based workforce routing', async () => {
      const input = '创建用户注册功能'

      await router.route(input, {
        sessionId: 'session-1',
        agentCode: 'haotian'
      })

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
        input,
        'session-1',
        expect.objectContaining({
          agentCode: 'haotian'
        })
      )
      expect(mockDelegateEngine.delegateTask).not.toHaveBeenCalled()
    })

    it('should propagate abort signal to workforce strategy', async () => {
      const input = '创建用户注册功能'
      const controller = new AbortController()

      await router.route(input, { sessionId: 'session-1', abortSignal: controller.signal })

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
        input,
        'session-1',
        expect.objectContaining({ abortSignal: controller.signal })
      )
    })

    it('should execute direct strategy correctly', async () => {
      const result = await router.route('unmatched input')

      expect(result).toEqual({
        success: true,
        output: 'unmatched input',
        strategy: 'direct'
      })

      expect(mockDelegateEngine.delegateTask).not.toHaveBeenCalled()
      expect(mockWorkforceEngine.executeWorkflow).not.toHaveBeenCalled()
    })
  })

  describe('custom rules', () => {
    it('should respect custom rules passed to constructor', () => {
      const customRules: RoutingRule[] = [
        {
          pattern: /custom/,
          strategy: 'workforce',
          category: 'custom-cat'
        }
      ]

      const customRouter = new SmartRouter(customRules)

      expect(customRouter.analyzeTask('custom task')).toBe('workforce')
    })

    it('should force workforce when context requires it', async () => {
      await router.route('any input', { forceWorkforce: true, sessionId: 'session-1' })

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
        'any input',
        'session-1',
        expect.objectContaining({
          category: 'dayu',
          routingContext: expect.objectContaining({
            strategy: 'workforce',
            complexityScore: 1
          })
        })
      )
    })

    it('should override rule routing when semantic scores indicate orchestration risk', () => {
      expect(router.analyzeTask('请分步执行数据库迁移、修改配置并运行 bash 验证')).toBe('workforce')
    })

    it('should route vague but complex requests to clarification delegate', async () => {
      await router.route('跨模块整体优化这个系统，但我还没给文件和日志，先帮我判断怎么拆')

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          subagent_type: 'chongming',
          metadata: expect.objectContaining({
            routing: expect.objectContaining({
              rationale: expect.arrayContaining([
                expect.stringContaining('information sufficiency score'),
                expect.stringContaining('semantic scores =>')
              ])
            })
          })
        })
      )
    })

    it('should attach matched task template to routing metadata and task brief', async () => {
      await router.route('请修复登录 bug，相关文件 src/main/auth.ts')

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            taskTemplate: expect.objectContaining({
              key: 'bug_fix',
              label: 'Bug 修复任务'
            }),
            taskBrief: expect.objectContaining({
              templateKey: 'bug_fix',
              templateLabel: 'Bug 修复任务'
            })
          })
        })
      )
    })
  })
})

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
    it('should execute delegate strategy correctly', async () => {
      const input = '实现前端页面'
      const context = { prompt: 'Specific prompt', parentTaskId: 'parent-1' }

      await router.route(input, context)

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: input,
          prompt: context.prompt,
          category: 'zhinv',
          parentTaskId: 'parent-1',
          metadata: expect.objectContaining({
            routing: expect.objectContaining({
              strategy: 'delegate',
              complexityScore: expect.any(Number),
              rationale: expect.any(Array)
            })
          })
        })
      )
    })

    it('should execute workforce strategy correctly', async () => {
      const input = '创建用户注册功能'

      await router.route(input)

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(
        input,
        expect.objectContaining({
          category: 'dayu',
          routingContext: expect.objectContaining({
            strategy: 'workforce',
            complexityScore: expect.any(Number),
            rationale: expect.any(Array)
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

      expect(mockDelegateEngine.delegateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          subagent_type: 'haotian'
        })
      )
      expect(mockWorkforceEngine.executeWorkflow).not.toHaveBeenCalled()
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
  })
})

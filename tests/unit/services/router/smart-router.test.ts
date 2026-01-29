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

    it('should route general tasks to delegate by default', () => {
      expect(router.analyzeTask('What is the weather?')).toBe('delegate')
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
          category: 'visual-engineering',
          parentTaskId: 'parent-1'
        })
      )
    })

    it('should execute workforce strategy correctly', async () => {
      const input = '创建用户注册功能'

      await router.route(input)

      expect(mockWorkforceEngine.executeWorkflow).toHaveBeenCalledWith(input, 'unspecified-high')
    })

    it('should execute direct strategy correctly', async () => {
      // Create router with custom rule that forces direct strategy
      const customRouter = new SmartRouter([{ pattern: /test/, strategy: 'direct' }])

      const result = await customRouter.route('test input')

      expect(result).toEqual({
        success: true,
        output: 'test input',
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
  })
})

import { DelegateEngine, type DelegateTaskResult } from '../delegate'
import { WorkforceEngine, type WorkflowResult } from '../workforce'
import {
  resolveModelWithFallback,
  DEFAULT_FALLBACK_CHAINS,
  type ModelResolutionResult,
  type FallbackEntry
} from '../llm/model-resolver'
import { providerCacheService } from '../provider-cache.service'

export interface RouteContext {
  prompt?: string
  parentTaskId?: string
}

export interface DirectRouteResult {
  success: true
  output: string
  strategy: 'direct'
}

export type RouteResult = DelegateTaskResult | WorkflowResult | DirectRouteResult

export interface RoutingRule {
  pattern: RegExp
  strategy: 'delegate' | 'workforce' | 'direct'
  category?: string
  subagent?: string
  model?: string
}

const DEFAULT_RULES: RoutingRule[] = [
  {
    pattern: /前端|UI|页面|组件/i,
    strategy: 'delegate',
    category: 'visual-engineering',
    model: 'gemini'
  },
  {
    pattern: /后端|API|数据库/i,
    strategy: 'delegate',
    model: 'gpt-4'
  },
  {
    pattern: /架构|设计/i,
    strategy: 'delegate',
    subagent: 'oracle',
    model: 'claude-opus'
  },
  {
    pattern: /创建|开发|实现/i,
    strategy: 'workforce'
  },
  {
    pattern: /.*/i,
    strategy: 'delegate',
    category: 'quick'
  }
]

export class SmartRouter {
  private delegateEngine = new DelegateEngine()
  private workforceEngine = new WorkforceEngine()
  private rules: RoutingRule[]

  constructor(rules: RoutingRule[] = DEFAULT_RULES) {
    this.rules = rules
  }

  analyzeTask(input: string): string {
    return this.findRule(input).strategy
  }

  selectStrategy(taskType: string): 'delegate' | 'workforce' | 'direct' {
    if (taskType === 'delegate' || taskType === 'workforce' || taskType === 'direct') {
      return taskType
    }

    return 'direct'
  }

  async route(input: string, context?: RouteContext): Promise<RouteResult> {
    const rule = this.findRule(input)
    const strategy = rule.strategy

    if (strategy === 'delegate') {
      const resolved = this.resolveModel(rule.category, rule.model)
      return await this.delegateEngine.delegateTask({
        description: input,
        prompt: context?.prompt ?? input,
        category: rule.category,
        subagent_type: rule.subagent,
        parentTaskId: context?.parentTaskId,
        model: resolved?.model
      })
    }

    if (strategy === 'workforce') {
      return await this.workforceEngine.executeWorkflow(input, rule.category ?? 'unspecified-high')
    }

    return {
      success: true,
      output: input,
      strategy: 'direct'
    }
  }

  private findRule(input: string): RoutingRule {
    return (
      this.rules.find(rule => rule.pattern.test(input)) ?? {
        pattern: /.*/,
        strategy: 'direct'
      }
    )
  }

  private resolveModel(category?: string, userModel?: string): ModelResolutionResult | null {
    const availableModels = providerCacheService.getAvailableModels()

    const toFallbackChain = (
      chain: readonly { readonly model: string; readonly providers: readonly string[] }[]
    ): FallbackEntry[] => chain.map(e => ({ model: e.model, providers: [...e.providers] }))

    let fallbackChain: FallbackEntry[] = toFallbackChain(DEFAULT_FALLBACK_CHAINS.coding)

    if (category === 'visual-engineering') {
      fallbackChain = toFallbackChain(DEFAULT_FALLBACK_CHAINS.visual)
    } else if (category === 'quick') {
      fallbackChain = toFallbackChain(DEFAULT_FALLBACK_CHAINS.quick)
    } else if (category === 'ultrabrain' || category === 'artistry') {
      fallbackChain = toFallbackChain(DEFAULT_FALLBACK_CHAINS.orchestrator)
    } else if (category === 'unspecified-low' || category === 'unspecified-high') {
      fallbackChain = toFallbackChain(DEFAULT_FALLBACK_CHAINS.coding)
    }

    return resolveModelWithFallback({
      userModel,
      fallbackChain,
      availableModels
    })
  }
}

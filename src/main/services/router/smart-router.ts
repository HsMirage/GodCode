import { DelegateEngine, type DelegateTaskResult } from '../delegate'
import { WorkforceEngine, type WorkflowResult } from '../workforce'

export interface RouteContext {
  sessionId?: string
  prompt?: string
  parentTaskId?: string
  /** Selected dialog agent code (e.g. "haotian") */
  agentCode?: string
  /** Force workforce route from caller */
  forceWorkforce?: boolean
  /** Abort signal propagated from current UI request */
  abortSignal?: AbortSignal
}

export interface DirectRouteResult {
  success: true
  output: string
  strategy: 'direct'
}

export type RouteStrategy = 'delegate' | 'workforce' | 'direct'
export type RouteResult = DelegateTaskResult | WorkflowResult | DirectRouteResult

export interface RoutingRule {
  pattern: RegExp
  strategy: RouteStrategy
  category?: string
  subagent?: string
}

interface RouteDecision {
  strategy: RouteStrategy
  category?: string
  subagent?: string
  complexityScore: number
  rationale: string[]
}

const DEFAULT_RULES: RoutingRule[] = [
  {
    pattern: /前端|UI|页面|组件/i,
    strategy: 'delegate',
    category: 'zhinv'
  },
  {
    pattern: /后端|API|数据库/i,
    strategy: 'delegate'
  },
  {
    pattern: /架构|设计/i,
    strategy: 'delegate',
    subagent: 'baize'
  },
  {
    pattern: /创建|开发|实现/i,
    strategy: 'workforce'
  }
]

const EXPLICIT_WORKFORCE_PATTERN = /(请使用?\s*workforce|走\s*workforce|多agent|多\s*agent|workflow|工作流|编排|orchestrate)/i
const EXPLICIT_DELEGATE_PATTERN = /(请使用?\s*delegate|走\s*delegate|子代理|subagent|delegate)/i
const COMPLEXITY_HINTS = [
  /重构|架构|系统设计|端到端|e2e|复杂|全链路|并行|协同|调度|恢复|一致性|治理/i,
  /分解|拆分|规划|plan|分步|阶段|跨模块|跨文件|跨服务|多模型|fallback|strict binding/i
]
const LOW_COMPLEXITY_HINTS = [/解释|是什么|示例|语法|翻译|润色|weather|hello/i]

export class SmartRouter {
  private delegateEngine = new DelegateEngine()
  private workforceEngine = new WorkforceEngine()
  private rules: RoutingRule[]

  constructor(rules: RoutingRule[] = DEFAULT_RULES) {
    this.rules = rules
  }

  analyzeTask(input: string, context?: RouteContext): RouteStrategy {
    return this.resolveDecision(input, context).strategy
  }

  selectStrategy(taskType: string): RouteStrategy {
    if (taskType === 'delegate' || taskType === 'workforce' || taskType === 'direct') {
      return taskType
    }

    return 'direct'
  }

  async route(input: string, context?: RouteContext): Promise<RouteResult> {
    const decision = this.resolveDecision(input, context)

    if (decision.strategy === 'delegate') {
      const selectedSubagent = decision.subagent ?? context?.agentCode
      return await this.delegateEngine.delegateTask({
        sessionId: context?.sessionId,
        description: input,
        prompt: context?.prompt ?? input,
        category: decision.category,
        subagent_type: selectedSubagent,
        parentTaskId: context?.parentTaskId,
        abortSignal: context?.abortSignal,
        metadata: {
          routing: {
            strategy: decision.strategy,
            complexityScore: decision.complexityScore,
            rationale: decision.rationale
          }
        }
      })
    }

    if (decision.strategy === 'workforce') {
      const workflowOptions = {
        category: decision.category ?? 'dayu',
        agentCode: context?.agentCode,
        abortSignal: context?.abortSignal,
        routingContext: {
          strategy: decision.strategy,
          complexityScore: decision.complexityScore,
          rationale: decision.rationale
        }
      }
      return context?.sessionId
        ? await this.workforceEngine.executeWorkflow(input, context.sessionId, workflowOptions)
        : await this.workforceEngine.executeWorkflow(input, workflowOptions)
    }

    return {
      success: true,
      output: input,
      strategy: 'direct'
    }
  }

  private resolveDecision(input: string, context?: RouteContext): RouteDecision {
    const rationale: string[] = []

    if (context?.forceWorkforce) {
      rationale.push('forceWorkforce context flag is enabled')
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: 1,
        rationale
      }
    }

    if (EXPLICIT_WORKFORCE_PATTERN.test(input)) {
      rationale.push('explicit instruction requests workforce orchestration')
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: 1,
        rationale
      }
    }

    if (EXPLICIT_DELEGATE_PATTERN.test(input)) {
      rationale.push('explicit instruction requests delegate execution')
      return {
        strategy: 'delegate',
        category: 'dayu',
        complexityScore: 0.6,
        rationale
      }
    }

    if (context?.agentCode?.trim()) {
      rationale.push('agentCode in context requires delegate route')
      return {
        strategy: 'delegate',
        subagent: context.agentCode.trim(),
        complexityScore: 0.55,
        rationale
      }
    }

    const matchedRule = this.findRule(input)

    if (matchedRule) {
      rationale.push(`matched routing rule: ${matchedRule.pattern}`)
      const complexityScore = this.computeComplexityScore(input, matchedRule)
      return {
        strategy: matchedRule.strategy,
        category: matchedRule.category,
        subagent: matchedRule.subagent,
        complexityScore,
        rationale
      }
    }

    const complexityScore = this.computeComplexityScore(input)
    if (complexityScore >= 0.55) {
      rationale.push(`complexity score ${complexityScore.toFixed(2)} exceeds workforce threshold`)
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore,
        rationale
      }
    }

    rationale.push(`complexity score ${complexityScore.toFixed(2)} below workforce threshold`)
    return {
      strategy: 'direct',
      complexityScore,
      rationale
    }
  }

  private findRule(input: string): RoutingRule | null {
    return this.rules.find(rule => rule.pattern.test(input)) ?? null
  }

  private computeComplexityScore(input: string, matchedRule?: RoutingRule): number {
    const normalized = input.trim()
    if (!normalized) {
      return 0
    }

    let score = 0
    if (normalized.length >= 80) {
      score += 0.2
    }
    if (normalized.length >= 180) {
      score += 0.15
    }

    for (const pattern of COMPLEXITY_HINTS) {
      if (pattern.test(normalized)) {
        score += 0.3
      }
    }

    if (matchedRule?.strategy === 'workforce') {
      score += 0.25
    }
    if (matchedRule?.subagent) {
      score += 0.1
    }

    for (const pattern of LOW_COMPLEXITY_HINTS) {
      if (pattern.test(normalized)) {
        score -= 0.25
      }
    }

    return Math.max(0, Math.min(score, 1))
  }
}

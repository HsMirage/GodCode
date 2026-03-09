import { DelegateEngine, type DelegateTaskResult } from '../delegate'
import { WorkforceEngine, type WorkflowResult } from '../workforce'
import type { SkillRuntimePayload } from '../skills/types'
import {
  applyRecoveryTrackingMetadata,
  type RecoveryTrackingMetadata
} from '@/shared/recovery-contract'
import { extractTraceMetadata, type TraceContext } from '@/shared/trace-contract'
import { buildStructuredTaskBrief } from './task-brief-builder'
import { renderTaskBriefMarkdown, type StructuredTaskBrief } from '@/shared/task-brief-contract'
import { matchTaskTemplate } from '@/shared/task-template-library'
import {
  getAgentCapabilityBoundary,
  getCategoryCapabilityBoundary
} from '@/shared/agent-capability-matrix'

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
  /** Optional runtime tool allowlist override */
  availableTools?: string[]
  /** Optional runtime model override */
  overrideModelSpec?: string
  /** Optional resolved skill runtime payload for routing metadata */
  skillRuntime?: SkillRuntimePayload
  /** Optional resume metadata propagated from recovery UI/automation */
  resumeContext?: RecoveryTrackingMetadata
  /** Unified trace propagated from message entry */
  traceContext?: TraceContext
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

export interface SemanticRoutingScores {
  complexityScore: number
  riskScore: number
  infoSufficiencyScore: number
  approvalScore: number
  workforceFitScore: number
}

interface RouteDecision {
  strategy: RouteStrategy
  category?: string
  subagent?: string
  complexityScore: number
  semanticScores: SemanticRoutingScores
  rationale: string[]
  taskBrief?: StructuredTaskBrief | null
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
  /分解|拆分|规划|plan|分步|阶段|跨模块|跨文件|跨服务|多模型|fallback|strict binding/i,
  /整体优化|整体改造|整个系统|全局改造/i
]
const LOW_COMPLEXITY_HINTS = [/解释|是什么|示例|语法|翻译|润色|weather|hello/i]
const HIGH_RISK_HINTS = [
  /bash|shell|终端|命令行|deploy|发布|生产|prod|migration|迁移|数据库变更|删除|批量修改|secret|密钥|token|权限/i,
  /browser|navigate|click|fill|网页登录|表单提交|外部系统写入|审批/i
]
const CLARIFICATION_HINT = /判断怎么拆|怎么拆|先帮我判断|先分析|先澄清/i
const APPROVAL_HINTS = [
  /bash|shell|写入|删除|批量修改|browser|navigate|click|fill|迁移|发布|审批|权限/i
]
const INFORMATION_HINTS = [
  /src\/|tests?\/|docs\/|\.(ts|tsx|js|jsx|json|md|yml|yaml)\b/i,
  /错误|日志|log|stack|trace|报错|复现|重现|步骤|验收|acceptance|允许修改|禁止修改|line\s*\d+/i
]
const LOW_INFORMATION_HINTS = [/帮我|看下|优化一下|搞一下|整体|整个系统|全局|先看看|怎么做/i]
const PRIMARY_AGENT_CODES = new Set(['fuxi', 'haotian', 'kuafu'])

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
    const taskTemplate = matchTaskTemplate(input) || (context?.prompt ? matchTaskTemplate(context.prompt) : null)
    const decision = this.applyTaskTemplateDecision(this.resolveDecision(input, context), taskTemplate)
    const taskBrief = this.buildTaskBrief(context?.prompt ?? input, decision, taskTemplate)

    if (decision.strategy === 'delegate') {
      const selectedSubagent = decision.subagent ?? context?.agentCode
      return await this.delegateEngine.delegateTask({
        sessionId: context?.sessionId,
        description: input,
        prompt: this.buildPromptWithTaskBrief(context?.prompt ?? input, taskBrief),
        category: decision.category,
        subagent_type: selectedSubagent,
        parentTaskId: context?.parentTaskId,
        abortSignal: context?.abortSignal,
        availableTools: context?.availableTools,
        model: context?.overrideModelSpec,
        metadata: {
          routing: {
            strategy: decision.strategy,
            complexityScore: decision.complexityScore,
            semanticScores: decision.semanticScores,
            rationale: decision.rationale
          },
          taskTemplate,
          taskBrief,
          skill: context?.skillRuntime || null,
          ...(context?.resumeContext
            ? applyRecoveryTrackingMetadata({}, context.resumeContext)
            : {}),
          ...(context?.traceContext
            ? {
                traceId: context.traceContext.traceId,
                trace: extractTraceMetadata(context.traceContext)
              }
            : {})
        }
      })
    }

    if (decision.strategy === 'workforce') {
      const workflowOptions = {
        category: decision.category ?? 'dayu',
        agentCode: context?.agentCode,
        abortSignal: context?.abortSignal,
        availableTools: context?.availableTools,
        overrideModelSpec: context?.overrideModelSpec,
        skillRuntime: context?.skillRuntime,
        taskBrief,
        resumeContext: context?.resumeContext,
        routingContext: {
          strategy: decision.strategy,
          complexityScore: decision.complexityScore,
          semanticScores: decision.semanticScores,
          rationale: decision.rationale,
          taskBriefGenerated: Boolean(taskBrief)
        },
        taskTemplate,
        traceContext: context?.traceContext
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
    const matchedRule = this.findRule(input)
    const semanticScores = this.computeSemanticScores(input, matchedRule || undefined)

    if (context?.forceWorkforce) {
      rationale.push('forceWorkforce context flag is enabled')
      this.appendSemanticScoreRationale(rationale, semanticScores)
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: 1,
        semanticScores: { ...semanticScores, complexityScore: 1, workforceFitScore: 1 },
        rationale,
        taskBrief: null
      }
    }

    if (EXPLICIT_WORKFORCE_PATTERN.test(input)) {
      rationale.push('explicit instruction requests workforce orchestration')
      this.appendSemanticScoreRationale(rationale, semanticScores)
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: 1,
        semanticScores: { ...semanticScores, complexityScore: 1, workforceFitScore: 1 },
        rationale,
        taskBrief: null
      }
    }

    if (EXPLICIT_DELEGATE_PATTERN.test(input)) {
      rationale.push('explicit instruction requests delegate execution')
      this.appendSemanticScoreRationale(rationale, semanticScores)
      return {
        strategy: 'delegate',
        category: 'dayu',
        complexityScore: 0.6,
        semanticScores: { ...semanticScores, complexityScore: 0.6 },
        rationale,
        taskBrief: null
      }
    }

    if (context?.agentCode?.trim()) {
      const normalized = context.agentCode.trim().toLowerCase()
      if (PRIMARY_AGENT_CODES.has(normalized)) {
        const boundary = getAgentCapabilityBoundary(normalized)
        if (boundary) {
          rationale.push(`capability boundary matched primary role: ${boundary.defaultRole}`)
        }
        rationale.push('primary agentCode must route through workforce orchestration')
        this.appendSemanticScoreRationale(rationale, semanticScores)
        return {
          strategy: 'workforce',
          category: 'dayu',
          complexityScore: 0.7,
          semanticScores: { ...semanticScores, complexityScore: 0.7 },
          rationale,
          taskBrief: null
        }
      }

      const subagentBoundary = getAgentCapabilityBoundary(context.agentCode.trim())
      if (subagentBoundary) {
        rationale.push(`capability boundary matched subagent: ${subagentBoundary.defaultRole}`)
      }
      rationale.push('subagent agentCode requires delegate route')
      this.appendSemanticScoreRationale(rationale, semanticScores)
      return {
        strategy: 'delegate',
        subagent: context.agentCode.trim(),
        complexityScore: 0.55,
        semanticScores: { ...semanticScores, complexityScore: 0.55 },
        rationale,
        taskBrief: null
      }
    }

    if (matchedRule) {
      rationale.push(`matched routing rule: ${matchedRule.pattern}`)
      const boundary = matchedRule.subagent
        ? getAgentCapabilityBoundary(matchedRule.subagent)
        : matchedRule.category
          ? getCategoryCapabilityBoundary(matchedRule.category)
          : undefined
      if (boundary) {
        rationale.push(`capability boundary hint: ${boundary.label}`)
      }
      this.appendSemanticScoreRationale(rationale, semanticScores)
      const complexityScore = semanticScores.complexityScore
      if (
        matchedRule.strategy !== 'workforce' &&
        ((semanticScores.riskScore >= 0.35 &&
          semanticScores.approvalScore >= 0.35 &&
          semanticScores.complexityScore >= 0.3) ||
          semanticScores.workforceFitScore >= 0.7)
      ) {
        rationale.push(
          `semantic router override: risk/approval or workforce fit ${semanticScores.workforceFitScore.toFixed(2)} requires orchestration`
        )
        return {
          strategy: 'workforce',
          category: 'dayu',
          complexityScore,
          semanticScores,
          rationale,
          taskBrief: null
        }
      }
      return {
        strategy: matchedRule.strategy,
        category: matchedRule.category,
        subagent: matchedRule.subagent,
        complexityScore,
        semanticScores,
        rationale,
        taskBrief: null
      }
    }

    this.appendSemanticScoreRationale(rationale, semanticScores)

    if (
      semanticScores.riskScore >= 0.35 &&
      semanticScores.approvalScore >= 0.35 &&
      semanticScores.complexityScore >= 0.3
    ) {
      rationale.push('high-risk approval-sensitive task requires workforce orchestration')
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: semanticScores.complexityScore,
        semanticScores,
        rationale,
        taskBrief: null
      }
    }

    if (
      CLARIFICATION_HINT.test(input) &&
      semanticScores.infoSufficiencyScore < 0.3 &&
      semanticScores.complexityScore >= 0.45 &&
      semanticScores.riskScore < 0.35
    ) {
      rationale.push(
        `information sufficiency score ${semanticScores.infoSufficiencyScore.toFixed(2)} is low; delegate to clarification subagent`
      )
      return {
        strategy: 'delegate',
        subagent: 'chongming',
        complexityScore: semanticScores.complexityScore,
        semanticScores,
        rationale,
        taskBrief: null
      }
    }

    if (semanticScores.complexityScore >= 0.55) {
      rationale.push(`complexity score ${semanticScores.complexityScore.toFixed(2)} exceeds workforce threshold`)
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: semanticScores.complexityScore,
        semanticScores,
        rationale,
        taskBrief: null
      }
    }

    if (semanticScores.workforceFitScore >= 0.6) {
      rationale.push(`workforce fit score ${semanticScores.workforceFitScore.toFixed(2)} exceeds threshold`)
      return {
        strategy: 'workforce',
        category: 'dayu',
        complexityScore: semanticScores.complexityScore,
        semanticScores,
        rationale,
        taskBrief: null
      }
    }

    if (
      semanticScores.complexityScore >= 0.35 ||
      semanticScores.riskScore >= 0.45 ||
      semanticScores.approvalScore >= 0.45
    ) {
      rationale.push('semantic scores favor delegate execution over direct response')
      return {
        strategy: 'delegate',
        category: 'dayu',
        complexityScore: semanticScores.complexityScore,
        semanticScores,
        rationale,
        taskBrief: null
      }
    }

    rationale.push(`workforce fit score ${semanticScores.workforceFitScore.toFixed(2)} below orchestration threshold`)
    return {
      strategy: 'direct',
      complexityScore: semanticScores.complexityScore,
      semanticScores,
      rationale,
      taskBrief: null
    }
  }

  private buildTaskBrief(
    input: string,
    decision: RouteDecision,
    taskTemplate: ReturnType<typeof matchTaskTemplate>
  ): StructuredTaskBrief | null {
    return buildStructuredTaskBrief({
      rawInput: input,
      strategy: decision.strategy,
      complexityScore: decision.complexityScore,
      taskTemplate: taskTemplate
        ? {
            key: taskTemplate.key,
            label: taskTemplate.label,
            acceptanceCriteria: taskTemplate.acceptanceCriteria,
            executionSteps: taskTemplate.executionSteps
          }
        : null
    })
  }

  private applyTaskTemplateDecision(
    decision: RouteDecision,
    taskTemplate: ReturnType<typeof matchTaskTemplate>
  ): RouteDecision {
    if (!taskTemplate) {
      return decision
    }

    const rationale = decision.rationale.some(item => item.includes('task template matched'))
      ? decision.rationale
      : [...decision.rationale, `task template matched: ${taskTemplate.label}`]

    if (decision.strategy === 'direct') {
      return {
        ...decision,
        strategy: taskTemplate.defaultStrategy,
        category: decision.category ?? taskTemplate.recommendedCategory,
        subagent: decision.subagent ?? taskTemplate.recommendedSubagent,
        complexityScore: Math.max(decision.complexityScore, taskTemplate.defaultStrategy === 'workforce' ? 0.55 : 0.35),
        rationale: [...rationale, `task template default strategy ${taskTemplate.defaultStrategy} selected`]
      }
    }

    return {
      ...decision,
      category: decision.category ?? taskTemplate.recommendedCategory,
      subagent: decision.subagent ?? taskTemplate.recommendedSubagent,
      rationale
    }
  }

  private buildPromptWithTaskBrief(prompt: string, taskBrief: StructuredTaskBrief | null): string {
    if (!taskBrief) {
      return prompt
    }

    return [
      renderTaskBriefMarkdown(taskBrief),
      '',
      '#### 输出要求',
      '- 最终回复必须包含 TASK_ID 与 ACCEPTANCE_CHECKLIST 两个小节。',
      '- ACCEPTANCE_CHECKLIST 需逐条对齐任务卡中的验收标准。',
      '',
      '#### 原始任务',
      prompt
    ].join('\n')
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

  private computeSemanticScores(input: string, matchedRule?: RoutingRule): SemanticRoutingScores {
    const complexityScore = this.computeComplexityScore(input, matchedRule)
    const riskScore = this.computeRiskScore(input)
    const infoSufficiencyScore = this.computeInfoSufficiencyScore(input)
    const approvalScore = this.computeApprovalScore(input)
    const workforceFitScore = Math.max(
      0,
      Math.min(
        complexityScore * 0.45 +
          riskScore * 0.2 +
          infoSufficiencyScore * 0.2 +
          approvalScore * 0.15 +
          (matchedRule?.strategy === 'workforce' ? 0.15 : 0),
        1
      )
    )

    return {
      complexityScore,
      riskScore,
      infoSufficiencyScore,
      approvalScore,
      workforceFitScore
    }
  }

  private computeRiskScore(input: string): number {
    const normalized = input.trim()
    let score = 0

    for (const pattern of HIGH_RISK_HINTS) {
      if (pattern.test(normalized)) {
        score += 0.35
      }
    }

    return Math.max(0, Math.min(score, 1))
  }

  private computeInfoSufficiencyScore(input: string): number {
    const normalized = input.trim()
    let score = 0

    for (const pattern of INFORMATION_HINTS) {
      if (pattern.test(normalized)) {
        score += 0.3
      }
    }

    if (normalized.length >= 120) {
      score += 0.15
    }
    if (normalized.length >= 220) {
      score += 0.1
    }

    for (const pattern of LOW_INFORMATION_HINTS) {
      if (pattern.test(normalized)) {
        score -= 0.2
      }
    }

    return Math.max(0, Math.min(score, 1))
  }

  private computeApprovalScore(input: string): number {
    const normalized = input.trim()
    let score = 0

    for (const pattern of APPROVAL_HINTS) {
      if (pattern.test(normalized)) {
        score += 0.35
      }
    }

    return Math.max(0, Math.min(score, 1))
  }

  private appendSemanticScoreRationale(rationale: string[], scores: SemanticRoutingScores): void {
    rationale.push(
      `semantic scores => complexity ${scores.complexityScore.toFixed(2)}, risk ${scores.riskScore.toFixed(2)}, info ${scores.infoSufficiencyScore.toFixed(2)}, approval ${scores.approvalScore.toFixed(2)}, workforce fit ${scores.workforceFitScore.toFixed(2)}`
    )
  }
}

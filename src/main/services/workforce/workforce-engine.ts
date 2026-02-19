/**
 * @license
 * Copyright (c) 2024-2026 stackframe-projects
 *
 * This file is adapted from eigent
 * Original source: https://github.com/stackframe-projects/eigent
 * License: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Modified by CodeAll project.
 */

import { DelegateEngine } from '../delegate'
import { DatabaseService } from '../database'
import { Prisma } from '@prisma/client'
import { LoggerService } from '../logger'
import { createLLMAdapter } from '../llm/factory'
import { DEFAULT_FALLBACK_CHAINS, type ModelSource } from '../llm/model-resolver'
import type { Message } from '@/types/domain'
import { workflowEvents } from './events'
import { getTaskRetryService, type RetryConfig, type RetryState } from './retry'
import { SecureStorageService } from '../secure-storage.service'
import { BoulderStateService } from '../boulder-state.service'
import fs from 'node:fs'
import path from 'node:path'

export interface SubTask {
  id: string
  description: string
  dependencies: string[]
  assignedAgent?: string
  assignedCategory?: string
  source?: 'decomposed' | 'plan'
  workflowPhase?: WorkflowPhase
}

export interface WorkflowResult {
  workflowId: string
  tasks: SubTask[]
  results: Map<string, string>
  executions: Map<string, WorkflowTaskExecution>
  success: boolean
  /** Retry states for tasks that were retried */
  retryStates?: Map<string, RetryState>
  /** Orchestrator checkpoint records captured during workflow execution. */
  orchestratorCheckpoints?: OrchestratorCheckpointRecord[]
  /** Whether orchestrator checkpoint participation actually happened. */
  orchestratorParticipation?: boolean
}

export interface WorkflowOptions {
  /** Task category for routing */
  category?: string
  /** Selected dialog agent code for model/prompt inheritance */
  agentCode?: string
  /** Retry configuration override */
  retryConfig?: Partial<RetryConfig>
  /** Whether to enable retries (default: true) */
  enableRetry?: boolean
  /** Optional explicit plan path for plan-driven execution */
  planPath?: string
  /** Abort signal propagated from session stop action */
  abortSignal?: AbortSignal
}

interface WorkflowTaskResolution {
  subtasks: SubTask[]
  source: 'decomposed' | 'plan'
  planPath?: string
  planName?: string
  referencedMarkdownFiles?: string[]
}

interface TaskExecutionProfile {
  assignedAgent?: string
  assignedCategory?: string
}

type WorkflowPhase = 'discovery' | 'plan-review' | 'deep-review' | 'execution'
type TaskIntent = 'analysis' | 'implementation'
type OrchestratorCheckpointPhase = 'pre-dispatch' | 'between-waves' | 'final'

interface TaskPromptContract {
  intent: TaskIntent
  workflowPhase: WorkflowPhase
  readOnly: boolean
}

interface OrchestratorPolicyContext {
  input: string
  agentCode?: string
  source: 'decomposed' | 'plan'
  workflowCategory: string
  readOnlyRequested: boolean
}

export interface WorkflowTaskExecution {
  logicalTaskId: string
  persistedTaskId: string
  assignedAgent?: string
  assignedCategory?: string
  model?: string
  modelSource?: ModelSource
}

interface ReferencedMarkdownFile {
  rawPath: string
  resolvedPath: string
}

interface ReferencedMarkdownContext {
  existingFiles: ReferencedMarkdownFile[]
  missingFiles: string[]
  needsExistingFiles: boolean
}

interface OrchestratorCheckpointInput {
  workflowId: string
  sessionId: string
  orchestratorAgentCode: string
  phase: OrchestratorCheckpointPhase
  userInput: string
  recentlyCompletedTasks: SubTask[]
  readyTasks: SubTask[]
  results: Map<string, string>
  executions: Map<string, WorkflowTaskExecution>
  abortSignal?: AbortSignal
}

interface OrchestratorCheckpointDecision {
  status: 'continue' | 'halt'
  approvedTaskIds: string[]
  reason?: string
  persistedTaskId: string
  rawOutput: string
}

interface OrchestratorCheckpointRecord {
  timestamp: string
  phase: OrchestratorCheckpointPhase
  status: 'continue' | 'halt' | 'fallback'
  reportedTaskIds: string[]
  readyTaskIds: string[]
  approvedTaskIds: string[]
  reason?: string
  persistedTaskId?: string
}

const MAX_CONCURRENT = 3
const PRIMARY_ORCHESTRATORS = new Set(['fuxi', 'haotian', 'kuafu'])
const SPECIALIST_WORKERS = new Set(['qianliyan', 'diting', 'baize', 'chongming', 'leigong'])
const KNOWN_SUBAGENT_CODES = new Set([
  'fuxi',
  'haotian',
  'kuafu',
  'luban',
  'baize',
  'chongming',
  'leigong',
  'diting',
  'qianliyan',
  'multimodal-looker'
])
const SUBAGENT_ALIASES: Record<string, string> = {
  explore: 'qianliyan',
  oracle: 'baize',
  librarian: 'diting',
  metis: 'chongming',
  momus: 'leigong',
  prometheus: 'fuxi',
  sisyphus: 'haotian',
  atlas: 'kuafu',
  hephaestus: 'luban'
}
const KNOWN_CATEGORY_CODES = new Set([
  'zhinv',
  'cangjie',
  'tianbing',
  'guigu',
  'maliang',
  'guixu',
  'tudi',
  'dayu'
])
const CATEGORY_ALIASES: Record<string, string> = {
  'visual-engineering': 'zhinv',
  writing: 'cangjie',
  quick: 'tianbing',
  ultrabrain: 'guigu',
  artistry: 'maliang',
  deep: 'guixu',
  'unspecified-low': 'tudi',
  'unspecified-high': 'dayu',
  general: 'dayu'
}
const CATEGORY_TO_FALLBACK_SUBAGENT: Record<string, string> = {
  zhinv: 'luban',
  cangjie: 'luban',
  tianbing: 'luban',
  guigu: 'luban',
  maliang: 'luban',
  guixu: 'luban',
  tudi: 'luban',
  dayu: 'luban'
}
const NON_WORKER_ASSIGNEES = new Set(['haotian', 'fuxi', 'kuafu'])
const ACTIONABILITY_RECOVERY_MAX_ATTEMPTS = 2
const MODEL_FALLBACK_MAX_ATTEMPTS = 1
const ACTIONABILITY_RECOVERY_REASONS = new Set([
  'empty-output',
  'status-only-placeholder',
  'meta-process-output',
  'capability-limited-output',
  'explicit-rejection-output'
])
const ORCHESTRATOR_CHECKPOINT_RESULT_PREVIEW = 480
const ORCHESTRATOR_CHECKPOINT_PREVIEW_HEAD = 300
const ORCHESTRATOR_CHECKPOINT_PREVIEW_TAIL = 180
const ORCHESTRATOR_NO_EVIDENCE_REASON_PATTERN =
  /(no evidence|without evidence|missing evidence|output_preview|only shows intent|only shows plan|no schema content|no prisma validation|无证据|没有证据|仅.*计划|仅.*意图|无法验证|未见证据)/i
const ORCHESTRATOR_RECOVERABLE_HALT_REASON_PATTERN =
  /(evidence_detected=no|output_preview|needs?\s+verify|verification failed|cannot verify|未完成|部分完成|需验证|无法验证|证据不足|missing|required|缺失|incomplete|未创建|未安装)/i
const CHECKPOINT_HALT_RECOVERY_MAX_ATTEMPTS = 3

class TaskActionabilityError extends Error {
  reason: string
  output: string

  constructor(taskId: string, reason: string, output: string) {
    super(`Delegate task "${taskId}" returned non-actionable output (${reason})`)
    this.reason = reason
    this.output = output
  }
}

export class WorkforceEngine {
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private delegateEngine = new DelegateEngine()

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  private normalizeToken(value: string): string {
    return value.trim().toLowerCase()
  }

  private resolveCanonicalSubagent(raw?: string): string | undefined {
    if (!raw) return undefined
    const normalized = this.normalizeToken(raw)
    const canonical = SUBAGENT_ALIASES[normalized] || normalized
    if (KNOWN_SUBAGENT_CODES.has(canonical)) {
      return canonical
    }
    return undefined
  }

  private resolveCanonicalCategory(raw?: string): string | undefined {
    if (!raw) return undefined
    const normalized = this.normalizeToken(raw)
    const canonical = CATEGORY_ALIASES[normalized] || normalized
    if (KNOWN_CATEGORY_CODES.has(canonical)) {
      return canonical
    }
    return undefined
  }

  private normalizeWorkflowCategory(category?: string): string {
    return this.resolveCanonicalCategory(category) || 'dayu'
  }

  private normalizeDecomposedSubtasks(input: unknown): SubTask[] {
    if (!Array.isArray(input)) return []

    const normalized: SubTask[] = []
    for (let index = 0; index < input.length; index++) {
      const item = input[index]
      if (!item || typeof item !== 'object') {
        continue
      }

      const payload = item as Record<string, unknown>
      const id =
        (typeof payload.id === 'string' && payload.id.trim()) || `task-${index + 1}`
      const description =
        (typeof payload.description === 'string' && payload.description.trim()) || `Task ${index + 1}`
      const dependencies = Array.isArray(payload.dependencies)
        ? payload.dependencies
          .filter((dep): dep is string => typeof dep === 'string' && dep.trim().length > 0)
          .map(dep => dep.trim())
        : []

      const explicitSubagent =
        (typeof payload.subagent_type === 'string' && payload.subagent_type) ||
        (typeof payload.assignedAgent === 'string' && payload.assignedAgent) ||
        undefined
      const explicitCategory =
        (typeof payload.category === 'string' && payload.category) ||
        (typeof payload.assignedCategory === 'string' && payload.assignedCategory) ||
        undefined

      const assignedAgent = this.resolveCanonicalSubagent(explicitSubagent)
      const assignedCategory = this.resolveCanonicalCategory(explicitCategory)

      normalized.push({
        id: id.trim(),
        description: description.trim(),
        dependencies: Array.from(new Set(dependencies)),
        assignedAgent,
        assignedCategory
      })
    }

    return normalized
  }

  private isPrimaryOrchestrator(agentCode?: string): boolean {
    if (!agentCode) return false
    const canonical = this.resolveCanonicalSubagent(agentCode) || this.normalizeToken(agentCode)
    return PRIMARY_ORCHESTRATORS.has(canonical)
  }

  private isReadOnlyWorkflowRequest(input: string): boolean {
    return /(只读|禁止修改|不修改文件|不要改代码|read-?only|no file changes?|do not modify)/i.test(
      input
    )
  }

  private shouldRequestLibrarian(text: string): boolean {
    return /(?:官方文档|api reference|best practice|第三方|开源|oss|community|sdk|benchmark|外部文档|第三方库|外部库|依赖包|npm|pypi|maven|pip|crate)/i.test(
      text
    )
  }

  private shouldRequestDeepReview(input: string): boolean {
    return /(雷公|momus|deep review|深度审查|深审|严格审查|quality gate|quality review)/i.test(
      input
    )
  }

  private isAgentExplicitlyRequested(input: string, agentCode: string): boolean {
    const normalized = input.toLowerCase()
    const aliases: Record<string, string[]> = {
      qianliyan: ['qianliyan', 'explore', '千里眼'],
      diting: ['diting', 'librarian', '谛听'],
      baize: ['baize', 'oracle', '白泽'],
      chongming: ['chongming', 'metis', '重明'],
      leigong: ['leigong', 'momus', '雷公']
    }
    const candidates = aliases[agentCode] || [agentCode]
    return candidates.some(candidate => normalized.includes(candidate.toLowerCase()))
  }

  private shouldKeepSpecialistAssignment(
    task: SubTask,
    agentCode: string,
    workflowInput: string
  ): boolean {
    if (this.isAgentExplicitlyRequested(workflowInput, agentCode)) {
      return true
    }

    const text = task.description.toLowerCase()
    switch (agentCode) {
      case 'qianliyan':
        return /(搜索|检索|定位|探索|scan|grep|find|codebase|代码库|仓库|readme|结构|现状)/i.test(
          text
        )
      case 'diting':
        return this.shouldRequestLibrarian(text)
      case 'baize':
        return /(架构|评审|review|审查|debug|诊断|risk|风险|trade-off)/i.test(text)
      case 'chongming':
        return (
          this.isAgentExplicitlyRequested(workflowInput, 'chongming') ||
          /(计划审查|review plan|校验计划|任务分解审查|依赖审查|pre-?plan review|clarify intent|澄清需求|识别歧义)/i.test(
            workflowInput
          )
        )
      case 'leigong':
        return (
          this.isAgentExplicitlyRequested(workflowInput, 'leigong') ||
          /(深度审查|deep review|质量门禁|quality gate|严审|复核|验收审查)/i.test(workflowInput)
        )
      default:
        return false
    }
  }

  private hasImplementationSignal(text: string): boolean {
    return /(实现|新增|开发|修复|重构|改造|集成|落地|编码|编写|上线|feature|fix|bug|refactor|implement|build|ship|后端|backend|前端|frontend|ui|页面|按钮|api|接口|数据库|schema|migration|service|controller|测试|test|deploy)/i.test(
      text
    )
  }

  private isExecutionActionTask(text: string): boolean {
    return /(实现|新增|开发|修复|重构|改造|集成|落地|编码|编写|上线|feature|fix|bug|refactor|implement|build|ship)/i.test(
      text
    )
  }

  private hasAnalysisSignal(text: string): boolean {
    return /(分析|调研|研究|探索|梳理|审查|评审|review|risk|风险|文档|benchmark|对比|总结|结论|定位|检索|搜索|信息收集)/i.test(
      text
    )
  }

  private inferWorkflowExecutionDemand(input: string, tasks: SubTask[]): boolean {
    const combined = `${input}\n${tasks.map(task => task.description).join('\n')}`
    if (!this.hasImplementationSignal(combined)) {
      return false
    }

    const analysisOnly =
      /(只做|仅做|只需|仅需|只要|仅要|只输出|仅输出).*(分析|调研|研究|评审|审查|总结|建议|报告)/i.test(
        input
      ) ||
      /(不要实现|不需要实现|无需实现|只分析|仅分析|只调研|仅调研|只审查|仅审查)/i.test(input)

    return !analysisOnly
  }

  private inferExecutionDomainNeeds(text: string): { backend: boolean; frontend: boolean } {
    return {
      backend: /(后端|backend|api|接口|数据库|schema|migration|service|controller|server)/i.test(text),
      frontend: /(前端|frontend|ui|页面|按钮|组件|样式|layout|css|交互|动效|响应式)/i.test(text)
    }
  }

  private createSyntheticExecutionTask(
    existingIds: Set<string>,
    baseId: string,
    description: string,
    assignedCategory: string,
    source: 'decomposed' | 'plan'
  ): SubTask {
    return {
      id: this.allocateSyntheticTaskId(existingIds, baseId),
      description,
      dependencies: [],
      assignedCategory,
      source,
      workflowPhase: 'execution'
    }
  }

  private inferTaskIntent(task: SubTask, _workflowReadOnly: boolean): TaskIntent {
    
    if (task.workflowPhase && task.workflowPhase !== 'execution') {
      return 'analysis'
    }

    const explicitAgent = this.resolveCanonicalSubagent(task.assignedAgent)
    if (explicitAgent && SPECIALIST_WORKERS.has(explicitAgent)) {
      return 'analysis'
    }

    if (this.hasImplementationSignal(task.description)) {
      return 'implementation'
    }
    if (this.hasAnalysisSignal(task.description)) {
      return 'analysis'
    }

    if (task.workflowPhase === 'execution') {
      return 'implementation'
    }

    return 'implementation'
  }

  private buildTaskPromptContract(task: SubTask, workflowReadOnly: boolean): TaskPromptContract {
    return {
      intent: this.inferTaskIntent(task, workflowReadOnly),
      workflowPhase: task.workflowPhase || 'execution',
      readOnly: workflowReadOnly
    }
  }

  private allocateSyntheticTaskId(existingIds: Set<string>, baseId: string): string {
    const normalizedBase = baseId.replace(/[^a-zA-Z0-9_.-]/g, '-')
    if (!existingIds.has(normalizedBase)) {
      existingIds.add(normalizedBase)
      return normalizedBase
    }

    let counter = 2
    while (existingIds.has(`${normalizedBase}-${counter}`)) {
      counter++
    }

    const allocated = `${normalizedBase}-${counter}`
    existingIds.add(allocated)
    return allocated
  }

  private applyOrchestratorWorkflowPolicy(
    tasks: SubTask[],
    context: OrchestratorPolicyContext
  ): SubTask[] {
    if (!this.isPrimaryOrchestrator(context.agentCode) || tasks.length === 0) {
      return tasks
    }

    const normalizedTasks: SubTask[] = tasks.map(task => ({
      ...task,
      dependencies: Array.from(new Set(task.dependencies.filter(Boolean)))
    }))
    const existingIds = new Set(normalizedTasks.map(task => task.id))
    const combinedTaskText = `${context.input}\n${normalizedTasks.map(task => task.description).join('\n')}`
    const requestedDeepReview =
      this.shouldRequestDeepReview(context.input) ||
      this.isAgentExplicitlyRequested(context.input, 'leigong')
    const requiresExecutionFlow =
      context.source === 'plan' || this.inferWorkflowExecutionDemand(context.input, normalizedTasks)

    const preservedDiscoveryTasks: SubTask[] = []
    const preservedPlanReviewTasks: SubTask[] = []
    const preservedDeepReviewTasks: SubTask[] = []
    const executionTasks: SubTask[] = []

    for (const task of normalizedTasks) {
      const assignedAgent = this.resolveCanonicalSubagent(task.assignedAgent)
      const assignedCategory = this.resolveCanonicalCategory(task.assignedCategory)

      if (assignedAgent && SPECIALIST_WORKERS.has(assignedAgent)) {
        const implementationLikeTask = this.isExecutionActionTask(task.description)
        const keepSpecialist =
          (assignedAgent === 'leigong' ? requestedDeepReview : true) &&
          this.shouldKeepSpecialistAssignment(task, assignedAgent, context.input) &&
          !(requiresExecutionFlow && implementationLikeTask && !['chongming', 'leigong'].includes(assignedAgent))

        if (!keepSpecialist) {
          executionTasks.push({
            ...task,
            assignedAgent: undefined,
            assignedCategory: this.selectCategoryForTask(task, context.workflowCategory),
            workflowPhase: 'execution'
          })
          continue
        }

        const specialistTask: SubTask = {
          ...task,
          assignedAgent,
          assignedCategory: undefined
        }

        if (assignedAgent === 'chongming') {
          preservedPlanReviewTasks.push({ ...specialistTask, workflowPhase: 'plan-review' })
        } else if (assignedAgent === 'leigong') {
          preservedDeepReviewTasks.push({ ...specialistTask, workflowPhase: 'deep-review' })
        } else {
          preservedDiscoveryTasks.push({ ...specialistTask, workflowPhase: 'discovery' })
        }
        continue
      }

      executionTasks.push({
        ...task,
        assignedAgent,
        assignedCategory: assignedCategory || task.assignedCategory,
        workflowPhase: 'execution'
      })
    }

    if (requiresExecutionFlow) {
      const declaredExecutionCategories = executionTasks.map(task => ({
        category:
          this.resolveCanonicalCategory(task.assignedCategory) ||
          this.selectCategoryForTask(task, context.workflowCategory),
        description: task.description
      }))
      const declaredBackendExecution = declaredExecutionCategories.some(item =>
        item.category === 'dayu' ||
        item.category === 'guixu' ||
        item.category === 'guigu' ||
        item.category === 'tianbing' ||
        /(后端|backend|api|接口|数据库|schema|migration|service|controller|server)/i.test(item.description)
      )
      const declaredFrontendExecution = declaredExecutionCategories.some(
        item =>
          item.category === 'zhinv' ||
          /(前端|frontend|ui|页面|按钮|组件|样式|layout|css|交互|动效|响应式)/i.test(item.description)
      )
      const domainNeeds = this.inferExecutionDomainNeeds(context.input)

      if ((executionTasks.length === 0 || (domainNeeds.backend && !declaredBackendExecution)) && domainNeeds.backend) {
        executionTasks.push(
          this.createSyntheticExecutionTask(
            existingIds,
            'stage-execution-backend',
            '完成后端功能实现（接口/服务/数据层）并提供可验证结果。',
            this.normalizeWorkflowCategory(context.workflowCategory),
            context.source
          )
        )
      }

      if (
        (executionTasks.length === 0 || (domainNeeds.frontend && !declaredFrontendExecution)) &&
        domainNeeds.frontend
      ) {
        executionTasks.push(
          this.createSyntheticExecutionTask(
            existingIds,
            'stage-execution-frontend',
            '完成前端 UI 按钮与交互实现，并与后端能力联通，提供可验证结果。',
            'zhinv',
            context.source
          )
        )
      }

      if (executionTasks.length === 0) {
        executionTasks.push(
          this.createSyntheticExecutionTask(
            existingIds,
            'stage-execution-general',
            '根据用户需求完成实现并提供验证证据。',
            this.normalizeWorkflowCategory(context.workflowCategory),
            context.source
          )
        )
      }
    }

    const hasExecutionLikeTasks =
      executionTasks.length > 0 ||
      normalizedTasks.some(task => this.inferTaskIntent(task, context.readOnlyRequested) === 'implementation')
    const hasReferencedMarkdownInputs = this.extractMarkdownPathCandidates(context.input).length > 0
    const discoveryExplicitlyRequested =
      this.isAgentExplicitlyRequested(context.input, 'qianliyan') ||
      this.isAgentExplicitlyRequested(context.input, 'diting') ||
      /(先(扫描|探索|检索|梳理|阅读|调研|分析)|先看代码|先看文档|先做调研)/i.test(context.input)

    const shouldInjectDiscovery =
      context.source === 'decomposed' &&
      hasExecutionLikeTasks &&
      context.agentCode !== 'kuafu' &&
      !hasReferencedMarkdownInputs &&
      (discoveryExplicitlyRequested || normalizedTasks.length >= 3)

    const injectedDiscoveryTasks: SubTask[] = []
    if (shouldInjectDiscovery && !preservedDiscoveryTasks.some(task => task.assignedAgent === 'qianliyan')) {
      injectedDiscoveryTasks.push({
        id: this.allocateSyntheticTaskId(existingIds, 'stage-discovery-qianliyan'),
        description: '由 qianliyan 扫描代码库并提取与本次任务最相关的实现模式、文件位置与约束。',
        dependencies: [],
        assignedAgent: 'qianliyan',
        source: context.source,
        workflowPhase: 'discovery'
      })
    }

    const shouldInjectLibrarianTask =
      !hasReferencedMarkdownInputs &&
      (this.shouldRequestLibrarian(combinedTaskText) ||
        this.isAgentExplicitlyRequested(context.input, 'diting'))
    if (
      shouldInjectDiscovery &&
      shouldInjectLibrarianTask &&
      !preservedDiscoveryTasks.some(task => task.assignedAgent === 'diting')
    ) {
      injectedDiscoveryTasks.push({
        id: this.allocateSyntheticTaskId(existingIds, 'stage-discovery-diting'),
        description: '由 diting 汇总外部文档/最佳实践要点，输出可执行约束与风险提示。',
        dependencies: [],
        assignedAgent: 'diting',
        source: context.source,
        workflowPhase: 'discovery'
      })
    }

    const discoveryTasks = [...preservedDiscoveryTasks, ...injectedDiscoveryTasks]
    const discoveryTaskIds = discoveryTasks.map(task => task.id)
    const planReviewRequestedExplicitly =
      this.isAgentExplicitlyRequested(context.input, 'chongming') ||
      /(计划审查|review plan|校验计划|任务分解审查|依赖审查|execution plan review|pre-?plan review)/i.test(
        context.input
      )

    let planReviewTaskId = preservedPlanReviewTasks[0]?.id
    const shouldInjectPlanReview =
      hasExecutionLikeTasks &&
      !planReviewTaskId &&
      (context.source === 'plan' || planReviewRequestedExplicitly || requestedDeepReview)
    if (shouldInjectPlanReview) {
      planReviewTaskId = this.allocateSyntheticTaskId(existingIds, 'stage-plan-review-chongming')
      preservedPlanReviewTasks.push({
        id: planReviewTaskId,
        description:
          '由 chongming 审查任务分解与依赖关系，指出歧义、缺失和风险，并给出可执行修正建议。',
        dependencies: discoveryTaskIds,
        assignedAgent: 'chongming',
        source: context.source,
        workflowPhase: 'plan-review'
      })
    } else if (planReviewTaskId && discoveryTaskIds.length > 0) {
      preservedPlanReviewTasks[0] = {
        ...preservedPlanReviewTasks[0],
        dependencies: Array.from(
          new Set([...(preservedPlanReviewTasks[0]?.dependencies || []), ...discoveryTaskIds])
        ),
        workflowPhase: 'plan-review'
      }
    }

    let deepReviewTaskId = preservedDeepReviewTasks[0]?.id
    if (requestedDeepReview && hasExecutionLikeTasks && !deepReviewTaskId) {
      deepReviewTaskId = this.allocateSyntheticTaskId(existingIds, 'stage-deep-review-leigong')
      preservedDeepReviewTasks.push({
        id: deepReviewTaskId,
        description:
          '由 leigong 对执行计划与验收标准进行深度审查，输出质量门禁与必须整改项。',
        dependencies: planReviewTaskId ? [planReviewTaskId] : discoveryTaskIds,
        assignedAgent: 'leigong',
        source: context.source,
        workflowPhase: 'deep-review'
      })
    } else if (deepReviewTaskId && planReviewTaskId) {
      preservedDeepReviewTasks[0] = {
        ...preservedDeepReviewTasks[0],
        dependencies: Array.from(
          new Set([...(preservedDeepReviewTasks[0]?.dependencies || []), planReviewTaskId])
        ),
        workflowPhase: 'deep-review'
      }
    }

    const executionGateId = deepReviewTaskId || planReviewTaskId
    const normalizedExecutionTasks: SubTask[] = executionTasks.map(task => {
      const explicitCategory = this.resolveCanonicalCategory(task.assignedCategory)
      const normalizedAgent = this.resolveCanonicalSubagent(task.assignedAgent)
      const assignedCategory =
        explicitCategory ||
        (!normalizedAgent || SPECIALIST_WORKERS.has(normalizedAgent)
          ? this.selectCategoryForTask(task, context.workflowCategory)
          : undefined)

      const nextDependencies = executionGateId
        ? Array.from(new Set([...task.dependencies, executionGateId]))
        : task.dependencies

      return {
        ...task,
        dependencies: nextDependencies,
        assignedAgent: assignedCategory ? undefined : normalizedAgent,
        assignedCategory: assignedCategory || undefined,
        workflowPhase: 'execution'
      }
    })

    const finalTasks: SubTask[] = [
      ...discoveryTasks,
      ...preservedPlanReviewTasks,
      ...preservedDeepReviewTasks,
      ...normalizedExecutionTasks
    ]

    const validIds = new Set(finalTasks.map(task => task.id))
    const phaseById = new Map(finalTasks.map(task => [task.id, task.workflowPhase || 'execution']))
    return finalTasks.map(task => ({
      ...task,
      dependencies: Array.from(
        new Set(
          task.dependencies.filter(depId => {
            if (depId === task.id || !validIds.has(depId)) {
              return false
            }
            if (task.workflowPhase === 'discovery' && phaseById.get(depId) === 'execution') {
              return false
            }
            return true
          })
        )
      )
    }))
  }

  async decomposeTask(
    input: string,
    opts: {
      agentCode?: string
      category?: string
      abortSignal?: AbortSignal
      workspaceDir?: string
      sessionId?: string
      decompositionContext?: string
    } = {}
  ): Promise<SubTask[]> {
    this.logger.info('Decomposing task', { input })

    let selectedProvider: string | undefined
    let selectedModel: string | undefined
    let apiKey: string | undefined
    let baseURL: string | undefined
    let temperature = 0.3
    const resolvedCategory = this.resolveCanonicalCategory(opts.category)

    // 1) Prefer the selected dialog agent's bound model (no global default needed).
    if (opts.agentCode) {
      const binding = await this.prisma.agentBinding.findUnique({
        where: { agentCode: opts.agentCode },
        include: { model: { include: { apiKeyRef: true } } }
      })

      if (binding?.enabled && binding.modelId && !binding.model) {
        throw new Error(
          `Agent「${opts.agentCode}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定”重新选择模型。`
        )
      }

      if (binding?.enabled && binding.model) {
        const decryptedKey = binding.model.apiKeyRef?.encryptedKey
          ? SecureStorageService.getInstance().decrypt(binding.model.apiKeyRef.encryptedKey)
          : binding.model.apiKey
            ? SecureStorageService.getInstance().decrypt(binding.model.apiKey)
            : null

        const key = decryptedKey?.trim() || ''
        if (!key) {
          throw new Error(
            `Agent「${opts.agentCode}」已绑定模型「${binding.model.modelName}」但缺少 API Key。` +
            `请到“设置 -> API Keys/模型”补全凭据，或到“设置 -> Agent 绑定”切换模型。`
          )
        }

        selectedProvider = binding.model.provider
        selectedModel = binding.model.modelName
        apiKey = key
        baseURL = binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
        temperature = binding.temperature ?? temperature
      }
    }

    // 2) Otherwise, try category-bound model if provided (e.g. routing categories).
    if (!selectedProvider && resolvedCategory) {
      const binding = await this.prisma.categoryBinding.findUnique({
        where: { categoryCode: resolvedCategory },
        include: { model: { include: { apiKeyRef: true } } }
      })

      if (binding?.enabled && binding.modelId && !binding.model) {
        throw new Error(
          `任务类别「${resolvedCategory}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定 -> 任务类别”重新选择模型。`
        )
      }

      if (binding?.enabled && binding.model) {
        const decryptedKey = binding.model.apiKeyRef?.encryptedKey
          ? SecureStorageService.getInstance().decrypt(binding.model.apiKeyRef.encryptedKey)
          : binding.model.apiKey
            ? SecureStorageService.getInstance().decrypt(binding.model.apiKey)
            : null

        const key = decryptedKey?.trim() || ''
        if (!key) {
          throw new Error(
            `任务类别「${resolvedCategory}」已绑定模型「${binding.model.modelName}」但缺少 API Key。` +
            `请到“设置 -> API Keys/模型”补全凭据，或到“设置 -> Agent 绑定 -> 任务类别”切换模型。`
          )
        }

        selectedProvider = binding.model.provider
        selectedModel = binding.model.modelName
        apiKey = key
        baseURL = binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
        temperature = binding.temperature ?? temperature
      }
    }

    // 3) Otherwise, use any connected provider (supports new ApiKeyRef storage).
    if (!selectedProvider) {
      type ModelRow = {
        provider: string
        modelName: string
        apiKey: string | null
        baseURL: string | null
        apiKeyRef?: { encryptedKey: string; baseURL: string } | null
      }

      const models = await this.prisma.model.findMany({
        where: {
          OR: [{ apiKeyId: { not: null } }, { apiKey: { not: null } }]
        },
        include: { apiKeyRef: true },
        orderBy: { createdAt: 'desc' }
      })

      // Only keep models with usable credentials (apiKeyRef preferred, legacy apiKey fallback).
      const credentialed = (models as ModelRow[])
        .map((m: ModelRow) => {
          const key = m.apiKeyRef?.encryptedKey
            ? SecureStorageService.getInstance().decrypt(m.apiKeyRef.encryptedKey)
            : m.apiKey
              ? SecureStorageService.getInstance().decrypt(m.apiKey)
              : null
          return { model: m, key: key?.trim() || '' }
        })
        .filter((x: { model: ModelRow; key: string }) => x.key.length > 0)

      if (credentialed.length === 0) {
        throw new Error('No model configured for task decomposition')
      }

      // Try to find a match in the orchestrator fallback chain (provider match only).
      for (const entry of DEFAULT_FALLBACK_CHAINS.orchestrator) {
        for (const provider of entry.providers) {
          const found = credentialed.find(
            (m: { model: ModelRow; key: string }) => m.model.provider === provider
          )
          if (found) {
            selectedProvider = provider
            selectedModel = entry.model
            apiKey = found.key
            baseURL = found.model.apiKeyRef?.baseURL ?? found.model.baseURL ?? undefined
            break
          }
        }
        if (selectedProvider) break
      }

      // Fallback to the most recently configured model.
      if (!selectedProvider) {
        const fallback = credentialed[0]
        selectedProvider = fallback.model.provider
        selectedModel = fallback.model.modelName
        apiKey = fallback.key
        baseURL = fallback.model.apiKeyRef?.baseURL ?? fallback.model.baseURL ?? undefined
      }
    }

    this.logger.info('Selected model for decomposition', {
      provider: selectedProvider,
      model: selectedModel,
      baseURL,
      viaAgent: opts.agentCode ?? null,
      viaCategory: resolvedCategory ?? null
    })

    const adapter = createLLMAdapter(selectedProvider!, {
      apiKey: apiKey || '',
      baseURL
    })

    const workspaceName = opts.workspaceDir ? path.basename(opts.workspaceDir) : undefined
    const isPrimaryAgent = this.isPrimaryOrchestrator(opts.agentCode)
    const decompositionInput = opts.decompositionContext?.trim()
      ? `${input}\n\nREFERENCED MARKDOWN CONTEXT:\n${opts.decompositionContext.trim()}`
      : input
    const orchestrationHint = isPrimaryAgent
      ? `
ADDITIONAL ORCHESTRATION RULES (PRIMARY AGENT):
- Focus subtasks on execution deliverables. Avoid meta/status tasks.
- Prefer "category" for implementation tasks.
- Use "subagent_type" only for true specialist work (explore/docs/risk review), not for generic implementation.
- For implementation requests, output at least one execution subtask with "category". If both backend and frontend are requested, output both.
- Specialist subtasks should be discovery/review only and must not replace execution subtasks.
- Every subtask description must be outcome-oriented (what is delivered), never process-oriented (what to think).`
      : ''

    const prompt = `Decompose the following task into 3-5 subtasks. For each subtask, identify dependencies and choose an execution profile.

STRICT CONTEXT RULES:
- You must stay within the user's request and the current workspace context.
- Never inject unrelated project context or names that are not in the request.
- ${workspaceName
        ? `Current workspace name: "${workspaceName}". If you mention a project name, it must match this workspace or the user input.`
        : 'If project name is unclear, use neutral wording like "当前项目" instead of inventing names.'
      }

Task: ${decompositionInput}

ROUTING RULES (MUST FOLLOW):
- Each subtask MUST specify exactly one routing target:
  1) "subagent_type" for specialist/research/review work.
  2) "category" for implementation/domain execution work.
- Never output both "subagent_type" and "category" in the same subtask.
- Allowed subagent_type values: qianliyan, diting, baize, chongming, leigong
- Allowed category values: zhinv, cangjie, tianbing, guigu, maliang, guixu, tudi, dayu
${orchestrationHint}

Return your response as JSON in this exact format:
{
  "subtasks": [
    {
      "id": "task-1",
      "description": "Subtask description",
      "dependencies": [],
      "subagent_type": "qianliyan"
    },
    {
      "id": "task-2",
      "description": "Another subtask",
      "dependencies": ["task-1"],
      "category": "dayu"
    }
  ]
}

Only return the JSON, no other text.`

    const messages: Message[] = [
      {
        id: 'system',
        sessionId: 'decompose',
        role: 'system',
        content: 'You are a task planning assistant. Always respond with valid JSON.',
        createdAt: new Date(),
        metadata: {}
      },
      {
        id: 'user',
        sessionId: 'decompose',
        role: 'user',
        content: prompt,
        createdAt: new Date(),
        metadata: {}
      }
    ]

    const response = await adapter.sendMessage(messages, {
      model: selectedModel ?? 'claude-3-5-sonnet-20240620',
      temperature,
      abortSignal: opts.abortSignal,
      workspaceDir: opts.workspaceDir,
      sessionId: opts.sessionId,
      // Task decomposition must stay pure planning; disable runtime tool execution.
      tools: []
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0]) as { subtasks?: unknown }
      const normalizedSubtasks = this.normalizeDecomposedSubtasks(parsed.subtasks)
      if (normalizedSubtasks.length === 0) {
        throw new Error('No valid subtasks found in decomposition response')
      }
      return normalizedSubtasks
    } catch (error) {
      this.logger.error('Failed to parse decomposition response', {
        error,
        response: response.content
      })

      return [
        {
          id: 'task-1',
          description: input,
          dependencies: []
        }
      ]
    }
  }

  buildDAG(tasks: SubTask[]): Map<string, string[]> {
    const dag = new Map<string, string[]>()

    for (const task of tasks) {
      dag.set(task.id, task.dependencies || [])
    }

    return dag
  }

  private async resolveWorkflowTasks(
    input: string,
    sessionId: string,
    options: WorkflowOptions,
    workspaceDir: string
  ): Promise<WorkflowTaskResolution> {
    const maybePlanPath = await this.resolvePlanPath(input, sessionId, options, workspaceDir)
    if (options.agentCode === 'kuafu' && this.shouldPreferPlanExecution(input, options.agentCode) && !maybePlanPath) {
      throw new Error(
        '未找到可执行计划文件。请先让伏羲生成计划，或手动指定路径：执行计划 .sisyphus/plans/<plan>.md'
      )
    }
    if (maybePlanPath) {
      try {
        const planSubtasks = this.parsePlanSubtasks(maybePlanPath)
        return {
          subtasks: planSubtasks,
          source: 'plan',
          planPath: maybePlanPath,
          planName: path.basename(maybePlanPath, path.extname(maybePlanPath)),
          referencedMarkdownFiles: []
        }
      } catch (error) {
        this.logger.warn('Failed to parse plan file, fallback to decomposition', {
          planPath: maybePlanPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const referencedMarkdown = this.resolveReferencedMarkdownContext(input, workspaceDir)
    if (referencedMarkdown.needsExistingFiles && referencedMarkdown.missingFiles.length > 0) {
      throw new Error(
        `请求依赖的 Markdown 文件不存在: ${referencedMarkdown.missingFiles.join(', ')}`
      )
    }
    const decompositionContext = this.buildReferencedMarkdownDecompositionContext(
      referencedMarkdown.existingFiles
    )

    return {
      subtasks: await this.decomposeTask(input, {
        agentCode: options.agentCode,
        category: options.category,
        abortSignal: options.abortSignal,
        workspaceDir,
        sessionId,
        decompositionContext
      }),
      source: 'decomposed',
      referencedMarkdownFiles: referencedMarkdown.existingFiles.map(file => file.resolvedPath)
    }
  }

  private async resolvePlanPath(
    input: string,
    sessionId: string,
    options: WorkflowOptions,
    workspaceDir: string
  ): Promise<string | undefined> {
    const candidates = new Set<string>()

    if (options.planPath) {
      candidates.add(options.planPath)
    }

    const fromInput = this.extractPlanPathFromInput(input)
    if (fromInput) {
      candidates.add(fromInput)
    }

    if (this.shouldPreferPlanExecution(input, options.agentCode)) {
      try {
        const boulder = BoulderStateService.getInstance()
        const state = await boulder.getState()
        const tracked = await boulder.isSessionTracked(sessionId)
        if (tracked && state.active_plan) {
          candidates.add(state.active_plan)
        }
      } catch (error) {
        this.logger.warn('Failed to read boulder state for plan resolution', {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    for (const candidate of candidates) {
      const normalized = this.normalizePlanPath(candidate, workspaceDir)
      if (fs.existsSync(normalized)) {
        return normalized
      }
    }

    return undefined
  }

  private shouldPreferPlanExecution(input: string, agentCode?: string): boolean {
    if (agentCode === 'kuafu') {
      return true
    }

    return /(执行计划|继续计划|run plan|execute plan|resume plan|按计划)/i.test(input)
  }

  private extractPlanPathFromInput(input: string): string | undefined {
    const match = input.match(/(?:[A-Za-z]:)?[^\s"'`]*\.sisyphus[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i)
    return match?.[0]
  }

  private normalizePlanPath(rawPath: string, workspaceDir: string): string {
    const trimmed = rawPath.trim().replace(/^["']|["']$/g, '')
    if (path.isAbsolute(trimmed)) {
      return path.normalize(trimmed)
    }
    return path.resolve(workspaceDir, trimmed)
  }

  private parsePlanSubtasks(planPath: string): SubTask[] {
    const content = fs.readFileSync(planPath, 'utf-8')
    const lines = content.split(/\r?\n/)
    const pending: Array<{
      logicalId: string
      description: string
      rawDependencies: string[]
      assignedAgent?: string
      assignedCategory?: string
    }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const checkboxMatch = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/)
      if (!checkboxMatch) continue

      const completed = checkboxMatch[1].toLowerCase() === 'x'
      if (completed) continue

      const rawDescription = checkboxMatch[2]
      const normalizedDescription = rawDescription
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const explicitId =
        normalizedDescription.match(/\bTask\s+([0-9]+(?:\.[0-9]+)*)\b/i)?.[1] ??
        normalizedDescription.match(/^([0-9]+(?:\.[0-9]+)*)[:：]/)?.[1]
      const logicalId = explicitId ?? String(pending.length + 1)
      const taskBlockLines: string[] = []

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/i.test(nextLine)) {
          break
        }
        if (!nextLine.trim()) {
          continue
        }
        taskBlockLines.push(nextLine)
      }

      const rawDependencies = [normalizedDescription, ...taskBlockLines].flatMap(blockLine =>
        this.extractDependencyIds(blockLine)
      )
      const executionHint = this.extractTaskExecutionHint([normalizedDescription, ...taskBlockLines])

      pending.push({
        logicalId,
        description: normalizedDescription,
        rawDependencies: Array.from(new Set(rawDependencies)),
        assignedAgent: executionHint.assignedAgent,
        assignedCategory: executionHint.assignedCategory
      })
    }

    const hasExplicitDependencies = pending.some(task => task.rawDependencies.length > 0)
    const knownIds = new Set(pending.map(task => task.logicalId))

    return pending.map((task, index) => {
      const safeId = task.logicalId.replace(/[^a-zA-Z0-9_.-]/g, '-')
      const explicitDependencies = task.rawDependencies
        .filter(dep => knownIds.has(dep))
        .map(dep => `plan-${dep.replace(/[^a-zA-Z0-9_.-]/g, '-')}`)
      const previous = index > 0 ? pending[index - 1].logicalId.replace(/[^a-zA-Z0-9_.-]/g, '-') : ''
      const dependencies = hasExplicitDependencies
        ? explicitDependencies
        : previous
          ? [`plan-${previous}`]
          : []
      return {
        id: `plan-${safeId}`,
        description: task.description,
        dependencies,
        assignedAgent: task.assignedAgent,
        assignedCategory: task.assignedCategory,
        source: 'plan'
      }
    })
  }

  private extractMarkdownPathCandidates(input: string): string[] {
    const matches = Array.from(input.matchAll(/(?:[A-Za-z]:)?[^\s"'`<>]+\.md\b/gi))
      .map(match => match[0].replace(/[，。,.!?;:]+$/u, '').trim())
      .filter(Boolean)
      .filter(candidate => !/\.sisyphus[\\/]+plans[\\/]/i.test(candidate))

    return Array.from(new Set(matches))
  }

  private shouldRequireReferencedFiles(input: string): boolean {
    return /(根据|基于|依据|按照|依照|参考|参照|from|based on|according to|per)\s+[^\n]*\.md/i.test(
      input
    )
  }

  private resolveReferencedMarkdownContext(
    input: string,
    workspaceDir: string
  ): ReferencedMarkdownContext {
    const candidates = this.extractMarkdownPathCandidates(input)
    if (candidates.length === 0) {
      return {
        existingFiles: [],
        missingFiles: [],
        needsExistingFiles: false
      }
    }

    const existingFiles: ReferencedMarkdownFile[] = []
    const missingFiles: string[] = []

    for (const candidate of candidates) {
      const resolvedPath = path.isAbsolute(candidate)
        ? path.normalize(candidate)
        : path.resolve(workspaceDir, candidate)

      if (fs.existsSync(resolvedPath)) {
        try {
          const stats = fs.statSync(resolvedPath)
          if (stats.isFile()) {
            existingFiles.push({
              rawPath: candidate,
              resolvedPath
            })
            continue
          }
        } catch (error) {
          this.logger.warn('Failed to stat referenced markdown file', {
            candidate,
            resolvedPath,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      missingFiles.push(candidate)
    }

    return {
      existingFiles,
      missingFiles,
      needsExistingFiles: this.shouldRequireReferencedFiles(input)
    }
  }

  private buildReferencedMarkdownDecompositionContext(
    referencedFiles: ReferencedMarkdownFile[]
  ): string | undefined {
    if (referencedFiles.length === 0) {
      return undefined
    }

    const snippets: string[] = []
    for (const file of referencedFiles.slice(0, 3)) {
      try {
        const content = fs.readFileSync(file.resolvedPath, 'utf-8').trim()
        if (!content) {
          continue
        }

        const clippedContent =
          content.length > 6000 ? `${content.slice(0, 6000)}\n[...截断...]` : content
        snippets.push(`FILE: ${file.rawPath}
PATH: ${file.resolvedPath}
CONTENT:
${clippedContent}`)
      } catch (error) {
        this.logger.warn('Failed to read referenced markdown file for decomposition context', {
          path: file.resolvedPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    if (snippets.length === 0) {
      return undefined
    }

    return snippets.join('\n\n---\n\n')
  }

  private extractDependencyIds(text: string): string[] {
    const normalized = text
      .replace(/[*`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const hasDependencyMarker = /(depends on|dependencies|dependency|blocked by|依赖|依赖于|前置|阻塞于|blocked-by|deps?)/i.test(
      normalized
    )
    if (!hasDependencyMarker) {
      return []
    }
    const dependencyPrefix =
      /(depends on|dependencies|dependency|blocked by|依赖|依赖于|前置|阻塞于|blocked-by|deps?)\s*[:：]\s*(.+)$/i
    const prefixMatch = normalized.match(dependencyPrefix)
    const targetText = prefixMatch ? prefixMatch[2] : normalized
    const ids = Array.from(targetText.matchAll(/(?:task\s*)?([0-9]+(?:\.[0-9]+)*)/gi)).map(match => match[1])
    return Array.from(new Set(ids))
  }

  private escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private extractTaskExecutionHint(lines: string[]): TaskExecutionProfile {
    const normalized = lines
      .map(line => line.replace(/[*`]/g, ' ').trim())
      .filter(Boolean)

    let assignedAgent: string | undefined
    let assignedCategory: string | undefined

    const subagentCandidates = Array.from(
      new Set([...KNOWN_SUBAGENT_CODES, ...Object.keys(SUBAGENT_ALIASES)])
    )
    const categoryCandidates = Array.from(
      new Set([...KNOWN_CATEGORY_CODES, ...Object.keys(CATEGORY_ALIASES)])
    )

    for (const line of normalized) {
      const explicitAssignee =
        line.match(/subagent_type\s*[:：=]\s*["']?([a-zA-Z0-9_-]+)["']?/i)?.[1] ||
        line.match(/task\s*\(\s*subagent_type\s*=\s*["']([a-zA-Z0-9_-]+)["']/i)?.[1] ||
        line.match(/call_omo_agent\s*\(\s*subagent_type\s*=\s*["']([a-zA-Z0-9_-]+)["']/i)?.[1] ||
        line.match(/(?:agent|代理|执行者|assignee)\s*[:：=]\s*([a-zA-Z0-9_-]+)/i)?.[1] ||
        line.match(/\[agent\s*[:：=]\s*([a-zA-Z0-9_-]+)\]/i)?.[1]
      if (explicitAssignee) {
        assignedAgent =
          assignedAgent || this.resolveCanonicalSubagent(explicitAssignee)
        assignedCategory =
          assignedCategory || this.resolveCanonicalCategory(explicitAssignee)
      }

      const categoryHint =
        line.match(/(?:category|类别)\s*[:：=]\s*([a-zA-Z0-9_-]+)/i)?.[1] ||
        line.match(/task\s*\(\s*category\s*=\s*["']([a-zA-Z0-9_-]+)["']\s*\)/i)?.[1]
      if (categoryHint) {
        assignedCategory =
          assignedCategory || this.resolveCanonicalCategory(categoryHint)
      }

      if (!assignedAgent) {
        const inlineSubagent = subagentCandidates.find(code =>
          new RegExp(`\\b${this.escapeForRegex(code)}\\b`, 'i').test(line)
        )
        if (inlineSubagent) {
          assignedAgent = this.resolveCanonicalSubagent(inlineSubagent)
        }
      }

      if (!assignedCategory) {
        const inlineCategory = categoryCandidates.find(code =>
          new RegExp(`\\b${this.escapeForRegex(code)}\\b`, 'i').test(line)
        )
        if (inlineCategory) {
          assignedCategory = this.resolveCanonicalCategory(inlineCategory)
        }
      }
    }

    return { assignedAgent, assignedCategory }
  }

  private selectSpecialistSubagentForTask(
    task: SubTask,
    orchestratorAgentCode?: string
  ): string | undefined {
    const text = task.description.toLowerCase()

    if (/(校验计划|计划审查|review plan|verify plan)/i.test(text)) {
      return 'leigong'
    }

    if (/(官方文档|api reference|best practice|benchmark|开源|external|第三方|社区)/i.test(text)) {
      return 'diting'
    }

    if (/(搜索|检索|定位|探索|scan|grep|find|context|代码库|仓库|规划文档|spec|readme|文档分析)/i.test(text)) {
      return 'qianliyan'
    }

    if (/(架构|评审|review|审查|debug|诊断|risk|风险)/i.test(text)) {
      return 'baize'
    }

    if (/(计划|歧义|澄清|clarify|ambigu|pre-plan|分析意图)/i.test(text)) {
      return 'chongming'
    }

    if (orchestratorAgentCode === 'haotian' && /(审查|复核|质量门禁|验收)/i.test(text)) {
      return 'leigong'
    }

    return undefined
  }

  private selectCategoryForTask(task: SubTask, workflowCategory?: string): string {
    const text = task.description.toLowerCase()

    if (/(前端|ui|组件|样式|css|layout|页面|动画|交互|响应式)/i.test(text)) {
      return 'zhinv'
    }

    if (/(文档撰写|编写文档|changelog|release note|技术写作|说明文档)/i.test(text)) {
      return 'cangjie'
    }

    if (/(创意|文案|命名|宣传|branding|creative)/i.test(text)) {
      return 'maliang'
    }

    if (/(深度|复杂重构|架构重构|性能优化|并发|安全加固|迁移)/i.test(text)) {
      return 'guixu'
    }

    if (/(复杂推理|算法|策略设计|复杂逻辑|proof|reasoning)/i.test(text)) {
      return 'guigu'
    }

    if (/(小改|微调|单文件|拼写|格式化|trivial|quick fix)/i.test(text)) {
      return 'tianbing'
    }

    if (/(实现|修复|feature|bug|refactor|重构|集成|后端|api|数据库|schema|migration|service|controller|单测|测试|test|ci|pipeline|deploy)/i.test(text)) {
      return this.normalizeWorkflowCategory(workflowCategory)
    }

    return this.normalizeWorkflowCategory(workflowCategory)
  }

  private reconcileExplicitCategory(
    explicitCategory: string,
    task: SubTask,
    workflowCategory?: string
  ): string {
    const text = task.description.toLowerCase()

    // Frontend/UI work must stay in UI category.
    if (/(前端|ui|组件|样式|css|layout|页面|动画|交互|响应式)/i.test(text)) {
      return 'zhinv'
    }

    // Documentation/writing tasks should not be routed to implementation categories.
    if (/(文档撰写|编写文档|changelog|release note|技术写作|说明文档|readme|docs?)/i.test(text)) {
      return 'cangjie'
    }

    // Implementation/back-end heavy work should not fall into quick/doc categories.
    if (
      /(实现|修复|feature|bug|refactor|重构|集成|后端|api|数据库|schema|migration|service|controller|测试|test|ci|pipeline|deploy)/i.test(
        text
      ) &&
      ['tianbing', 'cangjie'].includes(explicitCategory)
    ) {
      if (explicitCategory === 'tianbing' && /(quick|快速|小问题|小改|微调|单文件|trivial)/i.test(text)) {
        return 'tianbing'
      }
      return this.normalizeWorkflowCategory(workflowCategory)
    }

    return explicitCategory
  }

  private getUnactionableOutputReason(_task: SubTask, output: string): string | undefined {
    const normalized = output.trim()
    if (!normalized) {
      return 'empty-output'
    }

    const lower = normalized.toLowerCase()
    const capabilityFailurePatterns = [
      /read-?only/,
      /unable to .*?(modify|write|run|execute)/,
      /cannot .*?(modify|write|run|execute)/,
      /can't .*?(modify|write|run|execute)/,
      /please run .* yourself/,
      /无法.*?(修改|写入|运行|执行)/,
      /只读.*?(限制|环境)/,
      /当前环境.*?(限制|只读)/
    ]
    if (capabilityFailurePatterns.some(pattern => pattern.test(lower) || pattern.test(normalized))) {
      return 'capability-limited-output'
    }

    if (
      /\[(reject|rejected)\]/i.test(normalized) ||
      /(unable to proceed|cannot proceed|no \.sisyphus\/plans)/i.test(lower)
    ) {
      return 'explicit-rejection-output'
    }

    const hasConcreteEvidence = this.hasConcreteExecutionEvidence(normalized)

    if (
      /(conflicting instructions|first action|tool call|multi-tool|<analysis>|<results>)/i.test(lower) &&
      !hasConcreteEvidence
    ) {
      return 'meta-process-output'
    }

    // Detect obvious status-only placeholders that indicate no real execution happened.
    const firstMeaningfulLine = normalized
      .split(/\r?\n/)
      .map(line => this.normalizeOutputLineForHeuristics(line))
      .find(Boolean)
    const singleLine = this.normalizeOutputLineForHeuristics(normalized)
    const statusPrefixPattern =
      /^(planning|considering|listing|reading|searching|extracting|inspecting|clarifying|analyzing|reviewing|checking|preparing|scanning|examining|deciding|confirming|exploring|starting|investigating|understanding|organizing)\b/i
    if (
      (firstMeaningfulLine && statusPrefixPattern.test(firstMeaningfulLine)) ||
      statusPrefixPattern.test(singleLine) ||
      /^(计划|正在|搜索|列出|读取)/.test(singleLine)
    ) {
      if (singleLine.length <= 180 && !hasConcreteEvidence) {
        return 'status-only-placeholder'
      }
    }

    return undefined
  }

  private normalizeOutputLineForHeuristics(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<\/?[a-z_:-]+>/gi, ' ')
      .replace(/[*_`>#-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  private hasConcreteExecutionEvidence(output: string): boolean {
    if (/(变更文件|修改文件|changed files|modified files|验证命令|测试命令|测试结果|部署地址|verification|test command|diff)/i.test(output)) {
      return true
    }

    if (
      /(?:^|[\s`'"])(?:\/|[A-Za-z]:[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[^\s`'"]+\.[A-Za-z0-9]{1,12}(?=$|[\s`'",:;!?()[\]])/m.test(
        output
      )
    ) {
      return true
    }

    if (
      /(?:^|\n)\s*(?:\$ ?)?(?:pnpm|npm|yarn|bun|npx|node|vitest|jest|pytest|go test|cargo test|mvn|gradle|docker|kubectl|curl|wget|bash)\b/im.test(
        output
      )
    ) {
      return true
    }

    return false
  }

  private resolveTaskExecutionProfile(
    task: SubTask,
    orchestratorAgentCode?: string,
    workflowCategory?: string
  ): TaskExecutionProfile {
    const explicitCategory =
      this.resolveCanonicalCategory(task.assignedCategory) ||
      this.resolveCanonicalCategory(task.assignedAgent)

    if (explicitCategory) {
      return {
        assignedCategory: this.reconcileExplicitCategory(explicitCategory, task, workflowCategory)
      }
    }

    const explicitAgent = this.resolveCanonicalSubagent(task.assignedAgent)
    if (explicitAgent) {
      return {
        assignedAgent: this.normalizeAssignedAgent(explicitAgent, task, orchestratorAgentCode)
      }
    }

    const specialist = this.selectSpecialistSubagentForTask(task, orchestratorAgentCode)
    if (specialist) {
      return {
        assignedAgent: this.normalizeAssignedAgent(specialist, task, orchestratorAgentCode)
      }
    }

    return {
      assignedCategory: this.selectCategoryForTask(task, workflowCategory)
    }
  }

  private normalizeAssignedAgent(
    assignedAgent: string,
    task: SubTask,
    orchestratorAgentCode?: string
  ): string {
    const canonical = this.resolveCanonicalSubagent(assignedAgent)
    if (!canonical) {
      const fallbackCategory = this.selectCategoryForTask(task)
      return CATEGORY_TO_FALLBACK_SUBAGENT[fallbackCategory] || 'luban'
    }

    if (!NON_WORKER_ASSIGNEES.has(canonical)) {
      return canonical
    }

    const fallbackAgent = this.selectSpecialistSubagentForTask(task, orchestratorAgentCode)
    if (fallbackAgent && !NON_WORKER_ASSIGNEES.has(fallbackAgent)) {
      return fallbackAgent
    }

    const fallbackCategory = this.selectCategoryForTask(task)
    return CATEGORY_TO_FALLBACK_SUBAGENT[fallbackCategory] || 'luban'
  }

  private buildDependencyContext(task: SubTask, results: Map<string, string>): string {
    if (task.dependencies.length === 0) {
      return '无前置依赖结果。'
    }

    const lines = task.dependencies.map(dep => {
      const dependencyOutput = results.get(dep)?.trim()
      if (!dependencyOutput) {
        return `- ${dep}: (无可用输出)`
      }

      const compactOutput =
        dependencyOutput.length > 600 ? `${dependencyOutput.slice(0, 600)}\n[...截断...]` : dependencyOutput
      return `- ${dep}:\n${compactOutput}`
    })

    return lines.join('\n')
  }

  private buildTaskPrompt(
    task: SubTask,
    taskSource: 'decomposed' | 'plan',
    dependencyContext: string,
    contract: TaskPromptContract,
    referencedMarkdownFiles: string[] = []
  ): string {
    const normalizedReferencedMarkdownFiles = Array.from(
      new Set(referencedMarkdownFiles.map(file => file.trim()).filter(Boolean))
    )
    const specContextLines =
      normalizedReferencedMarkdownFiles.length > 0
        ? [
            '- referenced_specs:',
            ...normalizedReferencedMarkdownFiles.map(file => `  - ${file}`),
            '- 如果任务涉及上述规格文件，必须先读取并按规格执行。'
          ]
        : ['- referenced_specs: (none)']

    if (contract.intent === 'analysis') {
      return [
        'TASK:',
        task.description,
        '',
        'EXPECTED OUTCOME:',
        '输出一份可直接复用的分析结果，必须包含证据、发现和风险结论，不允许过程性占位文本。',
        '',
        'REQUIRED TOOLS:',
        'read, grep, glob, webfetch（按可用工具最小化使用）',
        '',
        'MUST DO:',
        '- 必须给出结构化结果，使用以下标题：EVIDENCE_PATHS / KEY_FINDINGS / RISKS_AND_CONCLUSIONS。',
        '- EVIDENCE_PATHS 至少 3 条（文件路径或明确来源）。',
        '- KEY_FINDINGS 至少 3 条，并与证据对应。',
        '- RISKS_AND_CONCLUSIONS 至少 2 条，必须可执行、可决策。',
        '- 禁止输出“准备中/计划中/将要进行”等过程性状态。',
        '',
        'MUST NOT DO:',
        '- 不得修改任何文件。',
        '- 不得仅输出泛化建议或空白内容。',
        '- 不得重复上轮失败输出。',
        '',
        'CONTEXT:',
        `- task_source: ${taskSource}`,
        `- workflow_phase: ${contract.workflowPhase}`,
        `- workflow_read_only: ${contract.readOnly}`,
        ...specContextLines,
        '- dependencies_output:',
        dependencyContext
      ].join('\n')
    }

    const implementationMustDo = contract.readOnly
      ? [
          '- 当前工作流是只读模式：请输出可执行实现方案与验证方案，不得改代码。',
          '- 方案中需明确涉及文件路径、拟改动点、验证命令。'
        ]
      : [
          '- 必须在仓库中落地真实改动，不允许只给建议。',
          '- 列出实际改动文件路径与关键修改点。',
          '- 至少提供一条验证命令及关键输出。'
        ]
    const implementationSpecMustDo =
      normalizedReferencedMarkdownFiles.length > 0
        ? [
            '- 必须先读取 referenced_specs 中的规划/规格文件，再开始实现。',
            '- 输出中必须包含 SPEC_COVERAGE 小节：列出已覆盖的规划条目及对应改动文件。'
          ]
        : []

    return [
      'TASK:',
      task.description,
      '',
      'EXPECTED OUTCOME:',
      contract.readOnly
        ? '产出实现级可执行方案与验证证据（只读模式，不改文件）。'
        : '产出可验证的实际执行结果：完成实现/修复并给出验证证据。',
      '',
      'REQUIRED TOOLS:',
      'read, write/edit, bash, grep, glob（按任务需要最小化使用）',
      '',
      'MUST DO:',
      ...implementationMustDo,
      ...implementationSpecMustDo,
      '',
      'MUST NOT DO:',
      '- 不得仅返回泛化建议或待办清单。',
      '- 不得在未验证情况下声明完成。',
      '- 不得输出过程性占位文本。',
      '',
      'CONTEXT:',
      `- task_source: ${taskSource}`,
      `- workflow_phase: ${contract.workflowPhase}`,
      `- workflow_read_only: ${contract.readOnly}`,
      ...specContextLines,
      '- dependencies_output:',
      dependencyContext
    ].join('\n')
  }

  private shouldRequireOrchestratorCheckpoint(agentCode?: string): boolean {
    return this.isPrimaryOrchestrator(agentCode)
  }

  private buildCheckpointResultPreview(output: string): string {
    const trimmed = output.trim()
    if (!trimmed) {
      return '(无输出)'
    }

    if (trimmed.length <= ORCHESTRATOR_CHECKPOINT_RESULT_PREVIEW) {
      return trimmed
    }

    return [
      trimmed.slice(0, ORCHESTRATOR_CHECKPOINT_PREVIEW_HEAD),
      '[...中间截断...]',
      trimmed.slice(-ORCHESTRATOR_CHECKPOINT_PREVIEW_TAIL)
    ].join('\n')
  }

  private collectCheckpointEvidenceSignals(output: string): string[] {
    const signals: string[] = []
    const normalized = output.trim()
    if (!normalized) {
      return signals
    }

    if (/(变更文件|修改文件|changed files|modified files|diff)/i.test(normalized)) {
      signals.push('changed-files-marker')
    }

    if (/(验证命令|测试命令|verification|test command|prisma validate|pnpm|npm|vitest|jest|pytest|go test|cargo test|tsc --noEmit)/i.test(normalized)) {
      signals.push('verification-command')
    }

    const pathPattern =
      /(?:^|[\s`'"])(?:\/|[A-Za-z]:[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[^\s`'"]+\.[A-Za-z0-9]{1,12}(?=$|[\s`'",:;!?()[\]])/gm
    const pathMatches = normalized.match(pathPattern)
    if (pathMatches && pathMatches.length > 0) {
      signals.push(`file-paths:${Math.min(pathMatches.length, 6)}+`)
    }

    return signals.slice(0, 3)
  }

  private shouldDowngradeNoEvidenceHalt(
    input: OrchestratorCheckpointInput,
    parsed: OrchestratorCheckpointDecision
  ): boolean {
    if (parsed.status !== 'halt') {
      return false
    }
    if (!ORCHESTRATOR_NO_EVIDENCE_REASON_PATTERN.test(parsed.reason || '')) {
      return false
    }
    if (input.recentlyCompletedTasks.length === 0) {
      return false
    }

    return input.recentlyCompletedTasks.every(task =>
      this.hasConcreteExecutionEvidence(input.results.get(task.id) || '')
    )
  }

  private shouldAttemptCheckpointHaltRecovery(reason?: string): boolean {
    return ORCHESTRATOR_RECOVERABLE_HALT_REASON_PATTERN.test(reason || '')
  }

  private selectCheckpointRecoveryTargets(reason: string | undefined, candidates: SubTask[]): SubTask[] {
    if (!reason || candidates.length === 0) {
      return candidates
    }

    const candidateIds = new Set(candidates.map(task => task.id))
    const tokenMatches = reason.match(/[A-Za-z][A-Za-z0-9_.-]*-[A-Za-z0-9_.-]+/g) || []
    const matchedIds = Array.from(
      new Set(
        tokenMatches
          .map(token => token.replace(/[.,;:!?()[\]{}"']/g, ''))
          .filter(token => candidateIds.has(token))
      )
    )

    if (matchedIds.length === 0) {
      return candidates
    }

    const matchedSet = new Set(matchedIds)
    return candidates.filter(task => matchedSet.has(task.id))
  }

  private buildCheckpointHaltRecoveryPrompt(
    basePrompt: string,
    reason: string,
    attempt: number,
    phase: OrchestratorCheckpointPhase
  ): string {
    return [
      basePrompt,
      '',
      'CHECKPOINT HALT RECOVERY (MANDATORY):',
      `- 本任务在 orchestrator checkpoint (${phase}) 被拦截，恢复尝试次数: ${attempt}/${CHECKPOINT_HALT_RECOVERY_MAX_ATTEMPTS}。`,
      `- 拦截原因: ${reason}`,
      '- 必须输出可验证的执行证据，不得只给计划/意图/待办。',
      '- 证据至少包含：',
      '  1) Changed files（真实文件路径）',
      '  2) Verification command（至少一条命令 + 关键输出）',
      '  3) 若涉及数据库，明确 schema/migration 校验结果。'
    ].join('\n')
  }

  private buildOrchestratorCheckpointPrompt(
    input: Pick<
      OrchestratorCheckpointInput,
      | 'workflowId'
      | 'phase'
      | 'userInput'
      | 'recentlyCompletedTasks'
      | 'readyTasks'
      | 'results'
      | 'executions'
    >
  ): string {
    const completedSection = input.recentlyCompletedTasks
      .map(task => {
        const execution = input.executions.get(task.id)
        const assigned = execution?.assignedAgent || execution?.assignedCategory || 'unknown'
        const model = execution?.model ? ` (${execution.model})` : ''
        const output = input.results.get(task.id) || ''
        const outputPreview = this.buildCheckpointResultPreview(output)
          .split('\n')
          .map(line => `    ${line}`)
          .join('\n')
        const evidenceSignals = this.collectCheckpointEvidenceSignals(output)
        const evidenceSection =
          evidenceSignals.length > 0
            ? evidenceSignals.map(signal => `    - ${signal}`).join('\n')
            : '    - (none-detected-by-engine)'

        return [
          `- id: ${task.id}`,
          `  description: ${task.description}`,
          `  assigned: ${assigned}${model}`,
          `  evidence_detected: ${this.hasConcreteExecutionEvidence(output) ? 'yes' : 'no'}`,
          '  evidence_signals:',
          evidenceSection,
          '  output_preview:',
          outputPreview
        ].join('\n')
      })
      .join('\n')

    const readySection =
      input.readyTasks.length > 0
        ? input.readyTasks.map(task => `- ${task.id}: ${task.description}`).join('\n')
        : '- (none)'

    return [
      '你正在执行主代理调度检查点（orchestrator checkpoint）。',
      '目标：先复核已完成子任务结果，再决定下一波可以派发的任务。',
      '',
      `WORKFLOW_ID: ${input.workflowId}`,
      `CHECKPOINT_PHASE: ${input.phase}`,
      'ORIGINAL_USER_REQUEST:',
      input.userInput,
      '',
      'NEWLY_COMPLETED_SUBTASK_REPORTS:',
      completedSection || '- (none)',
      '',
      'READY_TASK_CANDIDATES:',
      readySection,
      '',
      'DECISION RULES:',
      '- 仅可从 READY_TASK_CANDIDATES 中选择 approved_task_ids。',
      '- 若发现关键问题（结果不可信/依赖不满足/需要重规划），status 必须为 "halt" 并写 reason。',
      '- 若 evidence_detected = yes，不得仅因为 output_preview 看起来像摘要/计划而判定“无证据”。',
      '- 若允许继续，status 设为 "continue"。',
      '- 当 CHECKPOINT_PHASE = final 且 READY_TASK_CANDIDATES 为空时，approved_task_ids 应为空数组。',
      '- 禁止调用工具，禁止输出解释性长文。',
      '',
      'RETURN JSON ONLY:',
      '{',
      '  "status": "continue" | "halt",',
      '  "approved_task_ids": ["task-id-1", "task-id-2"],',
      '  "reason": "optional short reason"',
      '}'
    ].join('\n')
  }

  private parseOrchestratorCheckpointDecision(
    rawOutput: string,
    readyTaskIds: Set<string>,
    persistedTaskId: string
  ): OrchestratorCheckpointDecision | null {
    const trimmed = rawOutput.trim()
    if (!trimmed) {
      return null
    }

    const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1]
    const jsonCandidate = fencedJson || trimmed.match(/\{[\s\S]*\}/)?.[0]
    if (!jsonCandidate) {
      return null
    }

    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
      const statusText = typeof parsed.status === 'string' ? parsed.status.trim().toLowerCase() : ''
      const explicitHalt = parsed.halt === true
      const status: 'continue' | 'halt' =
        explicitHalt ||
        /^(halt|stop|blocked|block|cancel|canceled|failed|fail)$/.test(statusText)
          ? 'halt'
          : 'continue'

      const candidateLists = [
        parsed.approved_task_ids,
        parsed.approvedTaskIds,
        parsed.next_task_ids,
        parsed.nextTaskIds,
        parsed.dispatch_task_ids,
        parsed.dispatchTaskIds
      ]

      const approvedTaskIds = Array.from(
        new Set(
          candidateLists
            .filter((value): value is unknown[] => Array.isArray(value))
            .flatMap(value =>
              value
                .filter((item): item is string => typeof item === 'string')
                .map(item => item.trim())
                .filter(item => item.length > 0 && readyTaskIds.has(item))
            )
        )
      )

      const reasonCandidate = [
        parsed.reason,
        parsed.block_reason,
        parsed.blockReason,
        parsed.message
      ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)

      return {
        status,
        approvedTaskIds,
        reason: reasonCandidate?.trim(),
        persistedTaskId,
        rawOutput: trimmed
      }
    } catch (error) {
      this.logger.warn('[workforce] Failed to parse orchestrator checkpoint JSON', {
        error: error instanceof Error ? error.message : String(error),
        preview: trimmed.slice(0, 220)
      })
      return null
    }
  }

  private async runOrchestratorCheckpoint(
    input: OrchestratorCheckpointInput
  ): Promise<OrchestratorCheckpointDecision | null> {
    if (input.readyTasks.length === 0 && input.recentlyCompletedTasks.length === 0) {
      return null
    }

      const prompt = this.buildOrchestratorCheckpointPrompt({
        workflowId: input.workflowId,
        phase: input.phase,
        userInput: input.userInput,
        recentlyCompletedTasks: input.recentlyCompletedTasks,
        readyTasks: input.readyTasks,
      results: input.results,
      executions: input.executions
    })

    try {
      const checkpointResult = await this.delegateEngine.delegateTask({
        sessionId: input.sessionId,
        description: `Orchestrator checkpoint review (${input.workflowId})`,
        prompt,
        subagent_type: input.orchestratorAgentCode,
        parentTaskId: input.workflowId,
        useDynamicPrompt: false,
        availableTools: [],
        abortSignal: input.abortSignal,
        metadata: {
          workflowId: input.workflowId,
          orchestrationCheckpoint: true,
          checkpointPhase: input.phase,
          reportedTaskIds: input.recentlyCompletedTasks.map(task => task.id),
          readyTaskIds: input.readyTasks.map(task => task.id)
        }
      })

      if (!checkpointResult.success) {
        this.logger.warn('[workforce] Orchestrator checkpoint returned unsuccessful status', {
          workflowId: input.workflowId,
          orchestratorAgent: input.orchestratorAgentCode,
          outputPreview: checkpointResult.output.slice(0, 220)
        })
        return null
      }

      const parsed = this.parseOrchestratorCheckpointDecision(
        checkpointResult.output,
        new Set(input.readyTasks.map(task => task.id)),
        checkpointResult.taskId
      )

      if (parsed && this.shouldDowngradeNoEvidenceHalt(input, parsed)) {
        const approvedTaskIds =
          parsed.approvedTaskIds.length > 0 ? parsed.approvedTaskIds : input.readyTasks.map(task => task.id)
        const completedTaskIds = input.recentlyCompletedTasks.map(task => task.id)
        this.logger.warn(
          '[workforce] Orchestrator checkpoint halt downgraded to continue due concrete evidence',
          {
            workflowId: input.workflowId,
            orchestratorAgent: input.orchestratorAgentCode,
            checkpointPhase: input.phase,
            completedTaskIds,
            approvedTaskIds,
            reason: parsed.reason
          }
        )

        return {
          ...parsed,
          status: 'continue',
          approvedTaskIds,
          reason: parsed.reason
            ? `${parsed.reason} [auto-downgraded: concrete evidence detected]`
            : 'auto-downgraded: concrete evidence detected'
        }
      }

      if (!parsed) {
        this.logger.warn('[workforce] Orchestrator checkpoint output not parseable, fallback to DAG', {
          workflowId: input.workflowId,
          orchestratorAgent: input.orchestratorAgentCode,
          outputPreview: checkpointResult.output.slice(0, 220)
        })
      }

      return parsed
    } catch (error) {
      if (input.abortSignal?.aborted) {
        throw error
      }

      if (error instanceof Error && /(cancelled by user|canceled by user|request aborted)/i.test(error.message)) {
        throw error
      }

      this.logger.warn('[workforce] Orchestrator checkpoint failed, fallback to DAG scheduling', {
        workflowId: input.workflowId,
        orchestratorAgent: input.orchestratorAgentCode,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private canAttemptActionabilityRecovery(reason: string, attempt: number): boolean {
    return attempt < ACTIONABILITY_RECOVERY_MAX_ATTEMPTS && ACTIONABILITY_RECOVERY_REASONS.has(reason)
  }

  private canAttemptModelFallback(reason: string, attempt: number): boolean {
    if (attempt >= MODEL_FALLBACK_MAX_ATTEMPTS) {
      return false
    }
    return reason === 'empty-output' || ACTIONABILITY_RECOVERY_REASONS.has(reason)
  }

  private buildActionabilityRecoveryPrompt(
    basePrompt: string,
    reason: string,
    previousOutput: string,
    attempt: number,
    intent: TaskIntent
  ): string {
    const compactPreviousOutput =
      previousOutput.length > 800
        ? `${previousOutput.slice(0, 800)}\n[...截断...]`
        : previousOutput

    const evidenceDirective =
      intent === 'analysis'
        ? [
            '- 必须输出 EVIDENCE_PATHS / KEY_FINDINGS / RISKS_AND_CONCLUSIONS 三段结构。',
            '- 每段内容必须具备可验证信息，不允许状态描述。'
          ]
        : [
            '- 必须直接给出可交付结果，并包含以下证据：',
            '  1) 真实改动文件路径（或只读模式下的拟改动路径与方案依据）。',
            '  2) 至少一条验证命令与关键输出。'
          ]

    return [
      basePrompt,
      '',
      'ACTIONABILITY RECOVERY DIRECTIVE:',
      `- 上一轮输出被判定为非可执行结果（reason: ${reason}，attempt: ${attempt}）。`,
      '- 本轮禁止状态汇报、计划说明、流程解释。',
      ...evidenceDirective,
      '',
      'PREVIOUS OUTPUT (DO NOT REPEAT):',
      compactPreviousOutput
    ].join('\n')
  }

  private buildModelFallbackPrompt(
    basePrompt: string,
    reason: string,
    previousOutput: string,
    attempt: number,
    modelSpec: string,
    intent: TaskIntent
  ): string {
    return [
      this.buildActionabilityRecoveryPrompt(basePrompt, reason, previousOutput, attempt, intent),
      '',
      'MODEL FALLBACK DIRECTIVE:',
      `- 已切换模型重试（fallback_attempt: ${attempt}, model: ${modelSpec}）。`,
      '- 必须输出最终交付结果，禁止重复失败内容。'
    ].join('\n')
  }

  private hasCredentialedApiKey(model: {
    apiKey: string | null
    apiKeyRef?: { encryptedKey: string; baseURL: string } | null
  }): boolean {
    const secureStorage = SecureStorageService.getInstance()
    const decryptedKey = model.apiKeyRef?.encryptedKey
      ? secureStorage.decrypt(model.apiKeyRef.encryptedKey)
      : model.apiKey
        ? secureStorage.decrypt(model.apiKey)
        : ''
    return Boolean(decryptedKey?.trim())
  }

  private async pickAlternativeModelSpec(excluded: Set<string>): Promise<string | undefined> {
    const models = await this.prisma.model.findMany({
      include: { apiKeyRef: true },
      orderBy: { updatedAt: 'desc' }
    })

    for (const model of models) {
      if (!this.hasCredentialedApiKey(model)) {
        continue
      }

      const modelName = model.modelName.trim()
      const modelSpec = `${model.provider}/${modelName}`
      const tokens = [modelName.toLowerCase(), modelSpec.toLowerCase()]

      if (tokens.some(token => excluded.has(token))) {
        continue
      }

      return modelSpec
    }

    return undefined
  }

  async executeWorkflow(input: string, options?: WorkflowOptions): Promise<WorkflowResult>
  async executeWorkflow(
    input: string,
    sessionId: string,
    options?: WorkflowOptions
  ): Promise<WorkflowResult>
  async executeWorkflow(
    input: string,
    sessionIdOrOptions?: string | WorkflowOptions,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const resolvedSessionId =
      typeof sessionIdOrOptions === 'string' ? sessionIdOrOptions : undefined
    const resolvedOptions =
      typeof sessionIdOrOptions === 'string' ? options : (sessionIdOrOptions ?? {})

    if (!resolvedSessionId) {
      throw new Error('sessionId is required for workflow execution')
    }

    const {
      category: requestedCategory = 'dayu',
      agentCode,
      retryConfig,
      enableRetry = true,
      abortSignal
    } = resolvedOptions
    const category = this.normalizeWorkflowCategory(requestedCategory)
    const orchestratorAgentCode = this.resolveCanonicalSubagent(agentCode) || agentCode
    const checkpointEnabled = this.shouldRequireOrchestratorCheckpoint(orchestratorAgentCode)
    const readOnlyRequested = this.isReadOnlyWorkflowRequest(input)
    const normalizedOptions: WorkflowOptions = {
      ...resolvedOptions,
      category
    }
    const retryService = enableRetry ? getTaskRetryService(retryConfig) : null
    const taskRetryStates = new Map<string, RetryState>()
    const orchestratorCheckpoints: OrchestratorCheckpointRecord[] = []
    const cancellationMessage = 'Workflow cancelled by user'
    const isAbortRequested = (error?: unknown): boolean => {
      if (abortSignal?.aborted) return true
      if (!error || !(error instanceof Error)) return false
      const message = error.message.toLowerCase()
      return (
        message.includes('cancelled by user') ||
        message.includes('canceled by user') ||
        message.includes('workflow cancelled by user') ||
        message.includes('request aborted by user')
      )
    }
    const throwIfAborted = () => {
      if (abortSignal?.aborted) {
        throw new Error(cancellationMessage)
      }
    }

    const workflow = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.task.create({
        data: {
          sessionId: resolvedSessionId,
          type: 'workflow',
          input,
          status: 'running',
          metadata: { category, enableRetry, readOnlyRequested }
        }
      })
    })

    this.logger.info('Executing workflow', { workflowId: workflow.id, input, enableRetry })

    try {
      const workspaceDir = await this.resolveWorkspaceDirForSession(resolvedSessionId)
      this.logger.info('[workforce] Resolved session workspace context', {
        workflowId: workflow.id,
        sessionId: resolvedSessionId,
        workspaceDir,
        agentCode: orchestratorAgentCode
      })
      throwIfAborted()
      const taskResolution = await this.resolveWorkflowTasks(
        input,
        resolvedSessionId,
        normalizedOptions,
        workspaceDir
      )
      throwIfAborted()
      const profiledSubtasks = taskResolution.subtasks.map(task => {
        const profile = this.resolveTaskExecutionProfile(task, orchestratorAgentCode, category)
        return {
          ...task,
          assignedAgent: profile.assignedAgent,
          assignedCategory: profile.assignedCategory
        }
      })
      const subtasks = this.applyOrchestratorWorkflowPolicy(profiledSubtasks, {
        input,
        agentCode: orchestratorAgentCode,
        source: taskResolution.source,
        workflowCategory: category,
        readOnlyRequested
      })
      const dag = this.buildDAG(subtasks)
      const results = new Map<string, string>()
      const executions = new Map<string, WorkflowTaskExecution>()
      const completed = new Set<string>()
      const failed = new Set<string>()
      const inProgress = new Set<string>()
      const logicalToPersistedTaskId = new Map<string, string>()
      const reportedToOrchestrator = new Set<string>()
      const checkpointRecoveryAttempts = new Map<string, number>()
      const checkpointRecoveryReasons = new Map<string, string>()
      const checkpointRecoveryPhases = new Map<string, OrchestratorCheckpointPhase>()
      let preDispatchCheckpointExecuted = false

      const recordOrchestratorCheckpoint = (params: {
        phase: OrchestratorCheckpointPhase
        status: OrchestratorCheckpointRecord['status']
        reportedTaskIds: string[]
        readyTaskIds: string[]
        approvedTaskIds?: string[]
        reason?: string
        persistedTaskId?: string
      }) => {
        const record: OrchestratorCheckpointRecord = {
          timestamp: new Date().toISOString(),
          phase: params.phase,
          status: params.status,
          reportedTaskIds: params.reportedTaskIds,
          readyTaskIds: params.readyTaskIds,
          approvedTaskIds: params.approvedTaskIds || [],
          reason: params.reason,
          persistedTaskId: params.persistedTaskId
        }
        orchestratorCheckpoints.push(record)

        workflowEvents.emit({
          type: 'workflow:checkpoint',
          workflowId: workflow.id,
          taskId: params.persistedTaskId || workflow.id,
          timestamp: new Date(),
          data: {
            phase: params.phase,
            status: params.status,
            approvedTaskIds: record.approvedTaskIds,
            reason: params.reason,
            persistedTaskId: params.persistedTaskId,
            reportedTaskIds: params.reportedTaskIds,
            readyTaskIds: params.readyTaskIds
          }
        })
      }

      const scheduleCheckpointRecovery = (params: {
        phase: OrchestratorCheckpointPhase
        reason: string
        targets: SubTask[]
      }): { recoveredTaskIds: string[]; exhaustedTaskIds: string[] } => {
        const recoveredTaskIds: string[] = []
        const exhaustedTaskIds: string[] = []

        for (const task of params.targets) {
          const nextAttempt = (checkpointRecoveryAttempts.get(task.id) || 0) + 1
          if (nextAttempt > CHECKPOINT_HALT_RECOVERY_MAX_ATTEMPTS) {
            exhaustedTaskIds.push(task.id)
            continue
          }

          checkpointRecoveryAttempts.set(task.id, nextAttempt)
          checkpointRecoveryReasons.set(task.id, params.reason)
          checkpointRecoveryPhases.set(task.id, params.phase)

          completed.delete(task.id)
          failed.delete(task.id)
          inProgress.delete(task.id)
          reportedToOrchestrator.delete(task.id)
          results.delete(task.id)
          executions.delete(task.id)
          logicalToPersistedTaskId.delete(task.id)
          recoveredTaskIds.push(task.id)
        }

        return { recoveredTaskIds, exhaustedTaskIds }
      }

      const executeTask = async (task: SubTask): Promise<void> => {
        throwIfAborted()
        inProgress.add(task.id)
        const taskFullId = `${workflow.id}:${task.id}`
        const profile = this.resolveTaskExecutionProfile(task, orchestratorAgentCode, category)
        const assignedAgent = profile.assignedAgent
        const assignedCategory = profile.assignedCategory
        const assignedTarget = assignedAgent || assignedCategory || category
        const dependencyTaskIds = task.dependencies
          .map(depId => logicalToPersistedTaskId.get(depId))
          .filter((depId): depId is string => Boolean(depId))

        workflowEvents.emit({
          type: 'task:assigned',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(),
          data: {
            description: task.description,
            assignedAgent: assignedTarget
          }
        })

        workflowEvents.emit({
          type: 'task:started',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(),
          data: { description: task.description, assignedAgent: assignedTarget }
        })

        const taskOperation = async () => {
          throwIfAborted()
          const dependencyContext = this.buildDependencyContext(task, results)
          const promptContract = this.buildTaskPromptContract(task, readOnlyRequested)
          const checkpointRecoveryReason = checkpointRecoveryReasons.get(task.id)
          const checkpointRecoveryAttempt = checkpointRecoveryAttempts.get(task.id) || 0
          const checkpointRecoveryPhase = checkpointRecoveryPhases.get(task.id)
          const basePrompt = this.buildTaskPrompt(
            task,
            taskResolution.source,
            dependencyContext,
            promptContract,
            taskResolution.referencedMarkdownFiles || []
          )
          const recoveryPrompt =
            checkpointRecoveryReason && checkpointRecoveryAttempt > 0
              ? this.buildCheckpointHaltRecoveryPrompt(
                  basePrompt,
                  checkpointRecoveryReason,
                  checkpointRecoveryAttempt,
                  checkpointRecoveryPhase || 'between-waves'
                )
              : basePrompt
          const baseMetadata: Record<string, unknown> = {
            dependencies: dependencyTaskIds,
            logicalTaskId: task.id,
            logicalDependencies: task.dependencies,
            taskSource: task.source ?? taskResolution.source,
            assignedAgent,
            assignedCategory,
            workflowPhase: task.workflowPhase || 'execution',
            taskIntent: promptContract.intent,
            readOnlyRequested,
            workflowId: workflow.id,
            workflowCategory: category,
            planPath: taskResolution.planPath,
            planName: taskResolution.planName,
            referencedMarkdownFiles: taskResolution.referencedMarkdownFiles || [],
            checkpointRecoveryAttempt,
            checkpointRecoveryPhase,
            checkpointRecoveryReason
          }

          let actionabilityRecoveryAttempt = 0
          let modelFallbackAttempt = 0
          let prompt = recoveryPrompt
          let overrideModelSpec: string | undefined
          const attemptedModelTokens = new Set<string>()

          for (;;) {
            const delegateInput: Parameters<DelegateEngine['delegateTask']>[0] = {
              description: task.description,
              prompt,
              sessionId: resolvedSessionId,
              // First pass keeps dynamic prompt. Recovery pass falls back to static agent prompt
              // to reduce repeated status-only placeholders caused by over-generic orchestration cues.
              useDynamicPrompt: actionabilityRecoveryAttempt === 0 && modelFallbackAttempt === 0,
              parentTaskId: workflow.id,
              abortSignal,
              metadata: {
                ...baseMetadata,
                actionabilityRecoveryAttempt,
                modelFallbackAttempt,
                overrideModelSpec
              }
            }
            if (assignedCategory) {
              delegateInput.category = assignedCategory
            } else {
              delegateInput.subagent_type = assignedAgent || 'luban'
            }
            if (overrideModelSpec) {
              delegateInput.model = overrideModelSpec
            }

            const result = await this.delegateEngine.delegateTask(delegateInput)
            if (!result.success) {
              throw new Error(result.output || 'Delegate task returned unsuccessful status')
            }

            const rawOutput = typeof result.output === 'string' ? result.output : ''
            const outputText = rawOutput.trim()
            if (result.model?.trim()) {
              attemptedModelTokens.add(result.model.trim().toLowerCase())
            }
            if (overrideModelSpec?.trim()) {
              const normalizedSpec = overrideModelSpec.trim().toLowerCase()
              attemptedModelTokens.add(normalizedSpec)
              if (normalizedSpec.includes('/')) {
                attemptedModelTokens.add(normalizedSpec.split('/').slice(1).join('/'))
              }
            }

            const unactionableReason = outputText
              ? this.getUnactionableOutputReason(task, outputText)
              : 'empty-output'
            if (!unactionableReason) {
              return result
            }

            this.logger.warn('Delegate task returned non-actionable output', {
              workflowId: workflow.id,
              taskId: task.id,
              reason: unactionableReason,
              actionabilityRecoveryAttempt,
              modelFallbackAttempt,
              overrideModelSpec: overrideModelSpec || null,
              outputPreview: outputText.slice(0, 220)
            })

            if (this.canAttemptActionabilityRecovery(unactionableReason, actionabilityRecoveryAttempt)) {
              actionabilityRecoveryAttempt++
              prompt = this.buildActionabilityRecoveryPrompt(
                basePrompt,
                unactionableReason,
                rawOutput,
                actionabilityRecoveryAttempt,
                promptContract.intent
              )
              continue
            }

            if (this.canAttemptModelFallback(unactionableReason, modelFallbackAttempt)) {
              const fallbackModelSpec = await this.pickAlternativeModelSpec(attemptedModelTokens)
              if (fallbackModelSpec) {
                modelFallbackAttempt++
                overrideModelSpec = fallbackModelSpec
                const normalizedSpec = fallbackModelSpec.toLowerCase()
                attemptedModelTokens.add(normalizedSpec)
                if (normalizedSpec.includes('/')) {
                  attemptedModelTokens.add(normalizedSpec.split('/').slice(1).join('/'))
                }
                actionabilityRecoveryAttempt = 0
                prompt = this.buildModelFallbackPrompt(
                  basePrompt,
                  unactionableReason,
                  rawOutput,
                  modelFallbackAttempt,
                  fallbackModelSpec,
                  promptContract.intent
                )
                this.logger.warn('Delegate task switched model after non-actionable output', {
                  workflowId: workflow.id,
                  taskId: task.id,
                  reason: unactionableReason,
                  fallbackModelSpec,
                  modelFallbackAttempt
                })
                continue
              }
            }

            throw new TaskActionabilityError(task.id, unactionableReason, result.output)
          }
        }

        try {
          let result: {
            output: string
            taskId: string
            model?: string
            modelSource?: ModelSource
          }

          if (retryService) {
            // Execute with retry logic
            const retryResult = await retryService.executeWithRetry(
              taskFullId,
              taskOperation,
              retryConfig
            )

            // Store retry state for reporting
            taskRetryStates.set(task.id, retryResult.state)

            if (!retryResult.success) {
              throw retryResult.error || new Error('Task failed after retries')
            }

            result = retryResult.value!
          } else {
            // Execute without retry
            result = await taskOperation()
          }

          logicalToPersistedTaskId.set(task.id, result.taskId)
          results.set(task.id, result.output)
          executions.set(task.id, {
            logicalTaskId: task.id,
            persistedTaskId: result.taskId,
            assignedAgent,
            assignedCategory,
            model: result.model,
            modelSource: result.modelSource
          })
          completed.add(task.id)
          inProgress.delete(task.id)
          checkpointRecoveryReasons.delete(task.id)
          checkpointRecoveryPhases.delete(task.id)

          this.logger.info('Subtask completed', {
            workflowId: workflow.id,
            taskId: task.id,
            description: task.description,
            assignedAgent: assignedTarget,
            retryAttempts: taskRetryStates.get(task.id)?.attemptNumber ?? 1
          })

          workflowEvents.emit({
            type: 'task:completed',
            workflowId: workflow.id,
            taskId: task.id,
            timestamp: new Date(),
            data: {
              description: task.description,
              assignedAgent: assignedTarget,
              persistedTaskId: result.taskId,
              output: result.output,
              model: result.model,
              modelSource: result.modelSource,
              retryState: taskRetryStates.get(task.id)
            }
          })
        } catch (error) {
          inProgress.delete(task.id)
          failed.add(task.id)

          const errorMessage = error instanceof Error ? error.message : String(error)
          const retryState = taskRetryStates.get(task.id)

          this.logger.error('Subtask failed', {
            workflowId: workflow.id,
            taskId: task.id,
            error: errorMessage,
            assignedAgent: assignedTarget,
            attempts: retryState?.attemptNumber ?? 1,
            exhausted: retryState?.status === 'exhausted'
          })

          workflowEvents.emit({
            type: 'task:failed',
            workflowId: workflow.id,
            taskId: task.id,
            timestamp: new Date(),
            data: {
              description: task.description,
              assignedAgent: assignedTarget,
              error: errorMessage,
              retryState
            }
          })

          throw error
        }
      }

      const canExecute = (task: SubTask): boolean => {
        const deps = dag.get(task.id) || []
        return deps.every(depId => completed.has(depId))
      }

      workflowLoop: while (completed.size < subtasks.length) {
        throwIfAborted()
        const ready = subtasks.filter(
          task =>
            !completed.has(task.id) &&
            !inProgress.has(task.id) &&
            !failed.has(task.id) &&
            canExecute(task)
        )

        if (ready.length === 0 && inProgress.size === 0) {
          if (failed.size > 0) {
            throw new Error(`Workflow stopped: ${failed.size} task(s) failed`)
          }
          throw new Error('Deadlock detected: no tasks can proceed')
        }

        let dispatchCandidates = ready
        const availableSlots = Math.max(MAX_CONCURRENT - inProgress.size, 0)

        if (checkpointEnabled && orchestratorAgentCode && availableSlots > 0 && ready.length > 0) {
          if (!preDispatchCheckpointExecuted) {
            preDispatchCheckpointExecuted = true
            const checkpointDecision = await this.runOrchestratorCheckpoint({
              workflowId: workflow.id,
              sessionId: resolvedSessionId,
              orchestratorAgentCode,
              phase: 'pre-dispatch',
              userInput: input,
              recentlyCompletedTasks: [],
              readyTasks: ready,
              results,
              executions,
              abortSignal
            })

            if (checkpointDecision) {
              recordOrchestratorCheckpoint({
                phase: 'pre-dispatch',
                status: checkpointDecision.status,
                reportedTaskIds: [],
                readyTaskIds: ready.map(task => task.id),
                approvedTaskIds: checkpointDecision.approvedTaskIds,
                reason: checkpointDecision.reason,
                persistedTaskId: checkpointDecision.persistedTaskId
              })

              if (checkpointDecision.status === 'halt') {
                const haltReason = checkpointDecision.reason || '主代理未提供原因'
                throw new Error(`Orchestrator checkpoint halted workflow: ${haltReason}`)
              }

              if (checkpointDecision.approvedTaskIds.length > 0) {
                const approvedSet = new Set(checkpointDecision.approvedTaskIds)
                const approvedTasks = ready.filter(task => approvedSet.has(task.id))
                if (approvedTasks.length > 0) {
                  dispatchCandidates = approvedTasks
                }
              }
            } else {
              recordOrchestratorCheckpoint({
                phase: 'pre-dispatch',
                status: 'fallback',
                reportedTaskIds: [],
                readyTaskIds: ready.map(task => task.id)
              })
            }
          }

          const newlyCompletedTasks = subtasks.filter(
            task => completed.has(task.id) && !reportedToOrchestrator.has(task.id)
          )

          if (newlyCompletedTasks.length > 0) {
            const checkpointDecision = await this.runOrchestratorCheckpoint({
              workflowId: workflow.id,
              sessionId: resolvedSessionId,
              orchestratorAgentCode,
              phase: 'between-waves',
              userInput: input,
              recentlyCompletedTasks: newlyCompletedTasks,
              readyTasks: ready,
              results,
              executions,
              abortSignal
            })

            newlyCompletedTasks.forEach(task => reportedToOrchestrator.add(task.id))

            if (checkpointDecision) {
              recordOrchestratorCheckpoint({
                phase: 'between-waves',
                status: checkpointDecision.status,
                reportedTaskIds: newlyCompletedTasks.map(task => task.id),
                readyTaskIds: ready.map(task => task.id),
                approvedTaskIds: checkpointDecision.approvedTaskIds,
                reason: checkpointDecision.reason,
                persistedTaskId: checkpointDecision.persistedTaskId
              })

              if (checkpointDecision.status === 'halt') {
                const haltReason = checkpointDecision.reason || '主代理未提供原因'
                if (this.shouldAttemptCheckpointHaltRecovery(haltReason)) {
                  const recoveryTargets = this.selectCheckpointRecoveryTargets(
                    haltReason,
                    newlyCompletedTasks
                  )
                  const recoveryOutcome = scheduleCheckpointRecovery({
                    phase: 'between-waves',
                    reason: haltReason,
                    targets: recoveryTargets
                  })

                  if (recoveryOutcome.recoveredTaskIds.length > 0) {
                    this.logger.warn(
                      '[workforce] checkpoint halt converted to recovery retry (OMO-style)',
                      {
                        workflowId: workflow.id,
                        phase: 'between-waves',
                        reason: haltReason,
                        recoveredTaskIds: recoveryOutcome.recoveredTaskIds,
                        exhaustedTaskIds: recoveryOutcome.exhaustedTaskIds
                      }
                    )
                    continue workflowLoop
                  }
                }
                throw new Error(`Orchestrator checkpoint halted workflow: ${haltReason}`)
              }

              newlyCompletedTasks.forEach(task => {
                checkpointRecoveryAttempts.delete(task.id)
                checkpointRecoveryReasons.delete(task.id)
                checkpointRecoveryPhases.delete(task.id)
              })

              if (checkpointDecision.approvedTaskIds.length > 0) {
                const approvedSet = new Set(checkpointDecision.approvedTaskIds)
                const approvedTasks = ready.filter(task => approvedSet.has(task.id))
                if (approvedTasks.length > 0) {
                  dispatchCandidates = approvedTasks
                }
              }
            } else {
              recordOrchestratorCheckpoint({
                phase: 'between-waves',
                status: 'fallback',
                reportedTaskIds: newlyCompletedTasks.map(task => task.id),
                readyTaskIds: ready.map(task => task.id)
              })
            }
          }
        }

        const batch = dispatchCandidates.slice(0, availableSlots)

        if (batch.length > 0) {
          // Execute batch, but don't fail entire workflow on single task failure
          const batchResults = await Promise.allSettled(batch.map(executeTask))

          // Check if any task failed
          const failures = batchResults.filter(r => r.status === 'rejected')
          if (failures.length > 0) {
            // If all tasks in batch failed, throw the first error
            if (failures.length === batch.length) {
              const firstError = (failures[0] as PromiseRejectedResult).reason
              throw firstError
            }
            // Otherwise continue with remaining tasks
          }
        } else {
          throwIfAborted()
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      if (checkpointEnabled && orchestratorAgentCode) {
        const finalReportedTasks = subtasks.filter(task => completed.has(task.id))
        const finalCheckpointDecision = await this.runOrchestratorCheckpoint({
          workflowId: workflow.id,
          sessionId: resolvedSessionId,
          orchestratorAgentCode,
          phase: 'final',
          userInput: input,
          recentlyCompletedTasks: finalReportedTasks,
          readyTasks: [],
          results,
          executions,
          abortSignal
        })

        if (finalCheckpointDecision) {
          recordOrchestratorCheckpoint({
            phase: 'final',
            status: finalCheckpointDecision.status,
            reportedTaskIds: finalReportedTasks.map(task => task.id),
            readyTaskIds: [],
            approvedTaskIds: finalCheckpointDecision.approvedTaskIds,
            reason: finalCheckpointDecision.reason,
            persistedTaskId: finalCheckpointDecision.persistedTaskId
          })

          if (finalCheckpointDecision.status === 'halt') {
            const haltReason = finalCheckpointDecision.reason || '主代理未提供原因'
            throw new Error(`Orchestrator checkpoint halted workflow: ${haltReason}`)
          }

          finalReportedTasks.forEach(task => {
            checkpointRecoveryAttempts.delete(task.id)
            checkpointRecoveryReasons.delete(task.id)
            checkpointRecoveryPhases.delete(task.id)
          })
        } else if (finalReportedTasks.length > 0 || preDispatchCheckpointExecuted) {
          recordOrchestratorCheckpoint({
            phase: 'final',
            status: 'fallback',
            reportedTaskIds: finalReportedTasks.map(task => task.id),
            readyTaskIds: []
          })
        }
      }

      const finalResult = Array.from(results.values()).join('\n\n---\n\n')

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: 'completed',
          output: finalResult,
          completedAt: new Date(),
          metadata: {
            category,
            enableRetry,
            readOnlyRequested,
            taskSource: taskResolution.source,
            planPath: taskResolution.planPath,
            planName: taskResolution.planName,
            referencedMarkdownFiles: taskResolution.referencedMarkdownFiles || [],
            orchestratorAgent: orchestratorAgentCode,
            orchestratorCheckpointEnabled: checkpointEnabled,
            orchestratorCheckpoints,
            orchestratorParticipation: orchestratorCheckpoints.length > 0,
            assignments: subtasks.map(task => ({
              taskId: task.id,
              assignedAgent: task.assignedAgent,
              assignedCategory: task.assignedCategory,
              workflowPhase: task.workflowPhase,
              assignedModel: executions.get(task.id)?.model,
              modelSource: executions.get(task.id)?.modelSource
            })),
            retryStats: {
              totalTasks: subtasks.length,
              tasksRetried: Array.from(taskRetryStates.values()).filter(s => s.attemptNumber > 1)
                .length
            }
          }
        }
      })

      this.logger.info('Workflow completed', {
        workflowId: workflow.id,
        totalTasks: subtasks.length,
        tasksRetried: Array.from(taskRetryStates.values()).filter(s => s.attemptNumber > 1).length
      })

      workflowEvents.emit({
        type: 'workflow:completed',
        workflowId: workflow.id,
        taskId: workflow.id,
        timestamp: new Date(),
        data: { success: true, taskCount: subtasks.length }
      })

      return {
        workflowId: workflow.id,
        tasks: subtasks,
        results,
        executions,
        success: true,
        retryStates: taskRetryStates,
        orchestratorCheckpoints,
        orchestratorParticipation: orchestratorCheckpoints.length > 0
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const cancelled = isAbortRequested(error)

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: cancelled ? 'cancelled' : 'failed',
          output: cancelled ? 'Cancelled by user' : `Error: ${errorMessage}`,
          completedAt: new Date(),
          metadata: {
            category,
            enableRetry,
            readOnlyRequested,
            orchestratorAgent: orchestratorAgentCode,
            orchestratorCheckpointEnabled: checkpointEnabled,
            orchestratorCheckpoints,
            orchestratorParticipation: orchestratorCheckpoints.length > 0,
            cancelledByUser: cancelled,
            retryStats: {
              tasksRetried: Array.from(taskRetryStates.values()).filter(s => s.attemptNumber > 1)
                .length,
              failedTasks: Array.from(taskRetryStates.entries())
                .filter(([, s]) => s.status === 'exhausted')
                .map(([id]) => id)
            }
          }
        }
      })

      if (cancelled) {
        this.logger.info('Workflow cancelled', { workflowId: workflow.id })
      } else {
        this.logger.error('Workflow failed', { workflowId: workflow.id, error: errorMessage })
      }

      throw error
    }
  }

  private async resolveWorkspaceDirForSession(sessionId: string): Promise<string> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { space: true }
    })
    if (session?.space?.workDir) {
      return session.space.workDir
    }

    throw new Error(`Session workspace not found for workflow: ${sessionId}`)
  }

  private async getOrCreateDefaultSession() {
    const existingSession = await this.prisma.session.findFirst({
      orderBy: { createdAt: 'asc' }
    })

    if (existingSession) {
      return existingSession
    }

    const defaultSpace = await this.getOrCreateDefaultSpace()

    return await this.prisma.session.create({
      data: {
        spaceId: defaultSpace.id,
        title: 'Default Session'
      }
    })
  }

  private async getOrCreateDefaultSpace() {
    const existingSpace = await this.prisma.space.findFirst({
      orderBy: { createdAt: 'asc' }
    })

    if (existingSpace) {
      return existingSpace
    }

    return await this.prisma.space.create({
      data: {
        name: 'Default Space',
        workDir: process.cwd()
      }
    })
  }

  private appendReviewTaskIfNeeded(
    tasks: SubTask[],
    source: 'decomposed' | 'plan',
    orchestratorAgentCode?: string
  ): SubTask[] {
    if (orchestratorAgentCode !== 'haotian') {
      return tasks
    }

    if (source !== 'plan') {
      return tasks
    }

    if (tasks.length <= 1) {
      return tasks
    }

    const reviewTaskId = source === 'plan' ? 'plan-haotian-review' : 'haotian-review'
    if (tasks.some(task => task.id === reviewTaskId)) {
      return tasks
    }

    return [
      ...tasks,
      {
        id: reviewTaskId,
        description: '审查已完成子任务的结果一致性，确认验收标准与风险说明完整。',
        dependencies: tasks.map(task => task.id),
        assignedAgent: 'leigong',
        source
      }
    ]
  }
}

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

import { SETTING_KEYS, buildScopedSettingStorageKey } from '@/main/services/settings/schema-registry'
import { DatabaseService } from '../database'
import { WorkforceWorkerDispatcher, type WorkerDispatchInput } from './worker-dispatcher'
import { Prisma } from '@prisma/client'
import { LoggerService } from '../logger'
import { createLLMAdapter } from '../llm/factory'
import { ModelSelectionService, type ModelSource } from '../llm/model-selection.service'
import type { LLMConfig } from '../llm/adapter.interface'
import type { Message } from '@/types/domain'
import { resolvePrimaryAgentRolePolicy } from '@/shared/agent-definitions'
import { workflowEvents } from './events'
import {
  classifyError,
  getTaskRetryService,
  isRetryable,
  NonRetryableErrorType,
  type RetryConfig,
  type RetryState
} from './retry'
import {
  DEFAULT_RECOVERY_CLASS_BUDGET,
  DEFAULT_RECOVERY_CONFIG,
  type RecoveryConfig,
  type RecoveryFailureClass,
  type RecoveryRouteSelection,
  type WorkflowRecoveryState
} from './recovery-types'
import { SecureStorageService } from '../secure-storage.service'
import { BoulderStateService } from '../boulder-state.service'
import { sanitizeCompletionOutput } from './output-sanitizer'
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
  sharedContextStore: SharedContextStore
  /** Retry states for tasks that were retried */
  retryStates?: Map<string, RetryState>
  /** Continuation snapshot for session/workflow recovery consumers. */
  continuationSnapshot?: WorkflowObservabilitySnapshot['continuationSnapshot']
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
  /** Optional recovery configuration override */
  recoveryConfig?: Partial<RecoveryConfig>
  /** Optional explicit plan path for plan-driven execution */
  planPath?: string
  /** Abort signal propagated from session stop action */
  abortSignal?: AbortSignal
  /** Optional runtime tool allowlist override propagated by router */
  availableTools?: string[]
  /** Optional runtime model override propagated by router */
  overrideModelSpec?: string
  /** Optional skill runtime payload propagated by router */
  skillRuntime?: {
    id: string
    command: string
    allowedTools: string[] | null
    model: string | null
  }
  /** Router-provided scoring rationale and selected strategy */
  routingContext?: {
    strategy?: string
    complexityScore?: number
    rationale?: string[]
  }
}

interface WorkflowTaskResolution {
  subtasks: SubTask[]
  source: 'decomposed' | 'plan'
  planPath?: string
  planName?: string
  referencedMarkdownFiles?: string[]
}

interface WorkflowGraphNode {
  taskId: string
  dependencies: string[]
  dependents: string[]
}

interface WorkflowGraph {
  workflowId: string
  nodes: Map<string, WorkflowGraphNode>
  nodeOrder: string[]
}

export interface SharedContextEntry {
  id: string
  workflowId: string
  taskId: string
  phase: WorkflowPhase | 'integration'
  category: 'facts' | 'decisions' | 'constraints' | 'artifacts' | 'dependencies'
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface SharedContextStore {
  workflowId: string
  entries: SharedContextEntry[]
  archivedEntries: SharedContextEntry[]
  retentionLimit: number
}

export interface SharedContextQuery {
  workflowId?: string
  taskId?: string
  category?: SharedContextEntry['category']
  includeArchived?: boolean
}

type WorkflowLifecycleStage = 'plan' | 'dispatch' | 'checkpoint' | 'integration' | 'finalize'

interface WorkflowIntegratorResult {
  summary: string
  conflicts: string[]
  unresolvedItems: string[]
  taskOutputs: Array<{ taskId: string; outputPreview: string }>
  rawTaskOutputs: Array<{ taskId: string; outputPreview: string }>
}

export interface WorkflowObservabilitySnapshot {
  workflowId: string
  graph: {
    workflowId: string
    nodeOrder: string[]
    nodes: WorkflowGraphNode[]
  }
  correlation: {
    workflowId: string
    sessionId?: string
  }
  timeline: {
    workflow: Array<Record<string, unknown>>
    task: Array<Record<string, unknown>>
    run: Array<Record<string, unknown>>
  }
  integration: WorkflowIntegratorResult
  lifecycleStages: WorkflowLifecycleStage[]
  assignments: Array<{
    taskId: string
    persistedTaskId?: string
    runId?: string
    assignedAgent?: string
    assignedCategory?: string
    workflowPhase?: WorkflowPhase
    assignedModel?: string
    modelSource?: ModelSource
    concurrencyKey?: string
    fallbackTrail?: string[]
  }>
  retryState: {
    tasks: Record<
      string,
      {
        attemptNumber: number
        status: string
        maxAttempts: number
        errors: Array<{ errorType: string; error: string; timestamp: string }>
      }
    >
    totalRetried: number
  }
  recoveryState: WorkflowRecoveryState
  continuationSnapshot: {
    workflowId: string
    sessionId?: string
    status: 'completed' | 'failed' | 'cancelled' | 'running'
    resumable: boolean
    failedTasks: string[]
    retryableTasks: string[]
    updatedAt: string
  }
  sharedContext: {
    workflowId: string
    totalEntries: number
    activeEntries: number
    archivedEntries: number
    entries: SharedContextEntry[]
    archived: SharedContextEntry[]
  }
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
  runId?: string
  assignedAgent?: string
  assignedCategory?: string
  model?: string
  modelSource?: ModelSource
  concurrencyKey?: string
  fallbackTrail?: string[]
  evidenceSummary?: {
    missingFields: string[]
    isComplete: boolean
  }
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

interface DispatcherAttemptResult {
  result: {
    output: string
    taskId: string
    runId?: string
    model?: string
    modelSource?: ModelSource
  }
  concurrencyKey: string
  fallbackTrail: string[]
  modelAttemptTokens: Set<string>
}

interface WorkforceConcurrencySettings {
  maxConcurrent: number
  limits: Record<string, number>
}

const MAX_CONCURRENT = 3
const DEFAULT_WORKFORCE_CONCURRENCY_LIMITS: Record<string, number> = {
  default: MAX_CONCURRENT
}
const isStrictBindingEnabled = (): boolean =>
  String(process.env.WORKFORCE_STRICT_BINDING || 'false').toLowerCase() === 'true'

const isStrictRoleModeEnabled = (): boolean =>
  String(process.env.WORKFORCE_STRICT_ROLE_MODE || 'false').toLowerCase() === 'true'
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
  /(evidence_detected=no|output_preview|needs?\s+verify|verification failed|cannot verify|did not confirm|not a success confirmation|intent to start|server startup|启动成功|服务启动|未完成|部分完成|需验证|无法验证|证据不足|缺乏实现证据|仅显示探索|探索与分析|输出仅显示|依赖不满足|未提供代码变更|具体修复内容|missing|required|缺失|incomplete|未创建|未安装|no evidence|show no evidence|in-progress work|in-progress|rather than finalized|not finalized|without verified|cannot proceed|planning .* rather than)/i
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
  private workerDispatcher = new WorkforceWorkerDispatcher()

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
    if (KNOWN_SUBAGENT_CODES.has(normalized)) {
      return normalized
    }
    return undefined
  }

  private resolveCanonicalCategory(raw?: string): string | undefined {
    if (!raw) return undefined
    const normalized = this.normalizeToken(raw)
    if (KNOWN_CATEGORY_CODES.has(normalized)) {
      return normalized
    }
    return undefined
  }

  private normalizeWorkflowCategory(category?: string): string {
    return this.resolveCanonicalCategory(category) || 'dayu'
  }

  private normalizeRecoveryConfig(override?: Partial<RecoveryConfig>): RecoveryConfig {
    const envEnabled = process.env.WORKFORCE_AUTONOMOUS_RECOVERY_MODE
    const enabledFromEnv =
      envEnabled === undefined ? undefined : ['1', 'true', 'on', 'yes'].includes(envEnabled.toLowerCase())

    const envMaxAttemptsRaw = process.env.WORKFORCE_RECOVERY_MAX_ATTEMPTS
    const envMaxAttempts = envMaxAttemptsRaw ? Number.parseInt(envMaxAttemptsRaw, 10) : undefined

    const envFallbackPolicy = process.env.WORKFORCE_RECOVERY_FALLBACK_POLICY
    const fallbackPolicy =
      override?.fallbackPolicy ||
      (envFallbackPolicy === 'category-first' ||
        envFallbackPolicy === 'subagent-first' ||
        envFallbackPolicy === 'model-first'
        ? envFallbackPolicy
        : undefined) ||
      DEFAULT_RECOVERY_CONFIG.fallbackPolicy

    const parseBudget = (envName: string, fallback: number): number => {
      const raw = process.env[envName]
      if (!raw) return fallback
      const parsed = Number.parseInt(raw, 10)
      if (!Number.isFinite(parsed) || parsed < 0) return fallback
      return parsed
    }

    const mergedClassBudget = {
      transient: parseBudget(
        'WORKFORCE_RECOVERY_BUDGET_TRANSIENT',
        override?.classBudget?.transient ?? DEFAULT_RECOVERY_CLASS_BUDGET.transient
      ),
      config: parseBudget(
        'WORKFORCE_RECOVERY_BUDGET_CONFIG',
        override?.classBudget?.config ?? DEFAULT_RECOVERY_CLASS_BUDGET.config
      ),
      dependency: parseBudget(
        'WORKFORCE_RECOVERY_BUDGET_DEPENDENCY',
        override?.classBudget?.dependency ?? DEFAULT_RECOVERY_CLASS_BUDGET.dependency
      ),
      implementation: parseBudget(
        'WORKFORCE_RECOVERY_BUDGET_IMPLEMENTATION',
        override?.classBudget?.implementation ?? DEFAULT_RECOVERY_CLASS_BUDGET.implementation
      ),
      permission: parseBudget(
        'WORKFORCE_RECOVERY_BUDGET_PERMISSION',
        override?.classBudget?.permission ?? DEFAULT_RECOVERY_CLASS_BUDGET.permission
      ),
      unknown: parseBudget(
        'WORKFORCE_RECOVERY_BUDGET_UNKNOWN',
        override?.classBudget?.unknown ?? DEFAULT_RECOVERY_CLASS_BUDGET.unknown
      )
    }

    return {
      enabled: override?.enabled ?? enabledFromEnv ?? DEFAULT_RECOVERY_CONFIG.enabled,
      maxAttempts:
        override?.maxAttempts ??
        (Number.isFinite(envMaxAttempts) && envMaxAttempts !== undefined ? envMaxAttempts : undefined) ??
        DEFAULT_RECOVERY_CONFIG.maxAttempts,
      classBudget: mergedClassBudget,
      fallbackPolicy
    }
  }

  private createInitialRecoveryState(config: RecoveryConfig): WorkflowRecoveryState {
    return {
      phase: 'classify',
      config,
      history: [],
      terminalDiagnostics: [],
      recoveredTasks: [],
      unrecoveredTasks: []
    }
  }

  private cloneRecoveryState(state: WorkflowRecoveryState): WorkflowRecoveryState {
    return JSON.parse(JSON.stringify(state)) as WorkflowRecoveryState
  }

  private normalizePersistedRecoveryState(
    input: unknown,
    fallbackConfig: RecoveryConfig = DEFAULT_RECOVERY_CONFIG
  ): WorkflowRecoveryState {
    if (!input || typeof input !== 'object') {
      return this.createInitialRecoveryState(fallbackConfig)
    }

    const payload = input as Partial<WorkflowRecoveryState>
    const phase =
      payload.phase === 'classify' ||
        payload.phase === 'plan' ||
        payload.phase === 'fix' ||
        payload.phase === 'validate' ||
        payload.phase === 'escalate' ||
        payload.phase === 'abort'
        ? payload.phase
        : 'classify'

    const config = this.normalizeRecoveryConfig(payload.config || fallbackConfig)

    return {
      phase,
      config,
      history: Array.isArray(payload.history) ? payload.history : [],
      terminalDiagnostics: Array.isArray(payload.terminalDiagnostics) ? payload.terminalDiagnostics : [],
      recoveredTasks: Array.isArray(payload.recoveredTasks) ? payload.recoveredTasks : [],
      unrecoveredTasks: Array.isArray(payload.unrecoveredTasks) ? payload.unrecoveredTasks : []
    }
  }

  private classifyRecoveryFailure(error: unknown): RecoveryFailureClass {
    const classification = classifyError(error)
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase()

    if (classification === NonRetryableErrorType.FORBIDDEN || /permission|forbidden|403|denied/.test(message)) {
      return 'permission'
    }

    if (classification === NonRetryableErrorType.AUTH_ERROR || /api key|auth|unauthorized|401|config/.test(message)) {
      return 'config'
    }

    if (/dependency|module not found|cannot find module|missing package|install/.test(message)) {
      return 'dependency'
    }

    if (/assert|typecheck|compile|syntax|validation failed|test failed/.test(message)) {
      return 'implementation'
    }

    if (isRetryable(classification)) {
      return 'transient'
    }

    return 'unknown'
  }

  private isRecoveryClassRecoverable(failureClass: RecoveryFailureClass): boolean {
    return failureClass !== 'permission' && failureClass !== 'unknown'
  }

  private buildRecoveryRouteSelection(input: {
    failureClass: RecoveryFailureClass
    fallbackPolicy: RecoveryConfig['fallbackPolicy']
    assignedAgent?: string
    assignedCategory?: string
    lastModel?: string
  }): RecoveryRouteSelection {
    const attemptedRoutes: string[] = []
    const blockedReasons: string[] = []
    const alternatives: string[] = []

    if (!this.isRecoveryClassRecoverable(input.failureClass)) {
      blockedReasons.push(`Failure class ${input.failureClass} is non-recoverable`)
      if (input.failureClass === 'permission') {
        alternatives.push('Check credentials and workspace permissions')
      } else {
        alternatives.push('Inspect terminal diagnostics and recover manually')
      }
      return {
        strategy: 'fail-fast',
        diagnostics: { attemptedRoutes, blockedReasons, alternatives }
      }
    }

    let strategy = 'category-repair'
    let category: string | undefined = input.assignedCategory || 'dayu'
    let subagent: string | undefined = input.assignedAgent
    let model: string | undefined

    switch (input.failureClass) {
      case 'transient':
        strategy = 'transient-retry-via-category'
        category = input.assignedCategory || 'tianbing'
        break
      case 'config':
        strategy = 'config-repair-via-subagent'
        subagent = 'luban'
        category = undefined
        break
      case 'dependency':
        strategy = 'dependency-repair-via-category'
        category = input.assignedCategory || 'dayu'
        break
      case 'implementation':
        strategy = 'implementation-repair-via-category'
        category = input.assignedCategory || 'dayu'
        break
      default:
        break
    }

    if (input.fallbackPolicy === 'subagent-first') {
      strategy = `${strategy}:subagent-first`
      subagent = subagent || (category ? CATEGORY_TO_FALLBACK_SUBAGENT[category] || 'luban' : 'luban')
      category = undefined
    } else if (input.fallbackPolicy === 'model-first') {
      strategy = `${strategy}:model-first`
      category = undefined
      subagent = undefined
      const normalizedModel =
        typeof input.lastModel === 'string' && input.lastModel.includes('::')
          ? input.lastModel.replace('::', '/')
          : input.lastModel
      if (normalizedModel && normalizedModel.includes('/')) {
        model = normalizedModel
      } else {
        blockedReasons.push('No compatible model token available for model-first recovery')
        alternatives.push('Switch fallback policy to category-first or subagent-first')
      }
    }

    if (!category && !subagent && !model) {
      blockedReasons.push('No route target available for recovery')
      alternatives.push('Configure category/agent bindings for recovery tasks')
      return {
        strategy,
        diagnostics: { attemptedRoutes, blockedReasons, alternatives }
      }
    }

    attemptedRoutes.push(
      [category ? `category:${category}` : null, subagent ? `subagent:${subagent}` : null, model ? `model:${model}` : null]
        .filter(Boolean)
        .join('|')
    )

    return {
      strategy,
      category,
      subagent_type: subagent,
      model,
      diagnostics: {
        attemptedRoutes,
        blockedReasons,
        alternatives
      }
    }
  }

  private buildRecoveryRepairPrompt(input: {
    task: SubTask
    sourceError: string
    failureClass: RecoveryFailureClass
    attempt: number
    objective: string
  }): string {
    return [
      `任务执行失败，进入自动恢复流程（第 ${input.attempt} 轮）。`,
      `失败任务: ${input.task.id} - ${input.task.description}`,
      `失败分类: ${input.failureClass}`,
      `源错误: ${input.sourceError}`,
      `修复目标: ${input.objective}`,
      '请执行最小必要修复并输出结构化证据，必须包含以下字段：',
      '- objective: ...',
      '- changes: ...',
      '- validation: ...',
      '- residual-risk: ...'
    ].join('\n')
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

  private shouldRequestDiting(text: string): boolean {
    return /(?:官方文档|api reference|best practice|第三方|开源|oss|community|sdk|benchmark|外部文档|第三方库|外部库|依赖包|npm|pypi|maven|pip|crate)/i.test(
      text
    )
  }

  private shouldRequestDeepReview(input: string): boolean {
    return /(雷公|deep review|深度审查|深审|严格审查|quality gate|quality review)/i.test(
      input
    )
  }

  private isAgentExplicitlyRequested(input: string, agentCode: string): boolean {
    const normalized = input.toLowerCase()
    const aliases: Record<string, string[]> = {
      qianliyan: ['qianliyan', '千里眼'],
      diting: ['diting', '谛听'],
      baize: ['baize', '白泽'],
      chongming: ['chongming', '重明'],
      leigong: ['leigong', '雷公']
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
        return this.shouldRequestDiting(text)
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

  private splitCrossDomainExecutionTask(
    task: SubTask,
    existingIds: Set<string>,
    source: 'decomposed' | 'plan'
  ): SubTask[] {
    const domainNeeds = this.inferExecutionDomainNeeds(task.description)
    if (!domainNeeds.backend || !domainNeeds.frontend) {
      return [task]
    }

    const normalizedAssignedAgent = this.resolveCanonicalSubagent(task.assignedAgent)
    if (normalizedAssignedAgent && SPECIALIST_WORKERS.has(normalizedAssignedAgent)) {
      return [task]
    }

    const normalizedAssignedCategory = this.resolveCanonicalCategory(task.assignedCategory)
    if (normalizedAssignedCategory === 'cangjie' || normalizedAssignedCategory === 'maliang') {
      return [task]
    }

    const baseDependencies = Array.from(new Set(task.dependencies.filter(Boolean)))
    const backendTask: SubTask = {
      id: this.allocateSyntheticTaskId(existingIds, `${task.id}-backend`),
      description: '交付后端/API/数据库维度的完成度矩阵，并输出该维度按优先级排序的未完成项清单。',
      dependencies: baseDependencies,
      assignedCategory: 'dayu',
      source: task.source || source,
      workflowPhase: 'execution'
    }

    const frontendTask: SubTask = {
      id: this.allocateSyntheticTaskId(existingIds, `${task.id}-frontend`),
      description: '交付前端/UI/页面维度的完成度矩阵，并输出该维度按优先级排序的未完成项清单。',
      dependencies: baseDependencies,
      assignedCategory: 'zhinv',
      source: task.source || source,
      workflowPhase: 'execution'
    }


    return [backendTask, frontendTask]
  }

  private expandCrossDomainExecutionTasks(
    tasks: SubTask[],
    existingIds: Set<string>,
    source: 'decomposed' | 'plan'
  ): SubTask[] {
    const expanded: SubTask[] = []
    const replacementByOriginalId = new Map<string, string[]>()

    for (const task of tasks) {
      const splitTasks = this.splitCrossDomainExecutionTask(task, existingIds, source)
      expanded.push(...splitTasks)
      if (splitTasks.length > 1) {
        replacementByOriginalId.set(task.id, splitTasks.map(item => item.id))
      }
    }

    if (replacementByOriginalId.size === 0) {
      return expanded
    }

    return expanded.map(task => {
      const remappedDependencies = task.dependencies.flatMap(depId => {
        const replacements = replacementByOriginalId.get(depId)
        return replacements && replacements.length > 0 ? replacements : [depId]
      })

      return {
        ...task,
        dependencies: Array.from(new Set(remappedDependencies.filter(Boolean)))
      }
    })
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
    const rawExecutionTasks: SubTask[] = []

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
          rawExecutionTasks.push({
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

      rawExecutionTasks.push({
        ...task,
        assignedAgent,
        assignedCategory: assignedCategory || task.assignedCategory,
        workflowPhase: 'execution'
      })
    }

    const executionTasks = this.expandCrossDomainExecutionTasks(
      rawExecutionTasks,
      existingIds,
      context.source
    )

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

    const shouldInjectDitingTask =
      !hasReferencedMarkdownInputs &&
      (this.shouldRequestDiting(combinedTaskText) ||
        this.isAgentExplicitlyRequested(context.input, 'diting'))
    if (
      shouldInjectDiscovery &&
      shouldInjectDitingTask &&
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

    const resolvedCategory = this.resolveCanonicalCategory(opts.category)

    const modelSelection = await ModelSelectionService.getInstance().resolveModelSelection({
      agentCode: opts.agentCode,
      categoryCode: resolvedCategory,
      temperatureFallback: 0.3
    })

    this.logger.info('Selected model for decomposition', {
      provider: modelSelection.provider,
      model: modelSelection.model,
      baseURL: modelSelection.baseURL,
      source: modelSelection.source,
      protocol: modelSelection.protocol,
      viaAgent: opts.agentCode ?? null,
      viaCategory: resolvedCategory ?? null
    })

    const adapter = createLLMAdapter(modelSelection.provider, {
      apiKey: modelSelection.apiKey,
      baseURL: modelSelection.baseURL
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
- Use "subagent_type" only for true specialist work (qianliyan/diting/baize/chongming/leigong), not for generic implementation.
- For implementation requests, output at least one execution subtask with "category". If both backend and frontend are requested, output both.
- Specialist subtasks should be discovery/review only and must not replace execution subtasks.
- Every subtask description must be outcome-oriented (what is delivered), never process-oriented (what to think).
- IMPORTANT: Use diverse categories based on task nature. Do NOT assign all tasks to "dayu":
  * zhinv: 前端/UI/UX/样式/动画
  * cangjie: 文档/技术写作
  * tianbing: 琐碎任务/单文件修改/简单测试
  * guigu: 复杂推理/算法设计
  * maliang: 创意任务
  * guixu: 深度任务/复杂重构/性能优化
  * tudi: 通用低复杂度任务
  * dayu: 通用高复杂度任务/后端/API/数据库`
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

    const globalMaxToolIterations = await this.resolveGlobalMaxToolIterations()
    const baseConfig = (modelSelection.config ?? {}) as LLMConfig
    const llmConfig: LLMConfig = {
      ...baseConfig,
      model: modelSelection.model,
      temperature: modelSelection.temperature ?? baseConfig.temperature ?? 0.3,
      maxToolIterations: globalMaxToolIterations ?? baseConfig.maxToolIterations,
      abortSignal: opts.abortSignal,
      workspaceDir: opts.workspaceDir,
      sessionId: opts.sessionId,
      // Task decomposition must stay pure planning; disable runtime tool execution.
      tools: []
    }

    const response = await adapter.sendMessage(messages, llmConfig)

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

  private buildWorkflowGraph(workflowId: string, tasks: SubTask[]): WorkflowGraph {
    const nodes = new Map<string, WorkflowGraphNode>()

    for (const task of tasks) {
      nodes.set(task.id, {
        taskId: task.id,
        dependencies: Array.from(new Set(task.dependencies || [])),
        dependents: []
      })
    }

    for (const node of nodes.values()) {
      for (const depId of node.dependencies) {
        const depNode = nodes.get(depId)
        if (depNode) {
          depNode.dependents = Array.from(new Set([...depNode.dependents, node.taskId]))
        }
      }
    }

    return {
      workflowId,
      nodes,
      nodeOrder: tasks.map(task => task.id)
    }
  }

  private validateWorkflowGraph(graph: WorkflowGraph): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    for (const node of graph.nodes.values()) {
      for (const depId of node.dependencies) {
        if (!graph.nodes.has(depId)) {
          issues.push(`任务 ${node.taskId} 依赖了不存在的任务 ${depId}`)
        }
      }
    }

    const inDegree = new Map<string, number>()
    for (const node of graph.nodes.values()) {
      inDegree.set(node.taskId, node.dependencies.filter(dep => graph.nodes.has(dep)).length)
    }

    const queue: string[] = []
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId)
      }
    }

    let visited = 0
    while (queue.length > 0) {
      const current = queue.shift()!
      visited++
      const currentNode = graph.nodes.get(current)
      if (!currentNode) continue

      for (const dependentId of currentNode.dependents) {
        const nextDegree = (inDegree.get(dependentId) || 0) - 1
        inDegree.set(dependentId, nextDegree)
        if (nextDegree === 0) {
          queue.push(dependentId)
        }
      }
    }

    if (visited !== graph.nodes.size) {
      const blocked = Array.from(inDegree.entries())
        .filter(([, degree]) => degree > 0)
        .map(([taskId]) => taskId)
      issues.push(`检测到循环依赖或不可调度任务: ${blocked.join(', ')}`)
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }

  private emitWorkflowStage(
    workflowId: string,
    stage: WorkflowLifecycleStage,
    metadata: Record<string, unknown> = {},
    context?: {
      sessionId?: string
      workspaceDir?: string
    }
  ): void {
    workflowEvents.emit({
      type: 'workflow:stage',
      workflowId,
      taskId: workflowId,
      timestamp: new Date(),
      data: {
        stage,
        ...metadata,
        ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
        ...(context?.workspaceDir ? { workspaceDir: context.workspaceDir } : {})
      }
    })
  }

  private initSharedContext(workflowId: string): SharedContextStore {
    return {
      workflowId,
      entries: [],
      archivedEntries: [],
      retentionLimit: 80
    }
  }

  private appendSharedContextEntry(
    store: SharedContextStore,
    input: {
      taskId: string
      phase: WorkflowPhase | 'integration'
      category: SharedContextEntry['category']
      content: string
      metadata?: Record<string, unknown>
    }
  ): SharedContextEntry {
    const entry: SharedContextEntry = {
      id: `${store.workflowId}:${input.taskId}:${store.entries.length + 1}`,
      workflowId: store.workflowId,
      taskId: input.taskId,
      phase: input.phase,
      category: input.category,
      content: input.content,
      createdAt: new Date().toISOString(),
      metadata: input.metadata
    }
    store.entries.push(entry)
    if (store.entries.length > store.retentionLimit) {
      const overflow = store.entries.splice(0, store.entries.length - store.retentionLimit)
      store.archivedEntries.push(...overflow)
    }
    return entry
  }

  private querySharedContext(
    store: SharedContextStore,
    criteria: SharedContextQuery = {}
  ): SharedContextEntry[] {
    const source = criteria.includeArchived
      ? [...store.archivedEntries, ...store.entries]
      : [...store.entries]

    return source.filter(entry => {
      if (criteria.workflowId && entry.workflowId !== criteria.workflowId) return false
      if (criteria.taskId && entry.taskId !== criteria.taskId) return false
      if (criteria.category && entry.category !== criteria.category) return false
      return true
    })
  }

  private getSharedContextSnapshot(
    store: SharedContextStore,
    options: {
      task?: SubTask
      assignedCategory?: string
      limit?: number
    } = {}
  ): SharedContextEntry[] {
    const effectiveLimit = options.limit ?? 12
    const role = options.assignedCategory
    const roleFiltered = store.entries.filter(entry => {
      if (!role) return true
      if (role === 'zhinv') {
        return entry.category !== 'constraints' || !/backend|database|migration|schema/i.test(entry.content)
      }
      if (role === 'dayu') {
        return entry.category !== 'constraints' || !/ui|css|layout|frontend/i.test(entry.content)
      }
      return true
    })

    const byDependency = options.task?.dependencies?.length
      ? roleFiltered.filter(entry => options.task?.dependencies.includes(entry.taskId))
      : []

    const base = byDependency.length > 0 ? byDependency : roleFiltered
    return base.slice(-effectiveLimit)
  }

  private buildSharedContextPrompt(entries: SharedContextEntry[]): string {
    if (entries.length === 0) {
      return 'shared_context: (none)'
    }

    const lines = entries.map(entry => {
      const content = entry.content.length > 320 ? `${entry.content.slice(0, 320)}\n[...截断...]` : entry.content
      return `- [${entry.category}] (${entry.phase}) task=${entry.taskId}\n${content}`
    })

    return ['shared_context:', ...lines].join('\n')
  }

  private buildIntegratedResult(
    workflowId: string,
    tasks: SubTask[],
    results: Map<string, string>
  ): WorkflowIntegratorResult {
    const rawTaskOutputs = tasks.map(task => {
      const rawOutput = (results.get(task.id) || '').trim()
      return {
        taskId: task.id,
        outputPreview: rawOutput.length > 360 ? `${rawOutput.slice(0, 360)}\n[...截断...]` : rawOutput
      }
    })

    const taskOutputs = rawTaskOutputs.map(item => {
      const sanitized = sanitizeCompletionOutput(item.outputPreview).trim()
      return {
        taskId: item.taskId,
        outputPreview: sanitized
      }
    })

    const conflicts: string[] = []
    const unresolvedItems: string[] = []

    for (const item of taskOutputs) {
      const text = item.outputPreview
      if (!text) {
        unresolvedItems.push(`${item.taskId}: 无输出`)
      }
      if (/(conflict|冲突|inconsistent|不一致)/i.test(text)) {
        conflicts.push(`${item.taskId}: 输出中包含冲突信号`)
      }
      if (/(todo|待办|未完成|pending)/i.test(text)) {
        unresolvedItems.push(`${item.taskId}: 输出包含未完成事项`)
      }

      const missingEvidenceFields = this.collectMissingEvidenceFields(text)
      if (missingEvidenceFields.length > 0) {
        unresolvedItems.push(
          `${item.taskId}: evidence-gap missing fields: ${missingEvidenceFields.join(', ')}`
        )
      }
    }

    const summary = [
      `Workflow ${workflowId} integration summary`,
      `- total_tasks: ${tasks.length}`,
      `- conflicts: ${conflicts.length}`,
      `- unresolved: ${unresolvedItems.length}`
    ].join('\n')

    return {
      summary,
      conflicts,
      unresolvedItems,
      taskOutputs,
      rawTaskOutputs
    }
  }

  public querySharedContextEntries(
    workflowResult: WorkflowResult,
    criteria: SharedContextQuery = {}
  ): SharedContextEntry[] {
    return this.querySharedContext(workflowResult.sharedContextStore, criteria)
  }

  private buildWorkflowObservabilitySnapshot(params: {
    workflowId: string
    sessionId?: string
    graph: WorkflowGraph
    integrated: WorkflowIntegratorResult
    sharedContext: SharedContextStore
    executions: Map<string, WorkflowTaskExecution>
    tasks: SubTask[]
    lifecycleEvents: Array<{ stage: WorkflowLifecycleStage; timestamp: string; details?: Record<string, unknown> }>
    taskTimeline: Array<Record<string, unknown>>
    runTimeline: Array<Record<string, unknown>>
    retryStates: Map<string, RetryState>
    recoveryState: WorkflowRecoveryState
    status: 'completed' | 'failed' | 'cancelled' | 'running'
  }): WorkflowObservabilitySnapshot {
    const assignments = params.tasks.map(task => ({
      taskId: task.id,
      persistedTaskId: params.executions.get(task.id)?.persistedTaskId,
      runId: params.executions.get(task.id)?.runId,
      assignedAgent: task.assignedAgent,
      assignedCategory: task.assignedCategory,
      workflowPhase: task.workflowPhase,
      assignedModel: params.executions.get(task.id)?.model,
      modelSource: params.executions.get(task.id)?.modelSource,
      concurrencyKey: params.executions.get(task.id)?.concurrencyKey,
      fallbackTrail: params.executions.get(task.id)?.fallbackTrail || []
    }))

    const activeEntries = this.querySharedContext(params.sharedContext, {
      workflowId: params.workflowId
    })

    const archivedEntries = this.querySharedContext(params.sharedContext, {
      workflowId: params.workflowId,
      includeArchived: true
    }).filter(entry =>
      params.sharedContext.archivedEntries.some(archived => archived.id === entry.id)
    )

    const retryTasks = Array.from(params.retryStates.entries()).reduce<
      Record<
        string,
        {
          attemptNumber: number
          status: string
          maxAttempts: number
          errors: Array<{ errorType: string; error: string; timestamp: string }>
        }
      >
    >((acc, [taskId, state]) => {
      acc[taskId] = {
        attemptNumber: state.attemptNumber,
        status: state.status,
        maxAttempts: state.maxAttempts,
        errors: state.errors.map(errorItem => ({
          errorType: String(errorItem.errorType),
          error: errorItem.error,
          timestamp: errorItem.timestamp.toISOString()
        }))
      }
      return acc
    }, {})

    const retryableTasks = Object.entries(retryTasks)
      .filter(([, item]) => item.status === 'retrying' || item.status === 'pending')
      .map(([taskId]) => taskId)

    const failedTasks = Object.entries(retryTasks)
      .filter(([, item]) => item.status === 'exhausted')
      .map(([taskId]) => taskId)

    return {
      workflowId: params.workflowId,
      graph: {
        workflowId: params.graph.workflowId,
        nodeOrder: params.graph.nodeOrder,
        nodes: Array.from(params.graph.nodes.values())
      },
      correlation: {
        workflowId: params.workflowId,
        sessionId: params.sessionId
      },
      timeline: {
        workflow: params.lifecycleEvents.map(event => ({
          workflowId: params.workflowId,
          sessionId: params.sessionId,
          eventType: 'workflow:stage',
          stage: event.stage,
          timestamp: event.timestamp,
          details: event.details || {}
        })),
        task: params.taskTimeline,
        run: params.runTimeline
      },
      integration: params.integrated,
      lifecycleStages: ['plan', 'dispatch', 'checkpoint', 'integration', 'finalize'],
      assignments,
      retryState: {
        tasks: retryTasks,
        totalRetried: Object.values(retryTasks).filter(item => item.attemptNumber > 1).length
      },
      recoveryState: this.cloneRecoveryState(params.recoveryState),
      continuationSnapshot: {
        workflowId: params.workflowId,
        sessionId: params.sessionId,
        status: params.status,
        resumable: params.status === 'failed' && retryableTasks.length > 0,
        failedTasks,
        retryableTasks,
        updatedAt: new Date().toISOString()
      },
      sharedContext: {
        workflowId: params.sharedContext.workflowId,
        totalEntries: params.sharedContext.entries.length + params.sharedContext.archivedEntries.length,
        activeEntries: params.sharedContext.entries.length,
        archivedEntries: params.sharedContext.archivedEntries.length,
        entries: activeEntries,
        archived: archivedEntries
      }
    }
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
        '未找到可执行计划文件。请先让伏羲生成计划，或手动指定路径：执行计划 .fuxi/plans/<plan>.md（兼容 .sisyphus/plans/<plan>.md）'
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
    const match = input.match(
      /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
    )
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

    const subagentCandidates = Array.from(KNOWN_SUBAGENT_CODES)
    const categoryCandidates = Array.from(KNOWN_CATEGORY_CODES)

    for (const line of normalized) {
      const explicitAssignee =
        line.match(/subagent_type\s*[:：=]\s*["']?([a-zA-Z0-9_-]+)["']?/i)?.[1] ||
        line.match(/task\s*\(\s*subagent_type\s*=\s*["']([a-zA-Z0-9_-]+)["']/i)?.[1] ||
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

    if (/(前端|ui|组件|样式|css|layout|页面|动画|交互|响应式|frontend)/i.test(text)) {
      return 'zhinv'
    }

    if (
      /(文档撰写|编写文档|changelog|release note|技术写作|说明文档|readme|docs|发布脚本|ci工作流|release script|workflow)/i.test(
        text
      )
    ) {
      return 'cangjie'
    }

    if (/(创意|文案|命名|宣传|branding|creative)/i.test(text)) {
      return 'maliang'
    }

    if (/(数据库迁移脚本|migration script|迁移脚本|复杂推理|算法|策略设计|复杂逻辑|proof|reasoning)/i.test(text)) {
      return 'guigu'
    }

    if (/(深度|复杂重构|架构重构|性能优化|并发|安全加固|迁移)/i.test(text)) {
      return 'guixu'
    }

    if (/(小改|微调|单文件|拼写|格式化|trivial|quick fix|测试用例|断言)/i.test(text)) {
      return 'tianbing'
    }

    // Backend/API/DB heavy implementation → dayu (高复杂度通用)
    if (/(后端|backend|api|接口|数据库|schema|migration|service|controller|server|middleware)/i.test(text)) {
      return 'dayu'
    }

    // Testing/CI/Deploy → tianbing (琐碎) or dayu (复杂) based on complexity signals
    if (/(单测|测试|test|ci|pipeline|deploy|lint|format)/i.test(text)) {
      if (/(集成测试|integration test|e2e|端到端|全链路)/i.test(text)) {
        return 'dayu'
      }
      return 'tianbing'
    }

    // General implementation, bug fixes → use complexity heuristic
    if (/(实现|修复|开发|feature|bug|fix|refactor|重构|集成)/i.test(text)) {
      // Multi-file or cross-module work → dayu
      if (/(多文件|跨模块|全面|完整|整体|综合|multi|cross|full)/i.test(text)) {
        return 'dayu'
      }
      // Low complexity indicator → tudi
      if (/(简单|单个|one|single|minor|小|低复杂|通用.*低)/i.test(text)) {
        return 'tudi'
      }
      return this.resolveCanonicalCategory(workflowCategory) || 'dayu'
    }

    // Fallback: use workflowCategory if provided, otherwise dayu
    return this.resolveCanonicalCategory(workflowCategory) || 'dayu'
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
      if (
        explicitCategory === 'tianbing' &&
        /(quick|快速|小问题|小改|微调|单文件|trivial|测试用例|断言)/i.test(text)
      ) {
        return 'tianbing'
      }

      if (
        explicitCategory === 'cangjie' &&
        /(文档撰写|编写文档|changelog|release note|技术写作|说明文档|发布脚本|ci工作流|release script|workflow)/i.test(
          text
        )
      ) {
        return 'cangjie'
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
      /(unable to proceed|cannot proceed|no (?:\.fuxi|\.sisyphus)\/plans)/i.test(lower)
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
    const chineseStatusPrefixPattern =
      /^(?:我(?:将|会)|让我(?:先|来)?|先(?:来|去)?|接下来|马上|准备(?:先)?|开始(?:先)?|计划|正在)\s*(?:继续)?\s*(?:检查|探索|分析|查看|读取|搜索|调研|定位|确认|执行|梳理|处理|修复|实现)?/i
    const looksLikeStatusOnlyPlaceholder =
      (firstMeaningfulLine &&
        (statusPrefixPattern.test(firstMeaningfulLine) ||
          chineseStatusPrefixPattern.test(firstMeaningfulLine))) ||
      statusPrefixPattern.test(singleLine) ||
      chineseStatusPrefixPattern.test(singleLine) ||
      /^(计划|正在|搜索|列出|读取)/.test(singleLine)
    if (
      looksLikeStatusOnlyPlaceholder
    ) {
      if (singleLine.length <= 220 && !hasConcreteEvidence) {
        return 'status-only-placeholder'
      }
    }

    return undefined
  }

  private isDelegateEmptyOutputFailure(output: string): boolean {
    const normalized = output.trim().toLowerCase()
    if (!normalized) {
      return true
    }

    return (
      normalized.includes('empty output') ||
      normalized.includes('empty text output') ||
      normalized.includes('空文本输出') ||
      normalized.includes('回复为空')
    )
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

  private collectMissingEvidenceFields(output: string): string[] {
    const normalized = output.toLowerCase()
    const requiredFields: Array<{ name: string; patterns: RegExp[] }> = [
      { name: 'objective', patterns: [/\bobjective\b/i, /目标/i] },
      {
        name: 'changes',
        patterns: [/\bchanges\b/i, /changed files/i, /变更文件/i, /修改文件/i]
      },
      {
        name: 'validation',
        patterns: [/\bvalidation\b/i, /verification/i, /测试命令/i, /验证命令/i, /test command/i]
      },
      {
        name: 'residual-risk',
        patterns: [/residual[-\s]?risk/i, /remaining risk/i, /剩余风险/i, /遗留风险/i]
      }
    ]

    return requiredFields
      .filter(field => !field.patterns.some(pattern => pattern.test(normalized)))
      .map(field => field.name)
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

  private async validateBindingConsistencyBeforeDispatch(
    tasks: SubTask[],
    orchestratorAgentCode?: string,
    workflowCategory?: string
  ): Promise<void> {
    const categoriesToValidate = new Set<string>()
    const agentsToValidate = new Set<string>()

    for (const task of tasks) {
      const profile = this.resolveTaskExecutionProfile(task, orchestratorAgentCode, workflowCategory)
      if (profile.assignedCategory) {
        categoriesToValidate.add(profile.assignedCategory)
      }
      if (profile.assignedAgent) {
        agentsToValidate.add(profile.assignedAgent)
      }
    }

    const modelSelectionService = ModelSelectionService.getInstance()

    for (const categoryCode of categoriesToValidate) {
      await modelSelectionService.resolveModelSelection({
        categoryCode,
        temperatureFallback: undefined
      })
    }

    for (const agentCode of agentsToValidate) {
      await modelSelectionService.resolveModelSelection({
        agentCode,
        temperatureFallback: undefined
      })
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
    return (agentCode || '').trim().toLowerCase() === 'haotian'
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

    // Downgrade if ANY completed task has concrete evidence (not requiring ALL)
    return input.recentlyCompletedTasks.some(task =>
      this.hasConcreteExecutionEvidence(input.results.get(task.id) || '')
    )
  }

  private shouldAttemptCheckpointHaltRecovery(reason?: string): boolean {
    const normalizedReason = (reason || '').trim()
    if (!normalizedReason) {
      return false
    }

    if (ORCHESTRATOR_RECOVERABLE_HALT_REASON_PATTERN.test(normalizedReason)) {
      return true
    }

    const hasTaskReference = /(?:\btask\b[\s#-]*\d+|任务\s*#?\s*\d+)/i.test(normalizedReason)
    const hasEvidenceOrDependencyIssue =
      /(evidence|证据|探索|分析|analysis|intent|计划|依赖|dependency|未提供代码|code change|修复内容|不满足|未满足|verify|验证)/i.test(
        normalizedReason
      )

    return hasTaskReference && hasEvidenceOrDependencyIssue
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

    const taskNumberMatches = Array.from(reason.matchAll(/(?:task|任务)\s*#?\s*(\d+)/gi)).map(
      match => match[1]
    )
    for (const numberToken of taskNumberMatches) {
      const normalized = numberToken.trim()
      if (!normalized) continue
      for (const candidate of candidates) {
        const candidateId = candidate.id.toLowerCase()
        if (
          candidateId === normalized ||
          candidateId === `task-${normalized}` ||
          candidateId.endsWith(`-${normalized}`)
        ) {
          matchedIds.push(candidate.id)
        }
      }
    }

    const dedupMatchedIds = Array.from(new Set(matchedIds))
    if (dedupMatchedIds.length === 0) {
      return candidates
    }

    const matchedSet = new Set(dedupMatchedIds)
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
      '- 若 evidence_detected = yes，不得仅因为 output_preview 看起来像摘要/计划而判定"无证据"。',
      '- 若子任务输出中包含文件路径、代码片段或具体实现描述，应视为有效执行证据，status 设为 "continue"。',
      '- output_preview 仅是截断预览，不能代表完整输出。若 evidence_detected = yes 或 evidence_signals 非空，优先信任引擎检测结果。',
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
      const checkpointResult = await this.workerDispatcher.dispatch({
        sessionId: input.sessionId,
        description: `Orchestrator checkpoint review (${input.workflowId})`,
        prompt,
        subagent_type: 'haotian',
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

  private parseSettingInt(value: string | null | undefined, min: number, max: number): number | null {
    if (!value) return null
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) return null
    return Math.max(min, Math.min(max, Math.trunc(parsed)))
  }

  private async getSystemSettingValue(key: string, options?: { sessionId?: string }): Promise<string | undefined> {
    const systemSettingClient = (this.prisma as unknown as {
      systemSetting?: {
        findUnique?: (args: { where: { key: string } }) => Promise<{ value?: string | null } | null>
      }
    }).systemSetting

    const findUnique = systemSettingClient?.findUnique
    if (typeof findUnique !== 'function') {
      return undefined
    }

    const sessionId = options?.sessionId?.trim()
    if (sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { spaceId: true }
      })

      const spaceId = session?.spaceId?.trim()
      if (spaceId) {
        const scopedKey = buildScopedSettingStorageKey(key, 'space', spaceId)
        const scopedSetting = await findUnique({ where: { key: scopedKey } })
        const scopedValue = scopedSetting?.value?.trim()
        if (scopedValue) {
          return scopedValue
        }
      }
    }

    const setting = await findUnique({ where: { key } })
    const value = setting?.value?.trim()
    return value || undefined
  }

  private async resolveGlobalMaxToolIterations(): Promise<number | undefined> {
    const value = await this.getSystemSettingValue(SETTING_KEYS.MAX_TOOL_ITERATIONS)
    return this.parseSettingInt(value, 1, 1000) ?? undefined
  }

  private parseConcurrencyLimits(value?: string): Record<string, number> | undefined {
    if (!value) return undefined
    try {
      const parsed = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return undefined
      }

      const result: Record<string, number> = {}
      for (const [rawKey, rawLimit] of Object.entries(parsed)) {
        const key = String(rawKey || '').trim()
        if (!key) continue
        const limit = this.parseSettingInt(String(rawLimit), 1, 1000)
        if (limit !== null) {
          result[key] = limit
        }
      }

      return Object.keys(result).length > 0 ? result : undefined
    } catch {
      return undefined
    }
  }

  private async resolveWorkforceConcurrencySettings(sessionId: string): Promise<WorkforceConcurrencySettings> {
    const maxConcurrentSetting = await this.getSystemSettingValue(SETTING_KEYS.WORKFORCE_MAX_CONCURRENT, {
      sessionId
    })

    const maxConcurrent = this.parseSettingInt(maxConcurrentSetting, 1, 128) ?? MAX_CONCURRENT

    const limitsSetting = await this.getSystemSettingValue(SETTING_KEYS.WORKFORCE_CONCURRENCY_LIMITS, {
      sessionId
    })

    const configuredLimits = this.parseConcurrencyLimits(limitsSetting)
    const limits = {
      ...DEFAULT_WORKFORCE_CONCURRENCY_LIMITS,
      ...(configuredLimits || {})
    }

    if (typeof limits.default !== 'number') {
      limits.default = maxConcurrent
    }

    return {
      maxConcurrent,
      limits
    }
  }

  private parseModelProviderAndName(spec?: string): { provider?: string; model?: string } {
    const normalized = spec?.trim()
    if (!normalized) {
      return {}
    }

    const slashIndex = normalized.indexOf('/')
    if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
      return { model: normalized }
    }

    return {
      provider: normalized.slice(0, slashIndex),
      model: normalized.slice(slashIndex + 1)
    }
  }

  private buildConcurrencyKey(input: {
    category?: string
    modelSpec?: string
    provider?: string
  }): string {
    const parsed = this.parseModelProviderAndName(input.modelSpec)
    const provider = (input.provider || parsed.provider || '').trim()
    const model = (parsed.model || '').trim()
    const category = (input.category || '').trim()

    if (provider && model) {
      return `${provider}::${model}`
    }
    if (provider) {
      return provider
    }
    if (category) {
      return category
    }

    return 'default'
  }

  private getConcurrencyLimitForKey(key: string, limits: Record<string, number>): number {
    const trimmed = key.trim()
    const defaultLimit = typeof limits.default === 'number' ? limits.default : MAX_CONCURRENT
    if (!trimmed) {
      return defaultLimit
    }

    return limits[trimmed] ?? defaultLimit
  }

  private findNextFairTask(
    candidates: SubTask[],
    lastServedIndexByKey: Map<string, number>,
    keyResolver: (task: SubTask) => string
  ): SubTask | undefined {
    if (candidates.length === 0) {
      return undefined
    }

    const grouped = new Map<string, Array<{ task: SubTask; index: number }>>()
    candidates.forEach((task, index) => {
      const key = keyResolver(task)
      const bucket = grouped.get(key) || []
      bucket.push({ task, index })
      grouped.set(key, bucket)
    })

    let selected: { task: SubTask; index: number } | undefined
    for (const [key, bucket] of grouped.entries()) {
      const last = lastServedIndexByKey.get(key) ?? -1
      const preferred = bucket.find(item => item.index > last) || bucket[0]
      if (!selected || preferred.index < selected.index) {
        selected = preferred
      }
    }

    if (!selected) {
      return candidates[0]
    }

    const selectedKey = keyResolver(selected.task)
    lastServedIndexByKey.set(selectedKey, selected.index)
    return selected.task
  }

  private resolveStrictBindingPreference(input: {
    fallbackModelSpec?: string
    attemptedModelTokens: Set<string>
  }): { modelSpec?: string; diagnostics?: string } {
    const fallbackSpec = input.fallbackModelSpec?.trim()
    if (!fallbackSpec) {
      return {}
    }

    const normalizedFallback = fallbackSpec.toLowerCase()
    if (input.attemptedModelTokens.has(normalizedFallback)) {
      return {
        diagnostics:
          `Strict binding fallback model "${fallbackSpec}" has already been attempted. ` +
          'Please adjust model bindings or configure additional fallback models.'
      }
    }

    return { modelSpec: fallbackSpec }
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

  private async dispatchWithFallbackAndQuota(input: {
    baseDelegateInput: WorkerDispatchInput
    assignedAgent?: string
    assignedCategory?: string
    basePrompt: string
    promptContract: TaskPromptContract
    workflowId: string
    taskId: string
    concurrencyLimits: Record<string, number>
  }): Promise<DispatcherAttemptResult> {
    const attemptedModelTokens = new Set<string>()
    const fallbackTrail: string[] = []
    let actionabilityRecoveryAttempt = 0
    let modelFallbackAttempt = 0
    let prompt = input.baseDelegateInput.prompt
    let overrideModelSpec: string | undefined

    for (; ;) {
      const delegateInput: WorkerDispatchInput = {
        ...input.baseDelegateInput,
        prompt,
        useDynamicPrompt: actionabilityRecoveryAttempt === 0 && modelFallbackAttempt === 0,
        metadata: {
          ...(input.baseDelegateInput.metadata || {}),
          dispatchMode: 'sync',
          actionabilityRecoveryAttempt,
          modelFallbackAttempt,
          overrideModelSpec
        }
      }

      if (input.assignedCategory) {
        delegateInput.category = input.assignedCategory
        delete delegateInput.subagent_type
      } else {
        delegateInput.subagent_type = input.assignedAgent || 'luban'
        delete delegateInput.category
      }

      const selectedModelSpec = overrideModelSpec || undefined
      if (selectedModelSpec) {
        delegateInput.model = selectedModelSpec
      } else {
        delete delegateInput.model
      }

      const effectiveModelSpec = selectedModelSpec
      const concurrencyKey = this.buildConcurrencyKey({
        category: input.assignedCategory,
        modelSpec: effectiveModelSpec
      })
      const perKeyLimit = this.getConcurrencyLimitForKey(concurrencyKey, input.concurrencyLimits)
      delegateInput.metadata = {
        ...(delegateInput.metadata || {}),
        concurrencyKey,
        concurrencyLimit: perKeyLimit
      }

      const result = await this.workerDispatcher.dispatch(delegateInput)
      let rawOutput = typeof result.output === 'string' ? result.output : ''
      let outputText = rawOutput.trim()
      if (!result.success) {
        if (this.isDelegateEmptyOutputFailure(outputText)) {
          this.logger.warn('Delegate task failed with empty output signal; entering recovery path', {
            workflowId: input.workflowId,
            taskId: input.taskId,
            actionabilityRecoveryAttempt,
            modelFallbackAttempt,
            overrideModelSpec: overrideModelSpec || null
          })
          rawOutput = ''
          outputText = ''
        } else {
          throw new Error(result.output || 'Delegate task returned unsuccessful status')
        }
      }

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
        ? this.getUnactionableOutputReason(
          {
            id: input.taskId,
            description: input.baseDelegateInput.description,
            dependencies: []
          } as SubTask,
          outputText
        )
        : 'empty-output'

      if (!unactionableReason) {
        return {
          result: {
            output: result.output,
            taskId: result.taskId,
            runId: result.runId,
            model: result.model,
            modelSource: result.modelSource
          },
          concurrencyKey,
          fallbackTrail,
          modelAttemptTokens: attemptedModelTokens
        }
      }

      this.logger.warn('Delegate task returned non-actionable output', {
        workflowId: input.workflowId,
        taskId: input.taskId,
        reason: unactionableReason,
        actionabilityRecoveryAttempt,
        modelFallbackAttempt,
        overrideModelSpec: overrideModelSpec || null,
        outputPreview: outputText.slice(0, 220)
      })

      if (this.canAttemptActionabilityRecovery(unactionableReason, actionabilityRecoveryAttempt)) {
        actionabilityRecoveryAttempt++
        prompt = this.buildActionabilityRecoveryPrompt(
          input.basePrompt,
          unactionableReason,
          rawOutput,
          actionabilityRecoveryAttempt,
          input.promptContract.intent
        )
        continue
      }

      if (this.canAttemptModelFallback(unactionableReason, modelFallbackAttempt)) {
        const fallbackModelSpec = await this.pickAlternativeModelSpec(attemptedModelTokens)
        const strictResolution = this.resolveStrictBindingPreference({
          fallbackModelSpec,
          attemptedModelTokens
        })

        if (!strictResolution.modelSpec) {
          const attempted = Array.from(attemptedModelTokens).slice(0, 5)
          throw new Error(
            strictResolution.diagnostics ||
            `No compatible fallback model is available. ` +
            `Attempted models: ${attempted.join(', ') || '(none)'}. ` +
            'Please configure additional runnable models in Settings.'
          )
        }

        if (strictResolution.diagnostics) {
          throw new Error(strictResolution.diagnostics)
        }

        if (strictResolution.modelSpec) {
          modelFallbackAttempt++
          overrideModelSpec = strictResolution.modelSpec
          fallbackTrail.push(`${unactionableReason}:${strictResolution.modelSpec}`)
          const normalizedSpec = strictResolution.modelSpec.toLowerCase()
          attemptedModelTokens.add(normalizedSpec)
          if (normalizedSpec.includes('/')) {
            attemptedModelTokens.add(normalizedSpec.split('/').slice(1).join('/'))
          }
          actionabilityRecoveryAttempt = 0
          prompt = this.buildModelFallbackPrompt(
            input.basePrompt,
            unactionableReason,
            rawOutput,
            modelFallbackAttempt,
            strictResolution.modelSpec,
            input.promptContract.intent
          )
          this.logger.warn('Delegate task switched model after non-actionable output', {
            workflowId: input.workflowId,
            taskId: input.taskId,
            reason: unactionableReason,
            fallbackModelSpec: strictResolution.modelSpec,
            modelFallbackAttempt
          })
          continue
        }
      }

      throw new TaskActionabilityError(input.taskId, unactionableReason, result.output)
    }
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
      recoveryConfig,
      abortSignal
    } = resolvedOptions
    const category = this.normalizeWorkflowCategory(requestedCategory)
    const orchestratorAgentCode = this.resolveCanonicalSubagent(agentCode) || agentCode
    const orchestratorPrimaryRolePolicy = orchestratorAgentCode
      ? resolvePrimaryAgentRolePolicy(orchestratorAgentCode)
      : null

    if (isStrictRoleModeEnabled() && orchestratorPrimaryRolePolicy?.canonicalAgent !== 'haotian') {
      throw new Error(
        `Strict role mode requires orchestration owner "haotian", received "${orchestratorAgentCode || 'unknown'}".`
      )
    }
    const checkpointEnabled = this.shouldRequireOrchestratorCheckpoint(orchestratorAgentCode)
    const readOnlyRequested = this.isReadOnlyWorkflowRequest(input)
    const normalizedOptions: WorkflowOptions = {
      ...resolvedOptions,
      category
    }
    const retryService = enableRetry ? getTaskRetryService(retryConfig) : null
    const recoveryMode = this.normalizeRecoveryConfig(recoveryConfig)
    const concurrencySettings = await this.resolveWorkforceConcurrencySettings(resolvedSessionId)
    const taskRetryStates = new Map<string, RetryState>()
    const recoveryState = this.createInitialRecoveryState(recoveryMode)
    const taskRecoveryAttempts = new Map<string, number>()
    const taskRecoveryClassAttempts = new Map<string, number>()
    const taskLastRecoveryStrategy = new Map<string, string>()
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
          metadata: {
            category,
            enableRetry,
            readOnlyRequested,
            recoveryMode: recoveryMode as unknown as Prisma.InputJsonValue
          }
        }
      })
    })

    this.logger.info('Executing workflow', { workflowId: workflow.id, input, enableRetry })

    const dispatchSkillRuntime = resolvedOptions.skillRuntime
      ? {
          ...resolvedOptions.skillRuntime,
          allowedTools: resolvedOptions.availableTools ?? resolvedOptions.skillRuntime.allowedTools,
          model: resolvedOptions.overrideModelSpec || resolvedOptions.skillRuntime.model
        }
      : undefined

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
        {
          ...normalizedOptions,
          availableTools: resolvedOptions.availableTools,
          overrideModelSpec: resolvedOptions.overrideModelSpec,
          skillRuntime: dispatchSkillRuntime
        },
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
      await this.validateBindingConsistencyBeforeDispatch(subtasks, orchestratorAgentCode, category)
      const dag = this.buildDAG(subtasks)
      const graph = this.buildWorkflowGraph(workflow.id, subtasks)
      const graphValidation = this.validateWorkflowGraph(graph)
      if (!graphValidation.valid) {
        throw new Error(`Deadlock detected: ${graphValidation.issues.join(' | ')}`)
      }
      const results = new Map<string, string>()
      const executions = new Map<string, WorkflowTaskExecution>()
      const sharedContext = this.initSharedContext(workflow.id)
      const completed = new Set<string>()
      const failed = new Set<string>()
      const inProgress = new Set<string>()
      const inProgressByConcurrencyKey = new Map<string, number>()
      const lastServedIndexByConcurrencyKey = new Map<string, number>()
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
            readyTaskIds: params.readyTaskIds,
            sessionId: resolvedSessionId,
            workspaceDir
          }
        })
      }

      const lifecycleTimeline: Array<{
        stage: WorkflowLifecycleStage
        timestamp: string
        details?: Record<string, unknown>
      }> = []
      const taskTimeline: Array<Record<string, unknown>> = []
      const runTimeline: Array<Record<string, unknown>> = []
      const STAGE_OWNER: Record<WorkflowLifecycleStage, string> = {
        plan: 'fuxi',
        dispatch: 'haotian',
        checkpoint: 'haotian',
        integration: 'haotian',
        finalize: 'haotian'
      }

      const recordStageTransition = (
        stage: WorkflowLifecycleStage,
        metadata: Record<string, unknown> = {}
      ) => {
        const timestamp = new Date().toISOString()
        const owner = STAGE_OWNER[stage]
        const details = {
          stageOwner: owner,
          ...metadata
        }
        lifecycleTimeline.push({ stage, timestamp, details })
        this.emitWorkflowStage(workflow.id, stage, details, {
          sessionId: resolvedSessionId,
          workspaceDir
        })
      }

      recordStageTransition('plan', {
        taskCount: subtasks.length,
        graphNodes: graph.nodes.size
      })

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

        const assignedEventTimestamp = new Date().toISOString()
        taskTimeline.push({
          workflowId: workflow.id,
          taskId: task.id,
          persistedTaskId: null,
          runId: null,
          status: 'assigned',
          timestamp: assignedEventTimestamp,
          assignedAgent: assignedAgent || null,
          assignedCategory: assignedCategory || null,
          description: task.description,
          dependencies: task.dependencies
        })

        workflowEvents.emit({
          type: 'task:assigned',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(assignedEventTimestamp),
          data: {
            description: task.description,
            assignedAgent: assignedTarget,
            sessionId: resolvedSessionId,
            workspaceDir
          }
        })

        const startedEventTimestamp = new Date().toISOString()
        taskTimeline.push({
          workflowId: workflow.id,
          taskId: task.id,
          persistedTaskId: null,
          runId: null,
          status: 'started',
          timestamp: startedEventTimestamp,
          assignedAgent: assignedAgent || null,
          assignedCategory: assignedCategory || null,
          description: task.description
        })

        workflowEvents.emit({
          type: 'task:started',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(startedEventTimestamp),
          data: {
            description: task.description,
            assignedAgent: assignedTarget,
            sessionId: resolvedSessionId,
            workspaceDir
          }
        })

        const taskOperation = async (recoveryAttempt = 0) => {
          throwIfAborted()
          const dependencyContext = this.buildDependencyContext(task, results)
          const promptContract = this.buildTaskPromptContract(task, readOnlyRequested)
          const sharedContextSnapshot = this.getSharedContextSnapshot(sharedContext, {
            task,
            assignedCategory,
            limit: 12
          })
          const sharedContextPrompt = this.buildSharedContextPrompt(sharedContextSnapshot)
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
          const promptWithSharedContext = `${basePrompt}\n\nSHARED COLLABORATION CONTEXT:\n${sharedContextPrompt}`
          const recoveryPrompt =
            checkpointRecoveryReason && checkpointRecoveryAttempt > 0
              ? this.buildCheckpointHaltRecoveryPrompt(
                promptWithSharedContext,
                checkpointRecoveryReason,
                checkpointRecoveryAttempt,
                checkpointRecoveryPhase || 'between-waves'
              )
              : promptWithSharedContext
          const runtimeBindingSnapshot = {
            assignedAgent,
            assignedCategory,
            workflowCategory: category,
            workflowId: workflow.id,
            primaryAgentRolePolicy: orchestratorPrimaryRolePolicy
              ? {
                alias: orchestratorPrimaryRolePolicy.alias,
                canonicalAgent: orchestratorPrimaryRolePolicy.canonicalAgent,
                canonicalRole: orchestratorPrimaryRolePolicy.canonicalRole
              }
              : undefined
          }

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
            checkpointRecoveryReason,
            recoveryAttempt,
            routingContext: resolvedOptions.routingContext || null,
            skill: resolvedOptions.skillRuntime || null,
            skillToolScope: resolvedOptions.availableTools || null,
            skillModelOverride: resolvedOptions.overrideModelSpec || null,
            runtimeBindingSnapshot
          }

          const attemptResult = await this.dispatchWithFallbackAndQuota({
            baseDelegateInput: {
              description: task.description,
              prompt: recoveryPrompt,
              sessionId: resolvedSessionId,
              parentTaskId: workflow.id,
              abortSignal,
              metadata: baseMetadata
            },
            assignedAgent,
            assignedCategory,
            basePrompt,
            promptContract,
            workflowId: workflow.id,
            taskId: task.id,
            concurrencyLimits: concurrencySettings.limits
          })

          if (attemptResult.result.taskId) {
            await this.prisma.task.update({
              where: { id: attemptResult.result.taskId },
              data: {
                metadata: {
                  ...(baseMetadata as Record<string, unknown>),
                  runtimeBindingSnapshot: {
                    ...runtimeBindingSnapshot,
                    model: attemptResult.result.model,
                    modelSource: attemptResult.result.modelSource,
                    concurrencyKey: attemptResult.concurrencyKey,
                    fallbackTrail: attemptResult.fallbackTrail
                  }
                }
              }
            })
          }

          return {
            ...attemptResult.result,
            concurrencyKey: attemptResult.concurrencyKey,
            fallbackTrail: attemptResult.fallbackTrail
          }
        }

        try {
          const executeWithRecovery = async () => {
            recoveryState.phase = 'classify'
            try {
              return await taskOperation(0)
            } catch (primaryError) {
              if (!recoveryMode.enabled) {
                throw primaryError
              }

              const primaryErrorMessage =
                primaryError instanceof Error ? primaryError.message : String(primaryError)
              const failureClass = this.classifyRecoveryFailure(primaryError)
              const nextAttempt = (taskRecoveryAttempts.get(task.id) || 0) + 1
              const nextClassAttempt = (taskRecoveryClassAttempts.get(task.id) || 0) + 1
              const classBudget = recoveryMode.classBudget[failureClass] ?? 0
              const recoverableClass = this.isRecoveryClassRecoverable(failureClass)
              const attemptId = `${workflow.id}:${task.id}:${nextAttempt}`
              const selectedRoute = this.buildRecoveryRouteSelection({
                failureClass,
                fallbackPolicy: recoveryMode.fallbackPolicy,
                assignedAgent,
                assignedCategory
              })

              if (
                !recoverableClass ||
                nextAttempt > recoveryMode.maxAttempts ||
                nextClassAttempt > classBudget ||
                (!selectedRoute.category && !selectedRoute.subagent_type && !selectedRoute.model)
              ) {
                recoveryState.phase = 'escalate'
                if (!recoveryState.unrecoveredTasks.includes(task.id)) {
                  recoveryState.unrecoveredTasks.push(task.id)
                }
                recoveryState.terminalDiagnostics.push({
                  taskId: task.id,
                  failureClass,
                  lastStrategy: selectedRoute.strategy,
                  reason:
                    !recoverableClass
                      ? `Failure class ${failureClass} is non-recoverable`
                      : nextAttempt > recoveryMode.maxAttempts
                        ? `Recovery attempts exceeded maxAttempts=${recoveryMode.maxAttempts}`
                        : nextClassAttempt > classBudget
                          ? `Recovery class budget exhausted for ${failureClass}`
                          : `No recoverable route available: ${(selectedRoute.diagnostics?.blockedReasons || []).join('; ')}`,
                  remediation: [
                    'Inspect task-level terminal diagnostics',
                    'Adjust recovery route bindings (category/subagent/model)',
                    'Retry workflow manually after remediation'
                  ],
                  timestamp: new Date().toISOString()
                })
                recoveryState.history.push({
                  attemptId,
                  taskId: task.id,
                  phase: 'abort',
                  failureClass,
                  strategy: selectedRoute.strategy,
                  sourceError: primaryErrorMessage,
                  repairObjective: 'repair failed task and provide structured evidence',
                  selectedCategory: selectedRoute.category,
                  selectedSubagent: selectedRoute.subagent_type,
                  selectedModel: selectedRoute.model,
                  status: 'aborted',
                  startedAt: new Date().toISOString(),
                  finishedAt: new Date().toISOString()
                })

                throw primaryError
              }

              taskRecoveryAttempts.set(task.id, nextAttempt)
              taskRecoveryClassAttempts.set(task.id, nextClassAttempt)
              taskLastRecoveryStrategy.set(task.id, selectedRoute.strategy)

              recoveryState.phase = 'plan'
              recoveryState.history.push({
                attemptId,
                taskId: task.id,
                phase: 'plan',
                failureClass,
                strategy: selectedRoute.strategy,
                sourceError: primaryErrorMessage,
                repairObjective: `Repair ${task.id} and validate runnable output`,
                selectedCategory: selectedRoute.category,
                selectedSubagent: selectedRoute.subagent_type,
                selectedModel: selectedRoute.model,
                status: 'planned',
                startedAt: new Date().toISOString()
              })
              await this.prisma.task.update({
                where: { id: workflow.id },
                data: {
                  metadata: {
                    category,
                    enableRetry,
                    readOnlyRequested,
                    recoveryMode,
                    recoveryState: this.cloneRecoveryState(recoveryState),
                    taskSource: taskResolution.source,
                    planPath: taskResolution.planPath,
                    planName: taskResolution.planName,
                    referencedMarkdownFiles: taskResolution.referencedMarkdownFiles || [],
                    orchestratorAgent: orchestratorAgentCode,
                    orchestratorCheckpointEnabled: checkpointEnabled,
                    orchestratorCheckpoints,
                    orchestratorParticipation: orchestratorCheckpoints.length > 0,
                    routingContext: resolvedOptions.routingContext || null,
                    skill: resolvedOptions.skillRuntime || null,
                    skillToolScope: resolvedOptions.availableTools || null,
                    skillModelOverride: resolvedOptions.overrideModelSpec || null,
                    scheduling: {
                      maxConcurrent: concurrencySettings.maxConcurrent,
                      concurrencyLimits: concurrencySettings.limits,
                      strictBindingEnabled: isStrictBindingEnabled()
                    }
                  }
                }
              })

              recoveryState.phase = 'fix'
              await this.prisma.task.update({
                where: { id: workflow.id },
                data: {
                  metadata: {
                    category,
                    enableRetry,
                    readOnlyRequested,
                    recoveryMode,
                    recoveryState: this.cloneRecoveryState(recoveryState),
                    taskSource: taskResolution.source,
                    planPath: taskResolution.planPath,
                    planName: taskResolution.planName,
                    referencedMarkdownFiles: taskResolution.referencedMarkdownFiles || [],
                    orchestratorAgent: orchestratorAgentCode,
                    orchestratorCheckpointEnabled: checkpointEnabled,
                    orchestratorCheckpoints,
                    orchestratorParticipation: orchestratorCheckpoints.length > 0,
                    routingContext: resolvedOptions.routingContext || null,
                    skill: resolvedOptions.skillRuntime || null,
                    skillToolScope: resolvedOptions.availableTools || null,
                    skillModelOverride: resolvedOptions.overrideModelSpec || null,
                    scheduling: {
                      maxConcurrent: concurrencySettings.maxConcurrent,
                      concurrencyLimits: concurrencySettings.limits,
                      strictBindingEnabled: isStrictBindingEnabled()
                    }
                  }
                }
              })
              const recoveryPrompt = this.buildRecoveryRepairPrompt({
                task,
                sourceError: primaryErrorMessage,
                failureClass,
                attempt: nextAttempt,
                objective: 'repair failed task and provide structured evidence'
              })

              const dependencyContext = this.buildDependencyContext(task, results)
              const promptContract = this.buildTaskPromptContract(task, readOnlyRequested)
              const sharedContextSnapshot = this.getSharedContextSnapshot(sharedContext, {
                task,
                assignedCategory,
                limit: 12
              })
              const sharedContextPrompt = this.buildSharedContextPrompt(sharedContextSnapshot)
              const basePrompt = this.buildTaskPrompt(
                task,
                taskResolution.source,
                dependencyContext,
                promptContract,
                taskResolution.referencedMarkdownFiles || []
              )

              const retryAttemptResult = await this.dispatchWithFallbackAndQuota({
                baseDelegateInput: {
                  description: task.description,
                  prompt: `${basePrompt}\n\nSHARED COLLABORATION CONTEXT:\n${sharedContextPrompt}\n\n${recoveryPrompt}`,
                  sessionId: resolvedSessionId,
                  parentTaskId: workflow.id,
                  abortSignal,
                  model: selectedRoute.model,
                  metadata: {
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
                    routingContext: resolvedOptions.routingContext || null,
                    skill: dispatchSkillRuntime || null,
                    skillToolScope: resolvedOptions.availableTools || null,
                    skillModelOverride: resolvedOptions.overrideModelSpec || null,
                    recoveryContext: {
                      sourceError: primaryErrorMessage,
                      failureClass,
                      attemptId,
                      repairObjective: 'repair failed task and provide structured evidence',
                      orchestratorOwner: orchestratorAgentCode || 'haotian',
                      selectedStrategy: selectedRoute.strategy,
                      selectedCategory: selectedRoute.category,
                      selectedSubagent: selectedRoute.subagent_type,
                      selectedModel: selectedRoute.model
                    },
                    primaryAgentRoleAlias: 'haotian',
                    workflowStage: 'dispatch'
                  }
                },
                assignedAgent: selectedRoute.subagent_type || assignedAgent,
                assignedCategory: selectedRoute.category,
                basePrompt,
                promptContract,
                workflowId: workflow.id,
                taskId: task.id,
                concurrencyLimits: concurrencySettings.limits
              })

              recoveryState.phase = 'validate'
              const retryOutput = (retryAttemptResult.result.output || '').trim()
              const missingRecoveryEvidence = this.collectMissingEvidenceFields(retryOutput)
              const historyRecord = recoveryState.history.find(item => item.attemptId === attemptId)
              if (!historyRecord) {
                throw new Error('Recovery history entry missing')
              }

              historyRecord.phase = 'validate'
              historyRecord.validatorResult = missingRecoveryEvidence.length === 0 ? 'passed' : 'failed'
              historyRecord.status = missingRecoveryEvidence.length === 0 ? 'succeeded' : 'failed'
              historyRecord.finishedAt = new Date().toISOString()

              if (missingRecoveryEvidence.length > 0) {
                if (!recoveryState.unrecoveredTasks.includes(task.id)) {
                  recoveryState.unrecoveredTasks.push(task.id)
                }
                recoveryState.phase = 'escalate'
                recoveryState.terminalDiagnostics.push({
                  taskId: task.id,
                  failureClass,
                  lastStrategy: selectedRoute.strategy,
                  reason: `Recovery output missing evidence fields: ${missingRecoveryEvidence.join(', ')}`,
                  remediation: [
                    'Ensure recovery output includes objective/changes/validation/residual-risk',
                    'Re-run recovery with explicit structured format enforcement'
                  ],
                  timestamp: new Date().toISOString()
                })
                throw primaryError
              }

              if (!recoveryState.recoveredTasks.includes(task.id)) {
                recoveryState.recoveredTasks.push(task.id)
              }
              recoveryState.phase = 'validate'
              return {
                output: retryAttemptResult.result.output,
                taskId: retryAttemptResult.result.taskId,
                runId: retryAttemptResult.result.runId,
                model: retryAttemptResult.result.model,
                modelSource: retryAttemptResult.result.modelSource,
                concurrencyKey: retryAttemptResult.concurrencyKey,
                fallbackTrail: retryAttemptResult.fallbackTrail
              }
            }
          }

          let result: {
            output: string
            taskId: string
            runId?: string
            model?: string
            modelSource?: ModelSource
            concurrencyKey?: string
            fallbackTrail?: string[]
          }

          if (retryService) {
            // Execute with retry logic
            const retryResult = await retryService.executeWithRetry(
              taskFullId,
              executeWithRecovery,
              {
                ...(retryConfig || {}),
                onStateChange: async state => {
                  taskRetryStates.set(task.id, state)
                  await this.prisma.task.update({
                    where: { id: workflow.id },
                    data: {
                      metadata: {
                        category,
                        enableRetry,
                        readOnlyRequested,
                        recoveryMode,
                        recoveryState: this.cloneRecoveryState(recoveryState),
                        taskSource: taskResolution.source,
                        planPath: taskResolution.planPath,
                        planName: taskResolution.planName,
                        referencedMarkdownFiles: taskResolution.referencedMarkdownFiles || [],
                        orchestratorAgent: orchestratorAgentCode,
                        orchestratorCheckpointEnabled: checkpointEnabled,
                        orchestratorCheckpoints,
                        orchestratorParticipation: orchestratorCheckpoints.length > 0,
                        routingContext: resolvedOptions.routingContext || null,
                        scheduling: {
                          maxConcurrent: concurrencySettings.maxConcurrent,
                          concurrencyLimits: concurrencySettings.limits,
                          strictBindingEnabled: isStrictBindingEnabled()
                        },
                        retryState: {
                          tasks: Object.fromEntries(
                            Array.from(taskRetryStates.entries()).map(([retryTaskId, retryState]) => [
                              retryTaskId,
                              {
                                attemptNumber: retryState.attemptNumber,
                                status: retryState.status,
                                maxAttempts: retryState.maxAttempts,
                                errors: retryState.errors.map(errorItem => ({
                                  errorType: String(errorItem.errorType),
                                  error: errorItem.error,
                                  timestamp: errorItem.timestamp.toISOString()
                                }))
                              }
                            ])
                          ),
                          totalRetried: Array.from(taskRetryStates.values()).filter(item => item.attemptNumber > 1)
                            .length
                        },
                        retryStats: {
                          totalTasks: subtasks.length,
                          tasksRetried: Array.from(taskRetryStates.values()).filter(item => item.attemptNumber > 1)
                            .length
                        },
                        continuationSnapshot: {
                          workflowId: workflow.id,
                          sessionId: resolvedSessionId,
                          status: 'running',
                          resumable: true,
                          failedTasks: [],
                          retryableTasks: Array.from(taskRetryStates.entries())
                            .filter(([, item]) => item.status === 'retrying' || item.status === 'pending')
                            .map(([retryTaskId]) => retryTaskId),
                          updatedAt: new Date().toISOString()
                        }
                      }
                    }
                  })
                }
              }
            )

            // Store retry state for reporting and crash recovery continuity
            taskRetryStates.set(task.id, retryResult.state)

            if (!retryResult.success) {
              throw retryResult.error || new Error('Task failed after retries')
            }

            result = retryResult.value!
          } else {
            // Execute without retry
            result = await executeWithRecovery()
          }

          logicalToPersistedTaskId.set(task.id, result.taskId)
          results.set(task.id, result.output)
          const missingEvidenceFields = this.collectMissingEvidenceFields(result.output || '')
          executions.set(task.id, {
            logicalTaskId: task.id,
            persistedTaskId: result.taskId,
            runId: result.runId,
            assignedAgent,
            assignedCategory,
            model: result.model,
            modelSource: result.modelSource,
            concurrencyKey: result.concurrencyKey,
            fallbackTrail: result.fallbackTrail,
            evidenceSummary: {
              missingFields: missingEvidenceFields,
              isComplete: missingEvidenceFields.length === 0
            }
          })
          completed.add(task.id)
          inProgress.delete(task.id)
          checkpointRecoveryReasons.delete(task.id)
          checkpointRecoveryPhases.delete(task.id)
          taskRecoveryAttempts.delete(task.id)
          taskRecoveryClassAttempts.delete(task.id)

          const normalizedOutput = result.output.trim()
          if (normalizedOutput) {
            this.appendSharedContextEntry(sharedContext, {
              taskId: task.id,
              phase: task.workflowPhase || 'execution',
              category:
                task.workflowPhase && task.workflowPhase !== 'execution' ? 'decisions' : 'artifacts',
              content: normalizedOutput,
              metadata: {
                persistedTaskId: result.taskId,
                model: result.model,
                modelSource: result.modelSource,
                assignedAgent,
                assignedCategory,
                concurrencyKey: result.concurrencyKey,
                fallbackTrail: result.fallbackTrail || []
              }
            })
          }

          this.logger.info('Subtask completed', {
            workflowId: workflow.id,
            taskId: task.id,
            description: task.description,
            assignedAgent: assignedTarget,
            retryAttempts: taskRetryStates.get(task.id)?.attemptNumber ?? 1
          })

          const completedEventTimestamp = new Date().toISOString()
          taskTimeline.push({
            workflowId: workflow.id,
            taskId: task.id,
            persistedTaskId: result.taskId,
            runId: result.runId || null,
            status: 'completed',
            timestamp: completedEventTimestamp,
            assignedAgent: assignedAgent || null,
            assignedCategory: assignedCategory || null,
            model: result.model || null,
            modelSource: result.modelSource || null,
            retryState: taskRetryStates.get(task.id) || null
          })

          runTimeline.push({
            workflowId: workflow.id,
            taskId: task.id,
            runId: result.runId || null,
            persistedTaskId: result.taskId,
            status: 'completed',
            timestamp: completedEventTimestamp,
            model: result.model || null,
            modelSource: result.modelSource || null,
            fallbackTrail: result.fallbackTrail || [],
            concurrencyKey: result.concurrencyKey || null
          })

          const sanitizedTaskOutput = sanitizeCompletionOutput(result.output || '')
          workflowEvents.emit({
            type: 'task:completed',
            workflowId: workflow.id,
            taskId: task.id,
            timestamp: new Date(completedEventTimestamp),
            data: {
              description: task.description,
              assignedAgent: assignedTarget,
              sessionId: resolvedSessionId,
              workspaceDir,
              persistedTaskId: result.taskId,
              output: sanitizedTaskOutput,
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
          const failureClass = this.classifyRecoveryFailure(error)
          if (!recoveryState.unrecoveredTasks.includes(task.id)) {
            recoveryState.unrecoveredTasks.push(task.id)
          }
          if (!recoveryState.terminalDiagnostics.some(item => item.taskId === task.id)) {
            recoveryState.phase = 'escalate'
            recoveryState.terminalDiagnostics.push({
              taskId: task.id,
              failureClass,
              lastStrategy: taskLastRecoveryStrategy.get(task.id) || 'none',
              reason: errorMessage,
              remediation: [
                'Inspect task failure and recovery diagnostics',
                'Validate bindings and permissions before rerun'
              ],
              timestamp: new Date().toISOString()
            })
          }

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
              sessionId: resolvedSessionId,
              workspaceDir,
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

      recordStageTransition('dispatch', {
        checkpointEnabled,
        maxConcurrent: concurrencySettings.maxConcurrent,
        routingContext: resolvedOptions.routingContext || null,
        concurrencyLimits: concurrencySettings.limits,
        strictBindingEnabled: isStrictBindingEnabled()
      })

      workflowLoop: for (;;) {
        while (completed.size < subtasks.length) {
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
          const availableSlots = Math.max(concurrencySettings.maxConcurrent - inProgress.size, 0)
          const keyResolver = (candidate: SubTask) => {
            const execution = executions.get(candidate.id)
            return (
              execution?.concurrencyKey ||
              this.buildConcurrencyKey({
                category: candidate.assignedCategory || category
              })
            )
          }

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
                  if (!this.shouldAttemptCheckpointHaltRecovery(haltReason)) {
                    throw new Error(`Orchestrator checkpoint halted workflow: ${haltReason}`)
                  }
                  this.logger.warn(
                    '[workforce] pre-dispatch checkpoint halt downgraded to continue for recoverable reason',
                    {
                      workflowId: workflow.id,
                      phase: 'pre-dispatch',
                      reason: haltReason
                    }
                  )
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
                        '[workforce] checkpoint halt converted to recovery retry',
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

          const batch: Array<{ task: SubTask; key: string }> = []
          const remaining = [...dispatchCandidates]
          while (batch.length < availableSlots && remaining.length > 0) {
            const next = this.findNextFairTask(remaining, lastServedIndexByConcurrencyKey, keyResolver)
            if (!next) {
              break
            }

            const key = keyResolver(next)
            const inUse = inProgressByConcurrencyKey.get(key) || 0
            const limit = this.getConcurrencyLimitForKey(key, concurrencySettings.limits)
            if (inUse < limit) {
              batch.push({ task: next, key })
              inProgressByConcurrencyKey.set(key, inUse + 1)
            }

            const nextIndex = remaining.findIndex(task => task.id === next.id)
            if (nextIndex >= 0) {
              remaining.splice(nextIndex, 1)
            }
          }

          if (batch.length > 0) {
            // Execute batch, but don't fail entire workflow on single task failure
            const batchResults = await Promise.allSettled(
              batch.map(async ({ task, key }) => {
                try {
                  await executeTask(task)
                } finally {
                  const current = inProgressByConcurrencyKey.get(key) || 0
                  if (current <= 1) {
                    inProgressByConcurrencyKey.delete(key)
                  } else {
                    inProgressByConcurrencyKey.set(key, current - 1)
                  }
                }
              })
            )

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

        recordStageTransition('checkpoint', {
          checkpointsRecorded: orchestratorCheckpoints.length
        })

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
              if (this.shouldAttemptCheckpointHaltRecovery(haltReason)) {
                const recoveryTargets = this.selectCheckpointRecoveryTargets(
                  haltReason,
                  finalReportedTasks
                )
                const recoveryOutcome = scheduleCheckpointRecovery({
                  phase: 'final',
                  reason: haltReason,
                  targets: recoveryTargets
                })
                if (recoveryOutcome.recoveredTaskIds.length > 0) {
                  this.logger.warn('[workforce] final checkpoint halt converted to recovery retry', {
                    workflowId: workflow.id,
                    phase: 'final',
                    reason: haltReason,
                    recoveredTaskIds: recoveryOutcome.recoveredTaskIds,
                    exhaustedTaskIds: recoveryOutcome.exhaustedTaskIds
                  })
                  continue workflowLoop
                }
              }
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

        break workflowLoop
      }

      recordStageTransition('integration', {
        completedTasks: completed.size
      })

      const integrated = this.buildIntegratedResult(workflow.id, subtasks, results)
      this.appendSharedContextEntry(sharedContext, {
        taskId: workflow.id,
        phase: 'integration',
        category: 'decisions',
        content: integrated.summary,
        metadata: {
          conflicts: integrated.conflicts.length,
          unresolvedItems: integrated.unresolvedItems.length
        }
      })

      const finalResult = [
        integrated.summary,
        '',
        '### task_outputs',
        ...integrated.taskOutputs.map(item => `- ${item.taskId}:\n${item.outputPreview || '(empty)'}`),
        '',
        '### conflicts',
        ...(integrated.conflicts.length > 0 ? integrated.conflicts.map(item => `- ${item}`) : ['- (none)']),
        '',
        '### unresolved_items',
        ...(integrated.unresolvedItems.length > 0
          ? integrated.unresolvedItems.map(item => `- ${item}`)
          : ['- (none)'])
      ].join('\n')

      recordStageTransition('finalize', {
        finalResultLength: finalResult.length
      })

      const observability = this.buildWorkflowObservabilitySnapshot({
        workflowId: workflow.id,
        sessionId: resolvedSessionId,
        graph,
        integrated,
        sharedContext,
        executions,
        tasks: subtasks,
        lifecycleEvents: lifecycleTimeline,
        taskTimeline,
        runTimeline,
        retryStates: taskRetryStates,
        recoveryState,
        status: 'completed'
      })

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
            routingContext: resolvedOptions.routingContext || null,
            skill: dispatchSkillRuntime || null,
            skillToolScope: resolvedOptions.availableTools || null,
            skillModelOverride: resolvedOptions.overrideModelSpec || null,
            recoveryMode,
            recoveryState: observability.recoveryState,
            scheduling: {
              maxConcurrent: concurrencySettings.maxConcurrent,
              concurrencyLimits: concurrencySettings.limits,
              strictBindingEnabled: isStrictBindingEnabled()
            },
            correlation: observability.correlation,
            timeline: observability.timeline,
            assignments: observability.assignments,
            graph: observability.graph,
            lifecycleStages: observability.lifecycleStages,
            integration: observability.integration,
            retryState: observability.retryState,
            continuationSnapshot: observability.continuationSnapshot,
            sharedContext: observability.sharedContext,
            sharedContextQueries: {
              byWorkflow: this.querySharedContext(sharedContext, {
                workflowId: workflow.id
              }).length,
              dependencyEntries: this.querySharedContext(sharedContext, {
                workflowId: workflow.id,
                category: 'dependencies'
              }).length,
              artifactEntries: this.querySharedContext(sharedContext, {
                workflowId: workflow.id,
                category: 'artifacts'
              }).length,
              archivedIncluded: this.querySharedContext(sharedContext, {
                workflowId: workflow.id,
                includeArchived: true
              }).length
            },
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
        data: {
          success: true,
          taskCount: subtasks.length,
          sessionId: resolvedSessionId,
          workspaceDir
        }
      })

      return {
        workflowId: workflow.id,
        tasks: subtasks,
        results,
        executions,
        success: true,
        sharedContextStore: sharedContext,
        retryStates: taskRetryStates,
        continuationSnapshot: observability.continuationSnapshot,
        orchestratorCheckpoints,
        orchestratorParticipation: orchestratorCheckpoints.length > 0
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const cancelled = isAbortRequested(error)

      const fallbackTasks: SubTask[] = []
      const fallbackResults = new Map<string, string>()
      const fallbackExecutions = new Map<string, WorkflowTaskExecution>()
      const fallbackSharedContext = this.initSharedContext(workflow.id)
      const fallbackLifecycleTimeline: Array<{
        stage: WorkflowLifecycleStage
        timestamp: string
        details?: Record<string, unknown>
      }> = []
      const fallbackTaskTimeline: Array<Record<string, unknown>> = []
      const fallbackRunTimeline: Array<Record<string, unknown>> = []

      const fallbackGraph = this.buildWorkflowGraph(workflow.id, fallbackTasks)
      const fallbackIntegrated = this.buildIntegratedResult(workflow.id, fallbackTasks, fallbackResults)
      const failureStatus: 'failed' | 'cancelled' = cancelled ? 'cancelled' : 'failed'
      const observability = this.buildWorkflowObservabilitySnapshot({
        workflowId: workflow.id,
        sessionId: resolvedSessionId,
        graph: fallbackGraph,
        integrated: fallbackIntegrated,
        sharedContext: fallbackSharedContext,
        executions: fallbackExecutions,
        tasks: fallbackTasks,
        lifecycleEvents: fallbackLifecycleTimeline,
        taskTimeline: fallbackTaskTimeline,
        runTimeline: fallbackRunTimeline,
        retryStates: taskRetryStates,
        recoveryState,
        status: failureStatus
      })

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: failureStatus,
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
            routingContext: resolvedOptions.routingContext || null,
            skill: dispatchSkillRuntime || null,
            skillToolScope: resolvedOptions.availableTools || null,
            skillModelOverride: resolvedOptions.overrideModelSpec || null,
            recoveryMode,
            recoveryState: observability.recoveryState,
            correlation: observability.correlation,
            timeline: observability.timeline,
            assignments: observability.assignments,
            graph: observability.graph,
            lifecycleStages: observability.lifecycleStages,
            integration: observability.integration,
            retryState: observability.retryState,
            continuationSnapshot: observability.continuationSnapshot,
            sharedContext: observability.sharedContext,
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

  async getWorkflowObservability(workflowTaskId: string): Promise<WorkflowObservabilitySnapshot | null> {
    const workflowTask = await this.prisma.task.findUnique({
      where: { id: workflowTaskId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        metadata: true
      }
    })

    if (!workflowTask) {
      return null
    }

    const metadata = (workflowTask.metadata as Record<string, any> | null) || {}
    if (!metadata.graph || !metadata.integration || !metadata.sharedContext) {
      return null
    }

    const workflowTaskUpdatedAt =
      workflowTask.completedAt instanceof Date
        ? workflowTask.completedAt
        : workflowTask.startedAt instanceof Date
          ? workflowTask.startedAt
          : workflowTask.createdAt instanceof Date
            ? workflowTask.createdAt
            : new Date()

    const derivedContinuationStatus: 'completed' | 'failed' | 'cancelled' | 'running' =
      workflowTask.status === 'completed'
        ? 'completed'
        : workflowTask.status === 'failed'
          ? 'failed'
          : workflowTask.status === 'cancelled'
            ? 'cancelled'
            : 'running'

    const correlation =
      metadata.correlation && typeof metadata.correlation === 'object'
        ? metadata.correlation
        : { workflowId: metadata.graph.workflowId || workflowTask.id }

    const timelineSource =
      metadata.timeline && typeof metadata.timeline === 'object' ? metadata.timeline : {}

    const retryStateSource =
      metadata.retryState && typeof metadata.retryState === 'object'
        ? metadata.retryState
        : { tasks: {}, totalRetried: 0 }

    const continuationSource =
      metadata.continuationSnapshot && typeof metadata.continuationSnapshot === 'object'
        ? metadata.continuationSnapshot
        : {
          workflowId: metadata.graph.workflowId || workflowTask.id,
          sessionId: correlation?.sessionId,
          status: derivedContinuationStatus,
          resumable: false,
          failedTasks: [],
          retryableTasks: [],
          updatedAt: workflowTaskUpdatedAt.toISOString()
        }

    const recoverySource = this.normalizePersistedRecoveryState(metadata.recoveryState)

    return {
      workflowId: metadata.graph.workflowId || workflowTask.id,
      graph: {
        workflowId: metadata.graph.workflowId || workflowTask.id,
        nodeOrder: Array.isArray(metadata.graph.nodeOrder) ? metadata.graph.nodeOrder : [],
        nodes: Array.isArray(metadata.graph.nodes) ? metadata.graph.nodes : []
      },
      correlation: {
        workflowId: correlation.workflowId || metadata.graph.workflowId || workflowTask.id,
        sessionId:
          typeof correlation.sessionId === 'string' && correlation.sessionId.trim().length > 0
            ? correlation.sessionId
            : undefined
      },
      timeline: {
        workflow: Array.isArray(timelineSource.workflow) ? timelineSource.workflow : [],
        task: Array.isArray(timelineSource.task) ? timelineSource.task : [],
        run: Array.isArray(timelineSource.run) ? timelineSource.run : []
      },
      integration: {
        ...metadata.integration,
        taskOutputs: Array.isArray(metadata.integration?.taskOutputs)
          ? metadata.integration.taskOutputs
          : [],
        rawTaskOutputs: Array.isArray(metadata.integration?.rawTaskOutputs)
          ? metadata.integration.rawTaskOutputs
          : []
      },
      lifecycleStages: Array.isArray(metadata.lifecycleStages) ? metadata.lifecycleStages : [],
      assignments: Array.isArray(metadata.assignments) ? metadata.assignments : [],
      retryState: {
        tasks:
          retryStateSource.tasks && typeof retryStateSource.tasks === 'object'
            ? retryStateSource.tasks
            : {},
        totalRetried:
          typeof retryStateSource.totalRetried === 'number' ? retryStateSource.totalRetried : 0
      },
      recoveryState: recoverySource,
      continuationSnapshot: {
        workflowId: continuationSource.workflowId || metadata.graph.workflowId || workflowTask.id,
        sessionId:
          typeof continuationSource.sessionId === 'string' && continuationSource.sessionId.trim().length > 0
            ? continuationSource.sessionId
            : undefined,
        status:
          continuationSource.status === 'completed' ||
            continuationSource.status === 'failed' ||
            continuationSource.status === 'cancelled' ||
            continuationSource.status === 'running'
            ? continuationSource.status
            : derivedContinuationStatus,
        resumable: Boolean(continuationSource.resumable),
        failedTasks: Array.isArray(continuationSource.failedTasks)
          ? continuationSource.failedTasks
          : [],
        retryableTasks: Array.isArray(continuationSource.retryableTasks)
          ? continuationSource.retryableTasks
          : [],
        updatedAt:
          typeof continuationSource.updatedAt === 'string' && continuationSource.updatedAt.length > 0
            ? continuationSource.updatedAt
            : workflowTaskUpdatedAt.toISOString()
      },
      sharedContext: {
        workflowId: metadata.sharedContext.workflowId || workflowTask.id,
        totalEntries:
          typeof metadata.sharedContext.totalEntries === 'number'
            ? metadata.sharedContext.totalEntries
            : 0,
        activeEntries:
          typeof metadata.sharedContext.activeEntries === 'number'
            ? metadata.sharedContext.activeEntries
            : Array.isArray(metadata.sharedContext.entries)
              ? metadata.sharedContext.entries.length
              : 0,
        archivedEntries:
          typeof metadata.sharedContext.archivedEntries === 'number'
            ? metadata.sharedContext.archivedEntries
            : Array.isArray(metadata.sharedContext.archived)
              ? metadata.sharedContext.archived.length
              : 0,
        entries: Array.isArray(metadata.sharedContext.entries) ? metadata.sharedContext.entries : [],
        archived: Array.isArray(metadata.sharedContext.archived) ? metadata.sharedContext.archived : []
      }
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

    if (session?.spaceId) {
      const space = await this.prisma.space.findUnique({ where: { id: session.spaceId } })
      if (space?.workDir) {
        return space.workDir
      }
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

/**
 * @license
 * Copyright (c) 2024-2026 opencode-ai
 *
 * This file is adapted from oh-my-opencode
 * Original source: https://github.com/opencode-ai/oh-my-opencode
 * License: SUL-1.0
 *
 * This code is used under the Sustainable Use License for internal/non-commercial purposes only.
 *
 * Modified by CodeAll project.
 */

import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { truncateToTokenLimit } from '@/main/services/llm/dynamic-truncator'
import type { LLMConfig } from '@/main/services/llm/adapter.interface'
import { BindingService } from '@/main/services/binding.service'
import { AgentRunService, type RunLogEntry } from '@/main/services/agent-run.service'
import {
  ModelSelectionService,
  type ModelSource,
  type ResolvedModelSelection
} from '@/main/services/llm/model-selection.service'
import type {
  FallbackReason,
  ModelSelectionAttemptSummary,
  ModelSelectionReason,
  ModelSelectionSnapshot
} from '@/shared/model-selection-contract'
import {
  listPrimaryAgentRoleAliases,
  resolvePrimaryAgentRolePolicy,
  type PrimaryAgentRolePolicy
} from '@/shared/agent-definitions'
import {
  toolExecutionService,
  type ToolCall,
  type ToolExecutionConfig,
  type LoopIterationResult
} from '@/main/services/tools/tool-execution.service'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import type { BrowserToolContext } from '@/main/services/ai-browser/types'
import type { Message } from '@/types/domain'
import { AsyncLocalStorage } from 'node:async_hooks'
import { applyTraceMetadata } from '@/shared/trace-contract'
import { renderTaskBriefMarkdown, type StructuredTaskBrief } from '@/shared/task-brief-contract'

// 动态 Prompt 系统
import { DynamicPromptBuilder, type PromptBuilderConfig } from './dynamic-prompt-builder'
import { CategoryResolver, type ResolvedAgent } from './category-resolver'
import { SETTING_KEYS } from '@/main/services/settings/schema-registry'
import { resolveScopedRuntimeToolNames } from './tool-allowlist'
import { getAgentPromptByCode } from './agents'
import { getCategoryPromptByCode } from './categories'
import {
  buildDelegationProtocol,
  serializeDelegationProtocol,
  type DelegationProtocolInput
} from './delegation-protocol'
import type { AvailableSkill } from './category-constants'

export interface DelegateTaskInput {
  sessionId?: string
  description: string
  prompt: string
  category?: string
  subagent_type?: string
  parentTaskId?: string
  model?: string
  baseURL?: string
  apiKey?: string
  /** 是否使用动态 Prompt 系统 (默认: true) */
  useDynamicPrompt?: boolean
  /** 可用工具列表 (用于动态 Prompt) */
  availableTools?: string[]
  /** 加载的技能列表 */
  loadSkills?: string[] | string
  /** 委托协议输入 (可选，用于结构化任务委托) */
  delegationProtocol?: DelegationProtocolInput
  /** 是否后台运行 */
  runInBackground?: boolean
  /** 额外元数据（会写入 Task.metadata） */
  metadata?: Record<string, unknown>
  /** Abort signal propagated from session stop action */
  abortSignal?: AbortSignal
}

export interface DelegateTaskResult {
  taskId: string
  output: string
  success: boolean
  /** Agent 类型 (如果使用了动态 Prompt) */
  agentType?: string
  /** 使用的模型 */
  model?: string
  /** 模型来源：用户覆盖 / fallback chain / 系统默认 */
  modelSource?: ModelSource
  modelSelectionReason?: ModelSelectionReason
  modelSelectionSummary?: string
  fallbackReason?: FallbackReason
  fallbackAttemptSummary?: ModelSelectionAttemptSummary[]
  /** 执行记录 ID */
  runId?: string
  /** 使用的系统提示长度 (tokens 估算) */
  systemPromptTokens?: number
}

function buildModelSelectionSnapshot(selection: ResolvedModelSelection): ModelSelectionSnapshot {
  return {
    modelId: selection.modelId,
    provider: selection.provider,
    model: selection.model,
    modelSelectionSource: selection.modelSelectionSource,
    modelSelectionReason: selection.modelSelectionReason,
    modelSelectionSummary: selection.modelSelectionSummary,
    fallbackReason: selection.fallbackReason,
    fallbackAttemptSummary: selection.fallbackAttemptSummary
  }
}

const DEFAULT_SYSTEM_PROMPT = 'You are CodeAll, an AI coding agent.'
const CATEGORY_EXECUTION_GUARDRAIL_PROMPT = `<Category_Execution_Contract>
CATEGORY-RUN EXECUTION MODE (NON-NEGOTIABLE):

- Execute the requested task directly. Do not output exploration preambles.
- Forbidden opening style: "我将先检查/探索/分析..." or "让我先看看..."
- If exploration is needed, do it silently and continue to implementation in the same run.
- Do not ask user questions unless there is a hard blocker that tools cannot resolve.

Completion evidence is mandatory:
1. Concrete implementation evidence (changed files, commands, or produced artifacts)
2. Verification evidence (tests/build/diagnostics or an explicit reason why unavailable)
3. Final status: completed / blocked, with blocker details if blocked

Server startup tasks require explicit success proof:
- If task asks to start a server (e.g. npm run dev), keep running until startup success signal appears.
- Report the exact success signal from output (port/listening/ready line). Do not stop at "starting..."
</Category_Execution_Contract>`
const FUXI_BLOCKED_STAGES = new Set(['dispatch', 'checkpoint', 'integration', 'finalize', 'execution'])
const IMPLEMENTATION_INTENT_PATTERN =
  /(修复|实现|新增|重构|开发|改代码|implement|fix|build|refactor)/i

function resolveTraceIdFromMetadata(metadata?: Record<string, unknown>): string | undefined {
  const traceId = typeof metadata?.traceId === 'string' ? metadata.traceId.trim() : ''
  return traceId || undefined
}

/**
 * 旧版本系统提示解析 (兼容性保留)
 * @deprecated 使用 DynamicPromptBuilder 代替
 */
function resolveSystemPrompt(
  agentPrompt: string | null | undefined,
  categoryPrompt: string | null | undefined,
  builtinAgentPrompt: string | null | undefined
): string {
  if (agentPrompt?.trim()) return agentPrompt.trim()
  if (categoryPrompt?.trim()) return categoryPrompt.trim()
  if (builtinAgentPrompt?.trim()) return builtinAgentPrompt.trim()
  return DEFAULT_SYSTEM_PROMPT
}

function isAbortRequested(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return /aborted|abort|cancelled by user|cancelled/i.test(error.message)
}

function formatPrimaryRoleAliasExamples(): string {
  return 'fuxi/planning, haotian/orchestration, kuafu/execution'
}

function isStrictPrimaryRoleModeEnabled(): boolean {
  return process.env.WORKFORCE_STRICT_ROLE_MODE === '1' || process.env.WORKFORCE_STRICT_ROLE_MODE === 'true'
}

function parseSettingInt(value: string | null | undefined, min: number, max: number): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function resolvePrimaryRolePolicyFromMetadata(
  metadata?: Record<string, unknown>
): { policy: PrimaryAgentRolePolicy; workflowStage?: string; override?: Record<string, unknown> } | { error: string } | null {
  if (!metadata) {
    return null
  }

  const alias =
    (typeof metadata.primaryAgentRoleAlias === 'string' && metadata.primaryAgentRoleAlias.trim()) ||
    (typeof metadata.primaryAgentRole === 'string' && metadata.primaryAgentRole.trim()) ||
    undefined

  if (!alias) {
    return null
  }

  const resolved = resolvePrimaryAgentRolePolicy(alias)
  if (!resolved) {
    const knownAliases = listPrimaryAgentRoleAliases().join(', ')
    return {
      error:
        `Unknown primary role alias "${alias}". ` +
        `Use one of: ${knownAliases}. ` +
        `Canonical mappings: ${formatPrimaryRoleAliasExamples()}.`
    }
  }

  const workflowStage =
    typeof metadata.workflowStage === 'string' && metadata.workflowStage.trim()
      ? metadata.workflowStage.trim()
      : undefined

  const override =
    metadata.roleBoundaryOverride && typeof metadata.roleBoundaryOverride === 'object'
      ? (metadata.roleBoundaryOverride as Record<string, unknown>)
      : undefined

  return {
    policy: resolved,
    workflowStage,
    override
  }
}

export class DelegateEngine {
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private _bindingService: BindingService | null = null
  private _agentRunService: AgentRunService | null = null
  private static readonly runLogContext = new AsyncLocalStorage<{ runId: string }>()
  private static readonly runTraceIds = new Map<string, string>()
  private static toolExecutionLoggingPatched = false

  // 动态 Prompt 系统
  private promptBuilder: DynamicPromptBuilder
  private categoryResolver: CategoryResolver

  constructor(promptBuilderConfig?: PromptBuilderConfig) {
    this.promptBuilder = new DynamicPromptBuilder(promptBuilderConfig)
    this.categoryResolver = new CategoryResolver()
  }

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  private get bindingService() {
    if (!this._bindingService) {
      this._bindingService = BindingService.getInstance()
    }
    return this._bindingService
  }

  private get agentRunService() {
    if (!this._agentRunService) {
      this._agentRunService = AgentRunService.getInstance()
    }
    return this._agentRunService
  }

  async delegateTask(input: DelegateTaskInput): Promise<DelegateTaskResult> {
    const {
      sessionId,
      description,
      prompt,
      category,
      subagent_type,
      parentTaskId,
      metadata,
      abortSignal,
      runInBackground,
      model: overrideModel,
      baseURL: overrideBaseURL,
      apiKey: overrideApiKey
    } = input
    const resolvedCategory = typeof category === 'string' ? category.trim() || undefined : undefined
    const resolvedSubagentType =
      typeof subagent_type === 'string' ? subagent_type.trim() || undefined : undefined

    if (!sessionId) {
      throw new Error('sessionId is required for delegateTask')
    }
    const resolvedSessionId = sessionId
    const workspaceDir = await this.resolveWorkspaceDirForSession(resolvedSessionId)
    const loadSkills = this.normalizeLoadSkills(input.loadSkills)
    const metadataInput = metadata ?? {}
    const traceId = resolveTraceIdFromMetadata(metadataInput)

    if (!overrideModel && !resolvedSubagentType && !resolvedCategory) {
      throw new Error('Must provide either category or subagent_type')
    }

    const modelSelection: ResolvedModelSelection = await ModelSelectionService.getInstance().resolveModelSelection({
      overrideModelSpec: overrideModel,
      agentCode: resolvedSubagentType,
      categoryCode: resolvedCategory,
      temperatureFallback: undefined
    })

    const modelSource: ModelSource = modelSelection.source
    const modelSelectionSnapshot = buildModelSelectionSnapshot(modelSelection)

    const primaryRoleResolution = resolvePrimaryRolePolicyFromMetadata(metadataInput)
    if (primaryRoleResolution && 'error' in primaryRoleResolution) {
      return {
        taskId: '',
        output: primaryRoleResolution.error,
        success: false,
        agentType: resolvedSubagentType || resolvedCategory,
        model: modelSelection.model,
        modelSource,
        modelSelectionReason: modelSelection.modelSelectionReason,
        modelSelectionSummary: modelSelection.modelSelectionSummary,
        fallbackReason: modelSelection.fallbackReason,
        fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
        systemPromptTokens: 0
      }
    }

    const rolePolicySnapshot =
      primaryRoleResolution && 'policy' in primaryRoleResolution
        ? {
            alias: primaryRoleResolution.policy.alias,
            canonicalAgent: primaryRoleResolution.policy.canonicalAgent,
            canonicalRole: primaryRoleResolution.policy.canonicalRole,
            workflowStage: primaryRoleResolution.workflowStage,
            override: primaryRoleResolution.override,
            recordedAt: new Date().toISOString()
          }
        : undefined

    if (rolePolicySnapshot && resolvedSubagentType && resolvedSubagentType !== rolePolicySnapshot.canonicalAgent) {
      return {
        taskId: '',
        output:
          `Primary role policy conflict: alias "${rolePolicySnapshot.alias}" resolves to ` +
          `"${rolePolicySnapshot.canonicalAgent}", but subagent_type is "${resolvedSubagentType}". ` +
          'Please align explicit primary agent selection with role policy.',
        success: false,
        agentType: resolvedSubagentType || resolvedCategory,
        model: modelSelection.model,
        modelSource,
        modelSelectionReason: modelSelection.modelSelectionReason,
        modelSelectionSummary: modelSelection.modelSelectionSummary,
        fallbackReason: modelSelection.fallbackReason,
        fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
        systemPromptTokens: 0
      }
    }

    const STAGE_OWNERS: Record<string, string> = {
      plan: 'fuxi',
      dispatch: 'haotian',
      checkpoint: 'haotian',
      integration: 'haotian',
      finalize: 'haotian',
      execution: 'kuafu'
    }

    if (isStrictPrimaryRoleModeEnabled() && rolePolicySnapshot?.workflowStage) {
      const expectedOwner = STAGE_OWNERS[rolePolicySnapshot.workflowStage.toLowerCase()]
      const selectedOwner = resolvedSubagentType || rolePolicySnapshot.canonicalAgent
      if (expectedOwner && selectedOwner !== expectedOwner && !rolePolicySnapshot.override) {
        return {
          taskId: '',
          output:
            `Role boundary violation: stage "${rolePolicySnapshot.workflowStage}" requires owner ` +
            `"${expectedOwner}", but got "${selectedOwner}". ` +
            'Use canonical handoff or provide roleBoundaryOverride with audit fields.',
          success: false,
          agentType: resolvedSubagentType || resolvedCategory,
          model: modelSelection.model,
          modelSource,
          modelSelectionReason: modelSelection.modelSelectionReason,
          modelSelectionSummary: modelSelection.modelSelectionSummary,
          fallbackReason: modelSelection.fallbackReason,
          fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
          systemPromptTokens: 0
        }
      }
    }

    const normalizedStage =
      typeof metadataInput.workflowStage === 'string' ? metadataInput.workflowStage.trim().toLowerCase() : ''

    if (resolvedSubagentType === 'fuxi') {
      const hasRoleBoundaryOverride = Boolean(rolePolicySnapshot?.override)
      const blockedByStage =
        !hasRoleBoundaryOverride && normalizedStage.length > 0 && FUXI_BLOCKED_STAGES.has(normalizedStage)
      const blockedByIntent =
        !hasRoleBoundaryOverride &&
        !['plan', 'planning'].includes(normalizedStage) &&
        IMPLEMENTATION_INTENT_PATTERN.test(`${description}\n${prompt}`)

      if (blockedByStage || blockedByIntent) {
        return {
          taskId: '',
          output:
            'FuXi is planning-only and cannot execute implementation tasks. Please handoff to haotian (orchestration) / kuafu (execution).',
          success: false,
          agentType: 'fuxi',
          model: modelSelection.model,
          modelSource,
          modelSelectionReason: modelSelection.modelSelectionReason,
          modelSelectionSummary: modelSelection.modelSelectionSummary,
          fallbackReason: modelSelection.fallbackReason,
          fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
          systemPromptTokens: 0
        }
      }
    }

    const task = await this.prisma.task.create({
      data: {
        sessionId: resolvedSessionId,
        parentTaskId,
        type: 'subtask',
        input: description,
        status: runInBackground ? 'pending' : 'running',
        assignedModel: modelSelection.model,
        assignedAgent: resolvedSubagentType || resolvedCategory,
        metadata: applyTraceMetadata({
          category: resolvedCategory,
          subagent_type: resolvedSubagentType,
          parentTaskId,
          model: modelSelection.model,
          modelSource,
          modelSelection: modelSelectionSnapshot,
          runInBackground: Boolean(runInBackground),
          ...(rolePolicySnapshot ? { primaryAgentRolePolicy: rolePolicySnapshot } : {}),
          ...metadataInput
        }, traceId ? { traceId, startedAt: new Date().toISOString() } : undefined)
      }
    })

    if (metadataInput.taskBrief && typeof metadataInput.taskBrief === 'object') {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...(task.metadata as Record<string, unknown> | undefined),
            taskBrief: {
              ...(metadataInput.taskBrief as Record<string, unknown>),
              taskId: task.id
            }
          }
        }
      })
    }

    this.logger.info('Delegating task', {
      taskId: task.id,
      category: resolvedCategory,
      subagent_type: resolvedSubagentType,
      model: modelSelection.model,
      workspaceDir
    })

    this.ensureToolExecutionRunLogging()

    if (runInBackground) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...(task.metadata as Record<string, unknown> | undefined),
            runInBackground: true,
            backgroundPending: true
          }
        }
      })

      return {
        taskId: task.id,
        output: `Background task started: ${task.id}`,
        success: true,
        agentType: resolvedSubagentType || resolvedCategory,
        model: modelSelection.model,
        modelSource,
        modelSelectionReason: modelSelection.modelSelectionReason,
        modelSelectionSummary: modelSelection.modelSelectionSummary,
        fallbackReason: modelSelection.fallbackReason,
        fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
        systemPromptTokens: 0
      }
    }

    const runId = await this.safeCreateRun(task.id, resolvedSubagentType || resolvedCategory)
    if (runId && traceId) {
      DelegateEngine.runTraceIds.set(runId, traceId)
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...(task.metadata as Record<string, unknown> | undefined),
            runId,
            traceId
          }
        }
      })
    }
    await this.safeAddRunLog(runId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Delegate task started',
      data: {
        taskId: task.id,
        category: resolvedCategory,
        subagent_type: resolvedSubagentType,
        model: modelSelection.model,
        runInBackground: false
      }
    })
    await this.safeAddRunLog(runId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Model selection resolved',
      data: {
        modelId: modelSelection.modelId,
        provider: modelSelection.provider,
        model: modelSelection.model,
        modelSource,
        modelSelectionReason: modelSelection.modelSelectionReason,
        modelSelectionSummary: modelSelection.modelSelectionSummary,
        fallbackReason: modelSelection.fallbackReason,
        fallbackAttemptSummary: modelSelection.fallbackAttemptSummary
      }
    })

    try {
      const apiKey = (overrideApiKey || modelSelection.apiKey || '').trim()
      const baseURL = overrideBaseURL || modelSelection.baseURL

      if (!apiKey) {
        throw new Error(
          `MODEL_CREDENTIAL_MISSING: 模型「${modelSelection.model}」缺少 API Key。请在“设置 -> API Keys/模型”补全后重试。`
        )
      }

      const adapter = createLLMAdapter(modelSelection.provider, {
        apiKey,
        baseURL
      })

      const [agentBinding, categoryBinding, maxToolIterationsSetting] = await Promise.all([
        resolvedSubagentType ? this.bindingService.getAgentBinding(resolvedSubagentType) : Promise.resolve(null),
        resolvedCategory ? this.bindingService.getCategoryBinding(resolvedCategory) : Promise.resolve(null),
        this.prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.MAX_TOOL_ITERATIONS } })
      ])
      const scopedToolNames = resolveScopedRuntimeToolNames({
        subagentType: resolvedSubagentType,
        category: resolvedCategory,
        availableTools: input.availableTools
      })
      const effectiveScopedToolNames =
        scopedToolNames !== undefined
          ? toolExecutionService.getToolDefinitions(scopedToolNames).map(tool => tool.name)
          : undefined
      const scopedToolDefinitions =
        effectiveScopedToolNames !== undefined
          ? toolExecutionService.getToolDefinitions(effectiveScopedToolNames)
          : undefined

      // 根据配置选择使用动态 Prompt 或静态 Prompt
      const useDynamicPrompt = input.useDynamicPrompt !== false
      let systemPrompt: string
      let systemPromptTokens = 0

      if (useDynamicPrompt && (resolvedSubagentType || resolvedCategory)) {
        // 使用动态 Prompt 系统
        const agentCode = resolvedSubagentType || undefined
        const resolvedAgent = agentCode
          ? this.categoryResolver.resolveAgent(agentCode)
          : null
        systemPrompt = await this.buildDynamicSystemPrompt(
          resolvedAgent,
          (effectiveScopedToolNames ?? input.availableTools) || [],
          loadSkills,
          agentBinding?.systemPrompt || (!resolvedSubagentType ? categoryBinding?.systemPrompt : undefined)
        )
        // 当有 category 时，追加 category 特定上下文
        if (resolvedCategory) {
          if (!resolvedSubagentType) {
            systemPrompt = this.applyCategoryOnlyExecutionContract(systemPrompt, resolvedCategory)
          } else {
            const categoryContext = getCategoryPromptByCode(resolvedCategory)
            if (categoryContext) {
              systemPrompt = `${systemPrompt}\n\n${categoryContext}`
            }
          }
        }
        systemPromptTokens = this.promptBuilder.estimateTokens(systemPrompt)
      } else {
        // 回退到静态 Prompt (兼容性)
        const builtinAgentPrompt = resolvedSubagentType ? getAgentPromptByCode(resolvedSubagentType) : undefined
        systemPrompt = resolveSystemPrompt(
          agentBinding?.systemPrompt,
          categoryBinding?.systemPrompt,
          builtinAgentPrompt
        )
        if (resolvedCategory && !resolvedSubagentType) {
          const hasCategoryBindingPrompt = Boolean(categoryBinding?.systemPrompt?.trim())
          // Keep category-only static mode actionable: use LuBan prompt as base
          // when there is no explicit binding prompt, then append category context.
          if (!hasCategoryBindingPrompt && systemPrompt === DEFAULT_SYSTEM_PROMPT) {
            systemPrompt = getAgentPromptByCode('luban') || DEFAULT_SYSTEM_PROMPT
          }
          systemPrompt = this.applyCategoryOnlyExecutionContract(systemPrompt, resolvedCategory)
        }
      }

      // 构建用户消息内容
      let userContent: string
      if (input.delegationProtocol) {
        // 使用结构化委托协议
        const protocol = buildDelegationProtocol(input.delegationProtocol)
        userContent = serializeDelegationProtocol(protocol)
      } else {
        userContent = prompt
      }

      const rawTaskBrief =
        metadataInput.taskBrief && typeof metadataInput.taskBrief === 'object'
          ? (metadataInput.taskBrief as StructuredTaskBrief)
          : null
      if (rawTaskBrief) {
        const taskBrief = {
          ...rawTaskBrief,
          taskId: task.id
        }
        userContent = [
          renderTaskBriefMarkdown(taskBrief),
          '',
          '#### 输出要求',
          `- 最终回复必须包含 TASK_ID: ${task.id}`,
          '- 最终回复必须包含 ACCEPTANCE_CHECKLIST 小节，并逐条对应验收标准。',
          '',
          '#### 原始任务',
          userContent
        ].join('\n')
      }

      const messages: Message[] = [
        {
          id: 'system',
          sessionId: resolvedSessionId,
          role: 'system',
          content: systemPrompt,
          createdAt: new Date(),
          metadata: {}
        },
        {
          id: 'user',
          sessionId: resolvedSessionId,
          role: 'user',
          content: userContent,
          createdAt: new Date(),
          metadata: {}
        }
      ]

      const maxToolIterations = parseSettingInt(maxToolIterationsSetting?.value, 1, 1000)
      const baseConfig = (modelSelection.config ?? {}) as LLMConfig
      const llmConfig: LLMConfig = {
        ...baseConfig,
        model: modelSelection.model,
        temperature: modelSelection.temperature ?? baseConfig.temperature ?? 0.5,
        maxToolIterations: maxToolIterations ?? baseConfig.maxToolIterations,
        workspaceDir,
        sessionId: resolvedSessionId,
        agentCode: resolvedSubagentType,
        tools: scopedToolDefinitions,
        abortSignal,
        traceId,
        taskId: task.id,
        runId: runId || undefined
      }

      await this.safeAddRunLog(runId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Sending delegate task prompt to LLM',
        data: {
          model: modelSelection.model,
          temperature: (modelSelection.temperature ?? 0.5),
          messageCount: messages.length,
          useDynamicPrompt,
          systemPromptTokens,
          maxToolIterations: llmConfig.maxToolIterations
        }
      })
      const invokeModel = async (inputMessages: Message[]) => {
        const invoke = async () =>
          await toolExecutionService.withAllowedTools(effectiveScopedToolNames, async () =>
            adapter.sendMessage(inputMessages, llmConfig)
          )

        return runId
          ? await DelegateEngine.runLogContext.run({ runId }, async () =>
            invoke()
          )
          : await invoke()
      }

      let response = await invokeModel(messages)
      let normalizedUsage = this.normalizeUsage((response as { usage?: unknown }).usage)
      let truncatedOutput = truncateToTokenLimit(response.content, 50000).result

      if (!truncatedOutput.trim()) {
        await this.safeAddRunLog(runId, {
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: 'Delegate task produced empty output; issuing recovery prompt',
          data: { taskId: task.id }
        })

        const recoveryMessages: Message[] = [
          ...messages,
          {
            id: 'user-empty-output-recovery',
            sessionId: resolvedSessionId,
            role: 'user',
            content:
              '你的上一条回复为空。请基于同一任务直接给出最终结果，必须包含可执行的具体内容，禁止空输出。',
            createdAt: new Date(),
            metadata: {}
          }
        ]

        response = await invokeModel(recoveryMessages)
        normalizedUsage = this.normalizeUsage((response as { usage?: unknown }).usage)
        truncatedOutput = truncateToTokenLimit(response.content, 50000).result

        if (!truncatedOutput.trim()) {
          throw new Error('Delegate task returned empty output after recovery prompt')
        }
      }

      if (abortSignal?.aborted) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: 'cancelled',
            output: 'Cancelled by user',
            completedAt: new Date()
          }
        })

        this.logger.info('Task cancelled after abort signal', { taskId: task.id })
        await this.safeFinalizeRun(runId, 'failed')

        return {
          taskId: task.id,
          output: 'Cancelled by user',
          success: false
        }
      }

      await this.safeAddRunLog(runId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Received delegate task response from LLM',
        data: {
          promptTokens: normalizedUsage?.prompt_tokens ?? 0,
          completionTokens: normalizedUsage?.completion_tokens ?? 0
        }
      })

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          output: truncatedOutput,
          completedAt: new Date()
        }
      })

      this.logger.info('Task completed', { taskId: task.id })

      await this.safeFinalizeRun(runId, 'completed', normalizedUsage)

      return {
        taskId: task.id,
        output: truncatedOutput,
        success: true,
        agentType: resolvedSubagentType || resolvedCategory,
        model: modelSelection.model,
        modelSource,
        modelSelectionReason: modelSelection.modelSelectionReason,
        modelSelectionSummary: modelSelection.modelSelectionSummary,
        fallbackReason: modelSelection.fallbackReason,
        fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
        runId: runId || undefined,
        systemPromptTokens
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const cancelled = isAbortRequested(error, abortSignal)

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: cancelled ? 'cancelled' : 'failed',
          output: cancelled ? 'Cancelled by user' : `Error: ${errorMessage}`,
          completedAt: new Date()
        }
      })

      if (cancelled) {
        this.logger.info('Task cancelled', { taskId: task.id })
      } else {
        this.logger.error('Task failed', { taskId: task.id, error: errorMessage })
      }

      await this.safeAddRunLog(runId, {
        timestamp: new Date().toISOString(),
        level: cancelled ? 'info' : 'error',
        message: cancelled ? 'Delegate task cancelled' : 'Delegate task failed',
        data: {
          error: cancelled ? 'Cancelled by user' : errorMessage
        }
      })

      await this.safeFinalizeRun(runId, 'failed')

      return {
        taskId: task.id,
        output: cancelled ? 'Cancelled by user' : errorMessage,
        success: false,
        model: modelSelection.model,
        modelSource,
        modelSelectionReason: modelSelection.modelSelectionReason,
        modelSelectionSummary: modelSelection.modelSelectionSummary,
        fallbackReason: modelSelection.fallbackReason,
        fallbackAttemptSummary: modelSelection.fallbackAttemptSummary,
        runId: runId || undefined
      }
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'cancelled',
        completedAt: new Date()
      }
    })

    this.logger.info('Task cancelled', { taskId })
  }

  private ensureToolExecutionRunLogging(): void {
    if (DelegateEngine.toolExecutionLoggingPatched) {
      return
    }

    const originalExecuteToolCalls =
      toolExecutionService.executeToolCalls.bind(toolExecutionService)

    toolExecutionService.executeToolCalls = async (
      toolCalls: ToolCall[],
      context: ToolExecutionContext | BrowserToolContext,
      config?: ToolExecutionConfig
    ): Promise<LoopIterationResult> => {
      const runId = DelegateEngine.runLogContext.getStore()?.runId
      const traceId = 'traceId' in context ? context.traceId : undefined

      if (runId) {
        await this.safeAddRunLog(runId, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Tool execution batch started',
          data: {
            toolCount: toolCalls.length,
            tools: toolCalls.map(toolCall => toolCall.name),
            traceId: traceId || undefined,
            toolResolutions: toolCalls.map(toolCall => ({
              requestedToolName: toolCall.name,
              resolvedToolName: toolExecutionService.resolveToolName(toolCall.name)
            }))
          }
        })
      }

      const result = await originalExecuteToolCalls(toolCalls, context, config)

      if (runId) {
        for (const output of result.outputs) {
          await this.safeAddRunLog(runId, {
            timestamp: new Date().toISOString(),
            level: output.success ? 'info' : 'error',
            message: 'Tool execution completed',
            data: {
              toolName: output.toolCall.name,
              resolvedToolName: toolExecutionService.resolveToolName(output.toolCall.name),
              toolCallId: output.toolCall.id,
              success: output.success,
              durationMs: output.durationMs,
              error: output.error,
              traceId: traceId || undefined
            }
          })
        }
      }

      return result
    }

    DelegateEngine.toolExecutionLoggingPatched = true
  }

  private async safeCreateRun(taskId: string, agentCode?: string): Promise<string | null> {
    try {
      const run = await this.agentRunService.createRun({ taskId, agentCode })
      return run.id
    } catch (error) {
      this.logger.warn('Failed to create agent run', {
        taskId,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private async safeAddRunLog(runId: string | null, entry: RunLogEntry): Promise<void> {
    if (!runId) {
      return
    }

    const traceId = DelegateEngine.runTraceIds.get(runId)
    const enrichedEntry =
      traceId && (!entry.data || typeof entry.data.traceId !== 'string')
        ? {
            ...entry,
            data: {
              ...(entry.data || {}),
              traceId
            }
          }
        : entry

    try {
      await this.agentRunService.addLog(runId, enrichedEntry)
    } catch (error) {
      this.logger.warn('Failed to append run log', {
        runId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async safeFinalizeRun(
    runId: string | null,
    status: 'completed' | 'failed',
    usage?: { prompt_tokens: number; completion_tokens: number }
  ): Promise<void> {
    if (!runId) {
      return
    }

    try {
      const tokenUsage = usage
        ? {
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
          total: usage.prompt_tokens + usage.completion_tokens
        }
        : undefined

      await this.agentRunService.completeRun(runId, {
        success: status === 'completed',
        tokenUsage
      })
      DelegateEngine.runTraceIds.delete(runId)
    } catch (error) {
      this.logger.warn('Failed to finalize agent run', {
        runId,
        status,
        error: error instanceof Error ? error.message : String(error)
      })
    }
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

  private async resolveWorkspaceDirForSession(sessionId: string): Promise<string> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: { space: true }
      })

      if (session?.space?.workDir) {
        return session.space.workDir
      }

      this.logger.warn('Session workspace not found, falling back to process cwd', {
        sessionId
      })
      return process.cwd()
    } catch (error) {
      this.logger.warn('Failed to resolve session workspace, falling back to process cwd', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      })
      return process.cwd()
    }
  }

  private normalizeUsage(
    usage: unknown
  ): { prompt_tokens: number; completion_tokens: number } | undefined {
    if (!usage || typeof usage !== 'object') {
      return undefined
    }

    const usageRecord = usage as Record<string, unknown>
    const promptRaw = usageRecord.prompt_tokens ?? usageRecord.input_tokens
    const completionRaw = usageRecord.completion_tokens ?? usageRecord.output_tokens
    const promptTokens = typeof promptRaw === 'number' ? promptRaw : 0
    const completionTokens = typeof completionRaw === 'number' ? completionRaw : 0

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens
    }
  }

  private normalizeLoadSkills(raw: DelegateTaskInput['loadSkills']): string[] {
    if (Array.isArray(raw)) {
      return raw.map(item => String(item).trim()).filter(Boolean)
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) return []

      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(item => String(item).trim()).filter(Boolean)
        }
      } catch {
        this.logger.warn('[DelegateEngine] Failed to parse loadSkills JSON string', {
          preview: trimmed.slice(0, 200)
        })
      }
    }

    return []
  }

  private applyCategoryOnlyExecutionContract(basePrompt: string, categoryCode: string): string {
    const segments: string[] = []
    const trimmedBase = basePrompt.trim()
    if (trimmedBase) {
      segments.push(trimmedBase)
    }

    if (!trimmedBase.includes('<Category_Execution_Contract>')) {
      segments.push(CATEGORY_EXECUTION_GUARDRAIL_PROMPT)
    }

    const categoryContext = getCategoryPromptByCode(categoryCode)
    if (categoryContext && !trimmedBase.includes(categoryContext)) {
      segments.push(categoryContext)
    }

    return segments.join('\n\n')
  }

  /**
   * 构建动态系统提示
   * 根据 Agent 类型、可用工具和技能生成丰富的系统提示
   */
  private async buildDynamicSystemPrompt(
    resolvedAgent: ResolvedAgent | null,
    availableTools: string[],
    loadSkills: string[],
    customPrompt?: string | null
  ): Promise<string> {
    // 如果提供了自定义提示，优先使用
    if (customPrompt?.trim()) {
      return customPrompt.trim()
    }

    // 如果没有解析到 Agent，使用默认提示
    if (!resolvedAgent) {
      // Category-routed execution tasks may not include subagent_type.
      // Fall back to LuBan execution prompt instead of a generic system prompt.
      return getAgentPromptByCode('luban') || DEFAULT_SYSTEM_PROMPT
    }

    // Use curated per-agent static prompts by default for worker specialists.
    // Dynamic composition remains reserved for the orchestrator (haotian).
    const curatedPrompt = getAgentPromptByCode(resolvedAgent.code)
    if (resolvedAgent.code !== 'haotian' && curatedPrompt?.trim()) {
      return curatedPrompt.trim()
    }

    // 根据 Agent 类别选择不同的 Prompt 构建策略
    const agentCategory = resolvedAgent.metadata.category

    switch (agentCategory) {
      case 'utility':
        // 昊天使用动态编排 Prompt；其他 utility agent 使用各自静态模板避免角色串味
        if (resolvedAgent.code !== 'haotian') {
          return getAgentPromptByCode(resolvedAgent.code) || resolvedAgent.description || DEFAULT_SYSTEM_PROMPT
        }
        return this.buildOrchestratorPromptForAgent(resolvedAgent, availableTools, loadSkills)

      case 'exploration':
        // 探索类型 (如 qianliyan)：专注于代码探索
        return this.buildExplorationPromptForAgent(resolvedAgent, availableTools)

      case 'advisor':
        // 顾问类型 (如 baize)：专注于推理和建议
        return this.buildAdvisorPromptForAgent(resolvedAgent)

      case 'specialist':
        // 专家类型：使用 Agent 特定的提示
        return this.buildSpecialistPromptForAgent(resolvedAgent, availableTools)

      default:
        return resolvedAgent.description || DEFAULT_SYSTEM_PROMPT
    }
  }

  /**
   * 为编排器 Agent 构建 Prompt
   */
  private buildOrchestratorPromptForAgent(
    agent: ResolvedAgent,
    availableTools: string[],
    loadSkills: string[]
  ): string {
    const agents = this.promptBuilder.getDefaultAvailableAgents()
    const categories = this.promptBuilder.getDefaultAvailableCategories()

    // 构建技能列表
    const skills: AvailableSkill[] = loadSkills.map(name => ({
      name,
      description: `已加载的技能: ${name}`,
      location: 'plugin'
    }))

    return this.promptBuilder.buildOrchestratorPrompt(agents, availableTools, skills, categories)
  }

  /**
   * 为探索型 Agent 构建 Prompt
   */
  private buildExplorationPromptForAgent(agent: ResolvedAgent, availableTools: string[]): string {
    const toolList = availableTools.length > 0 ? availableTools.join(', ') : '所有可用工具'

    return `<Role>
你是"${agent.chineseName}" - CodeAll 的代码探索专家。

**身份**: ${agent.description}

**核心能力**:
- 高效搜索和分析代码库
- 识别模式和依赖关系
- 提供精确的文件位置和上下文

**可用工具**: ${toolList}
</Role>

<Behavior_Instructions>
## 搜索策略

1. **优先使用高效工具**
   - 使用 grep 进行内容搜索
   - 使用 glob 进行文件匹配
   - 使用 read 查看具体文件

2. **结果格式**
   - 始终使用绝对路径
   - 包含相关代码片段
   - 说明每个结果的相关性

3. **效率原则**
   - 避免读取不必要的文件
   - 使用针对性的搜索模式
   - 限制结果数量（通常 10 个以内）
</Behavior_Instructions>

<Constraints>
- 不创建或修改任何文件
- 不执行可能有副作用的命令
- 专注于信息收集和分析
</Constraints>`
  }

  /**
   * 为顾问型 Agent 构建 Prompt
   */
  private buildAdvisorPromptForAgent(agent: ResolvedAgent): string {
    return `<Role>
你是"${agent.chineseName}" - CodeAll 的高级技术顾问。

**身份**: ${agent.description}

**核心能力**:
- 深度技术分析和架构评审
- 问题诊断和解决方案建议
- 代码质量和最佳实践指导

**工作模式**: 只读、咨询性质。提供建议但不直接修改代码。
</Role>

<Behavior_Instructions>
## 咨询流程

1. **理解问题**
   - 分析用户描述的问题本质
   - 识别可能的根本原因
   - 考虑相关的技术约束

2. **提供建议**
   - 给出 2-3 个可行方案
   - 说明每个方案的优缺点
   - 推荐最佳方案并说明理由

3. **行动计划**
   - 提供不超过 7 个步骤的行动计划
   - 标注工作量估计
   - 指出潜在风险

## 输出格式

### 问题分析
[简要分析]

### 推荐方案
[具体建议]

### 行动计划
1. [步骤1] - [工作量]
2. [步骤2] - [工作量]
...

### 注意事项
[风险和注意点]
</Behavior_Instructions>

<Constraints>
- 不直接修改代码
- 不做出超出请求范围的建议
- 避免冗长的分析，保持简洁
</Constraints>`
  }

  /**
   * 为专家型 Agent 构建 Prompt
   */
  private buildSpecialistPromptForAgent(agent: ResolvedAgent, availableTools: string[]): string {
    const toolList = availableTools.length > 0 ? availableTools.join(', ') : agent.tools.join(', ')

    return `<Role>
你是"${agent.chineseName}" - CodeAll 的专业 Agent。

**身份**: ${agent.description}

**专业领域**: ${agent.metadata.triggers.map(t => t.domain).join(', ') || '通用'}

**可用工具**: ${toolList}
</Role>

<Behavior_Instructions>
## 工作流程

1. **理解任务**
   - 仔细阅读任务描述
   - 识别关键要求和约束
   - 确认预期产出

2. **执行任务**
   - 使用适当的工具
   - 遵循现有代码风格
   - 保持变更最小化

3. **验证结果**
   - 确认任务完成
   - 检查无类型错误
   - 验证无意外副作用
</Behavior_Instructions>

<Constraints>
- 不使用 \`as any\` 或 \`@ts-ignore\`
- 不删除现有功能
- 在修复 bug 时不进行重构
- 未经请求不提交代码
</Constraints>`
  }
}

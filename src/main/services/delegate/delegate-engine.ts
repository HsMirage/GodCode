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
  toolExecutionService,
  type ToolCall,
  type ToolExecutionConfig,
  type LoopIterationResult
} from '@/main/services/tools/tool-execution.service'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import type { BrowserToolContext } from '@/main/services/ai-browser/types'
import type { Message } from '@/types/domain'
import { AsyncLocalStorage } from 'node:async_hooks'

// 动态 Prompt 系统
import { DynamicPromptBuilder, type PromptBuilderConfig } from './dynamic-prompt-builder'
import { CategoryResolver, type ResolvedAgent } from './category-resolver'
import { resolveScopedRuntimeToolNames } from './tool-allowlist'
import {
  buildDelegationProtocol,
  serializeDelegationProtocol,
  type DelegationProtocolInput
} from './delegation-protocol'
import type { AvailableSkill, AvailableCategory } from './category-constants'

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
  loadSkills?: string[]
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
  /** 使用的系统提示长度 (tokens 估算) */
  systemPromptTokens?: number
}

const DEFAULT_SYSTEM_PROMPT = 'You are CodeAll, an AI coding agent.'

/**
 * 旧版本系统提示解析 (兼容性保留)
 * @deprecated 使用 DynamicPromptBuilder 代替
 */
function resolveSystemPrompt(
  agentPrompt: string | null | undefined,
  categoryPrompt: string | null | undefined
): string {
  if (agentPrompt?.trim()) return agentPrompt.trim()
  if (categoryPrompt?.trim()) return categoryPrompt.trim()
  return DEFAULT_SYSTEM_PROMPT
}

function isAbortRequested(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return /aborted|abort|cancelled by user|cancelled/i.test(error.message)
}

export class DelegateEngine {
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private _bindingService: BindingService | null = null
  private _agentRunService: AgentRunService | null = null
  private static readonly runLogContext = new AsyncLocalStorage<{ runId: string }>()
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
      model: overrideModel,
      baseURL: overrideBaseURL,
      apiKey: overrideApiKey
    } = input

    if (!sessionId) {
      throw new Error('sessionId is required for delegateTask')
    }
    const resolvedSessionId = sessionId
    const workspaceDir = await this.resolveWorkspaceDirForSession(resolvedSessionId)

    let modelConfig: {
      model: string
      temperature: number
      provider: string
      apiKey?: string
      baseURL?: string
    }

    if (overrideModel) {
      const parsed = this.parseModelSpecifier(overrideModel)
      modelConfig = {
        model: parsed.model,
        temperature: 0.5,
        provider: parsed.provider
      }
    } else if (subagent_type) {
      // 从数据库获取 Agent 绑定配置
      const agentConfig = await this.bindingService.getAgentModelConfig(subagent_type)
      if (!agentConfig) {
        throw new Error(
          `Agent「${subagent_type}」未配置可用模型。` +
            `请在“设置 -> Agent 绑定”中为该 Agent 绑定模型，或设置系统默认模型。`
        )
      }
      modelConfig = {
        model: agentConfig.model,
        temperature: agentConfig.temperature,
        provider: agentConfig.provider,
        apiKey: agentConfig.apiKey,
        baseURL: agentConfig.baseURL
      }
    } else if (category) {
      // 从数据库获取 Category 绑定配置
      const config = await this.bindingService.getCategoryModelConfig(category)
      if (!config) {
        throw new Error(
          `任务类别「${category}」未配置可用模型。` +
            `请在“设置 -> Agent 绑定 -> 任务类别”中绑定模型，或设置系统默认模型。`
        )
      }
      modelConfig = {
        model: config.model,
        temperature: config.temperature,
        provider: config.provider,
        apiKey: config.apiKey,
        baseURL: config.baseURL
      }
    } else {
      throw new Error('Must provide either category or subagent_type')
    }

    const task = await this.prisma.task.create({
      data: {
        sessionId: resolvedSessionId,
        parentTaskId,
        type: 'subtask',
        input: description,
        status: 'running',
        assignedModel: modelConfig.model,
        assignedAgent: subagent_type || category,
        metadata: {
          category,
          subagent_type,
          parentTaskId,
          model: modelConfig.model,
          ...(metadata || {})
        }
      }
    })

    this.logger.info('Delegating task', {
      taskId: task.id,
      category,
      subagent_type,
      model: modelConfig.model,
      workspaceDir
    })

    this.ensureToolExecutionRunLogging()

    const runId = await this.safeCreateRun(task.id, subagent_type || category)
    await this.safeAddRunLog(runId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Delegate task started',
      data: {
        taskId: task.id,
        category,
        subagent_type,
        model: modelConfig.model
      }
    })

    try {
      // 优先级: 1. 调用时覆盖 -> 2. 绑定配置 -> 3. Provider 默认
      let apiKey: string = overrideApiKey || modelConfig.apiKey || ''
      let baseURL: string | undefined = overrideBaseURL || modelConfig.baseURL

      // If the model is coming from bindings/system default, do not silently fall back to
      // any other provider credential. Missing API key here must be fixed by the user.
      if (!apiKey && !overrideModel) {
        throw new Error(
          `当前绑定的模型「${modelConfig.model}」缺少 API Key。` +
            `请到“设置 -> API Keys/模型”补全，或切换模型后重试。`
        )
      }

      // For explicit overrideModel, allow provider-level fallback for backward compatibility.
      if (!apiKey || !baseURL) {
        const model = await this.getModelByProvider(modelConfig.provider)
        if (!model && !apiKey) {
          throw new Error(`No model configured for provider: ${modelConfig.provider}`)
        }
        apiKey = apiKey || model?.apiKey || ''
        baseURL = baseURL || model?.baseURL || undefined
      }

      const adapter = createLLMAdapter(modelConfig.provider, {
        apiKey,
        baseURL
      })

      const [agentBinding, categoryBinding] = await Promise.all([
        subagent_type ? this.bindingService.getAgentBinding(subagent_type) : Promise.resolve(null),
        category ? this.bindingService.getCategoryBinding(category) : Promise.resolve(null)
      ])
      const scopedToolNames = resolveScopedRuntimeToolNames({
        subagentType: subagent_type,
        category,
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

      if (useDynamicPrompt && subagent_type) {
        // 使用动态 Prompt 系统
        const resolvedAgent = this.categoryResolver.resolveAgent(subagent_type)
        systemPrompt = await this.buildDynamicSystemPrompt(
          resolvedAgent,
          (effectiveScopedToolNames ?? input.availableTools) || [],
          input.loadSkills || [],
          agentBinding?.systemPrompt
        )
        systemPromptTokens = this.promptBuilder.estimateTokens(systemPrompt)
      } else {
        // 回退到静态 Prompt (兼容性)
        systemPrompt = resolveSystemPrompt(
          agentBinding?.systemPrompt,
          categoryBinding?.systemPrompt
        )
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

      await this.safeAddRunLog(runId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Sending delegate task prompt to LLM',
        data: {
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          messageCount: messages.length,
          useDynamicPrompt,
          systemPromptTokens
        }
      })

      const llmConfig: LLMConfig = {
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        workspaceDir,
        sessionId: resolvedSessionId,
        agentCode: subagent_type,
        tools: scopedToolDefinitions,
        abortSignal
      }
      const invokeModel = async () =>
        await toolExecutionService.withAllowedTools(effectiveScopedToolNames, async () =>
          adapter.sendMessage(messages, llmConfig)
        )

      const response = runId
        ? await DelegateEngine.runLogContext.run({ runId }, async () =>
            invokeModel()
          )
        : await invokeModel()
      const normalizedUsage = this.normalizeUsage((response as { usage?: unknown }).usage)

      const truncatedOutput = truncateToTokenLimit(response.content, 50000).result

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
        agentType: subagent_type,
        model: modelConfig.model,
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
        success: false
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

      if (runId) {
        await this.safeAddRunLog(runId, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Tool execution batch started',
          data: {
            toolCount: toolCalls.length,
            tools: toolCalls.map(toolCall => toolCall.name)
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
              toolCallId: output.toolCall.id,
              success: output.success,
              durationMs: output.durationMs,
              error: output.error
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

    try {
      await this.agentRunService.addLog(runId, entry)
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
    } catch (error) {
      this.logger.warn('Failed to finalize agent run', {
        runId,
        status,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private getProviderFromModel(_model: string): string {
    return 'openai-compatible'
  }

  private parseModelSpecifier(spec: string): { provider: string; model: string } {
    const trimmed = spec.trim()
    const parts = trimmed.split('/')
    if (parts.length >= 2) {
      return { provider: parts[0], model: parts.slice(1).join('/') }
    }
    return { provider: this.getProviderFromModel(trimmed), model: trimmed }
  }

  private async getModelByProvider(provider: string) {
    return await this.prisma.model.findFirst({
      where: { provider },
      orderBy: { createdAt: 'desc' }
    })
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
      return DEFAULT_SYSTEM_PROMPT
    }

    // 根据 Agent 类别选择不同的 Prompt 构建策略
    const agentCategory = resolvedAgent.metadata.category

    switch (agentCategory) {
      case 'utility':
        // 编排器类型 (如 haotian)：使用完整的 Orchestrator Prompt
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

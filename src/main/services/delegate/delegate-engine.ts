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

export interface DelegateTaskInput {
  description: string
  prompt: string
  category?: string
  subagent_type?: string
  parentTaskId?: string
  model?: string
  baseURL?: string
  apiKey?: string
}

export interface DelegateTaskResult {
  taskId: string
  output: string
  success: boolean
}

const DEFAULT_SYSTEM_PROMPT = 'You are CodeAll, an AI coding agent.'

function resolveSystemPrompt(
  agentPrompt: string | null | undefined,
  categoryPrompt: string | null | undefined
): string {
  if (agentPrompt?.trim()) return agentPrompt.trim()
  if (categoryPrompt?.trim()) return categoryPrompt.trim()
  return DEFAULT_SYSTEM_PROMPT
}

export class DelegateEngine {
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private _bindingService: BindingService | null = null
  private _agentRunService: AgentRunService | null = null
  private static readonly runLogContext = new AsyncLocalStorage<{ runId: string }>()
  private static toolExecutionLoggingPatched = false

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
      description,
      prompt,
      category,
      subagent_type,
      parentTaskId,
      model: overrideModel,
      baseURL: overrideBaseURL,
      apiKey: overrideApiKey
    } = input

    let modelConfig: {
      model: string
      temperature: number
      provider: string
      apiKey?: string
      baseURL?: string
    }

    if (overrideModel) {
      modelConfig = {
        model: overrideModel,
        temperature: 0.5,
        provider: this.getProviderFromModel(overrideModel)
      }
    } else if (category) {
      // 从数据库获取 Category 绑定配置
      const config = await this.bindingService.getCategoryModelConfig(category)
      if (!config) {
        throw new Error(`Category not found or disabled: ${category}`)
      }
      modelConfig = {
        model: config.model,
        temperature: config.temperature,
        provider: this.getProviderFromModel(config.model),
        apiKey: config.apiKey,
        baseURL: config.baseURL
      }
    } else if (subagent_type) {
      // 从数据库获取 Agent 绑定配置
      const config = await this.bindingService.getAgentModelConfig(subagent_type)
      if (!config) {
        throw new Error(`Agent not found or disabled: ${subagent_type}`)
      }
      modelConfig = {
        model: config.model,
        temperature: config.temperature,
        provider: this.getProviderFromModel(config.model),
        apiKey: config.apiKey,
        baseURL: config.baseURL
      }
    } else {
      throw new Error('Must provide either category or subagent_type')
    }

    const session = await this.getOrCreateDefaultSession()

    const task = await this.prisma.task.create({
      data: {
        sessionId: session.id,
        type: 'subtask',
        input: description,
        status: 'running',
        metadata: {
          category,
          subagent_type,
          parentTaskId,
          model: modelConfig.model
        }
      }
    })

    this.logger.info('Delegating task', {
      taskId: task.id,
      category,
      subagent_type,
      model: modelConfig.model
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

      const systemPrompt = resolveSystemPrompt(
        agentBinding?.systemPrompt,
        categoryBinding?.systemPrompt
      )

      const messages: Message[] = [
        {
          id: 'system',
          sessionId: session.id,
          role: 'system',
          content: systemPrompt,
          createdAt: new Date(),
          metadata: {}
        },
        {
          id: 'user',
          sessionId: session.id,
          role: 'user',
          content: prompt,
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
          messageCount: messages.length
        }
      })

      const response = runId
        ? await DelegateEngine.runLogContext.run({ runId }, async () =>
            adapter.sendMessage(messages, {
              model: modelConfig.model,
              temperature: modelConfig.temperature
            })
          )
        : await adapter.sendMessage(messages, {
            model: modelConfig.model,
            temperature: modelConfig.temperature
          })

      const truncatedOutput = truncateToTokenLimit(response.content, 50000).result

      await this.safeAddRunLog(runId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Received delegate task response from LLM',
        data: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens
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

      await this.safeFinalizeRun(runId, 'completed', response.usage)

      return {
        taskId: task.id,
        output: truncatedOutput,
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          output: `Error: ${errorMessage}`,
          completedAt: new Date()
        }
      })

      this.logger.error('Task failed', { taskId: task.id, error: errorMessage })

      await this.safeAddRunLog(runId, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Delegate task failed',
        data: {
          error: errorMessage
        }
      })

      await this.safeFinalizeRun(runId, 'failed')

      return {
        taskId: task.id,
        output: errorMessage,
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
}

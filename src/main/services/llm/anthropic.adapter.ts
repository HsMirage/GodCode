/**
 * Anthropic Claude API Adapter
 *
 * Native adapter for Anthropic's Claude models using the official SDK.
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku, etc.
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageParam,
  ContentBlock,
  ToolUseBlock,
  TextBlock,
  ToolResultBlockParam,
  Tool as AnthropicTool,
  MessageStreamEvent
} from '@anthropic-ai/sdk/resources/messages'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { browserViewManager } from '@/main/services/browser-view.service'
import { toolExecutionService, type ToolCall } from '@/main/services/tools/tool-execution.service'
import { resolveLLMRuntimeConfig } from './runtime-config'
import { getLLMRetryDecision } from './retry-utils'
import { llmRetryNotifier } from './retry-notifier'

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const hasUserCancellationMarker = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('cancelled by user') ||
    normalized.includes('canceled by user') ||
    normalized.includes('workflow cancelled by user') ||
    normalized.includes('request aborted by user')
  )
}

const isAbortRequested = (error: unknown, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true
  if (!(error instanceof Error)) return false
  return hasUserCancellationMarker(error.message)
}

/**
 * Convert CodeAll messages to Anthropic message format
 */
function toAnthropicMessages(messages: Message[]): {
  systemPrompt: string | undefined
  messages: MessageParam[]
} {
  let systemPrompt: string | undefined
  const anthropicMessages: MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic uses a separate system parameter
      systemPrompt = (systemPrompt ? systemPrompt + '\n\n' : '') + msg.content
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content
      })
    }
  }

  // Ensure messages alternate between user and assistant
  // Anthropic requires this pattern
  const normalizedMessages = normalizeMessageOrder(anthropicMessages)

  return { systemPrompt, messages: normalizedMessages }
}

/**
 * Normalize message order to ensure alternating user/assistant pattern
 * Anthropic requires messages to alternate between user and assistant
 */
function normalizeMessageOrder(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return messages

  const normalized: MessageParam[] = []

  for (const msg of messages) {
    const lastRole = normalized.length > 0 ? normalized[normalized.length - 1].role : null

    if (lastRole === msg.role) {
      // Same role as previous - merge content
      const lastMsg = normalized[normalized.length - 1]
      if (typeof lastMsg.content === 'string' && typeof msg.content === 'string') {
        lastMsg.content = lastMsg.content + '\n\n' + msg.content
      }
    } else {
      normalized.push({ ...msg })
    }
  }

  // Ensure first message is from user
  if (normalized.length > 0 && normalized[0].role !== 'user') {
    normalized.unshift({
      role: 'user',
      content: 'Please continue.'
    })
  }

  return normalized
}

/**
 * Convert tool definitions to Anthropic format
 */
function getAnthropicTools(
  scopedTools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
): AnthropicTool[] {
  const toolDefs = scopedTools ?? toolExecutionService.getToolDefinitions()
  return toolDefs.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      ...(tool.parameters as Record<string, unknown>)
    }
  }))
}

/**
 * Extract tool use blocks from content
 */
function extractToolUseBlocks(content: ContentBlock[]): ToolUseBlock[] {
  return content.filter((block): block is ToolUseBlock => block.type === 'tool_use')
}

/**
 * Extract text content from content blocks
 */
function extractTextContent(content: ContentBlock[]): string {
  return content
    .filter((block): block is TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/**
 * Parse tool use blocks into ToolCall format
 */
function parseToolCalls(toolUseBlocks: ToolUseBlock[]): ToolCall[] {
  return toolUseBlocks.map(block => ({
    id: block.id,
    name: block.name,
    arguments: block.input as Record<string, unknown>
  }))
}

export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic
  private fallbackModel: string

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      baseURL: baseURL || undefined
    })
    this.fallbackModel = ''
  }

  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    const { systemPrompt, messages: anthropicMessages } = toAnthropicMessages(messages)
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const tools = getAnthropicTools(config.tools)
    const maxTokens = config.maxTokens || config.maxOutputTokens || runtime.defaultMaxTokens
    const thinking =
      config.thinkingMode === true
        ? // Anthropic extended thinking requires a minimum budget of 1024 tokens.
          ({ type: 'enabled', budget_tokens: 1024 } as const)
        : undefined
    const maxTokensForRequest = thinking ? Math.max(maxTokens, 1024) : maxTokens

    let currentMessages = [...anthropicMessages]
    let fullContent = ''
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0 }

    for (let iteration = 0; iteration < runtime.maxToolIterations; iteration++) {
      for (let attempt = 1; ; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let externalAbortHandler: (() => void) | null = null
        try {
          if (config.abortSignal?.aborted) {
            throw new Error('Request aborted by user')
          }

          const controller = new AbortController()
          timeoutId = setTimeout(() => controller.abort(), runtime.timeoutMs)

          if (config.abortSignal) {
            externalAbortHandler = () => controller.abort()
            config.abortSignal.addEventListener('abort', externalAbortHandler, { once: true })
          }

          const response = await this.client.messages.create(
            {
              model,
              max_tokens: maxTokensForRequest,
              system: systemPrompt,
              messages: currentMessages,
              temperature: config.temperature,
              top_p: config.topP,
              stop_sequences: config.stopSequences,
              thinking,
              tools: tools.length > 0 ? tools : undefined
            },
            { signal: controller.signal }
          )

          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          // Accumulate usage
          totalUsage.prompt_tokens += response.usage.input_tokens
          totalUsage.completion_tokens += response.usage.output_tokens

          // Extract text content
          const textContent = extractTextContent(response.content)
          fullContent += textContent

          // Check for tool use
          const toolUseBlocks = extractToolUseBlocks(response.content)

          if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
            // No tool calls - return final response
            return { content: fullContent, usage: totalUsage }
          }

          logger.info('sendMessage: executing tool calls', {
            iteration,
            toolCount: toolUseBlocks.length,
            tools: toolUseBlocks.map(tc => tc.name)
          })

          // Execute tool calls
          const parsedToolCalls = parseToolCalls(toolUseBlocks)
          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = {
            viewId,
            webContents,
            workspaceDir: config.workspaceDir || process.cwd(),
            sessionId: config.sessionId || '',
            traceId: config.traceId,
            taskId: config.taskId,
            runId: config.runId
          }

          const executionResult = await toolExecutionService.executeToolCalls(
            parsedToolCalls,
            context
          )

          logger.info('sendMessage: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          // Append assistant message with tool use
          currentMessages = [
            ...currentMessages,
            {
              role: 'assistant' as const,
              content: response.content
            }
          ]

          // Append tool results
          const toolResults: ToolResultBlockParam[] = executionResult.outputs.map(output => ({
            type: 'tool_result' as const,
            tool_use_id: output.toolCall.id,
            content: JSON.stringify(output.result)
          }))

          currentMessages.push({
            role: 'user' as const,
            content: toolResults
          })

          // Continue to next iteration
          break
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
          }

          if (isAbortRequested(error, config.abortSignal)) {
            logger.info('Anthropic request aborted by user')
            throw error instanceof Error ? error : new Error('Request aborted by user')
          }
          const retryDecision = getLLMRetryDecision({
            error,
            attempt,
            maxRetries: runtime.maxRetries,
            baseDelayMs: runtime.baseDelayMs
          })
          if (!retryDecision.retryable) {
            throw error
          }
          if (!retryDecision.retryAllowed) {
            logger.error('Anthropic request failed without retry continuation', {
              error,
              attempt,
              maxAttempts: retryDecision.maxAttempts,
              classification: retryDecision.classification,
              nextAction: retryDecision.nextAction,
              manualTakeoverRequired: retryDecision.manualTakeoverRequired
            })
            throw error instanceof Error ? error : new Error(String(error))
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.warn(`Anthropic request failed (attempt ${attempt}), reconnecting`, {
            error,
            delayMs: retryDecision.delayMs,
            classification: retryDecision.classification,
            nextAction: retryDecision.nextAction,
            maxAttempts: retryDecision.maxAttempts
          })
          llmRetryNotifier.notify({
            sessionId: config.sessionId,
            provider: 'anthropic',
            attempt,
            delayMs: retryDecision.delayMs,
            error: errorMessage,
            classification: retryDecision.classification,
            nextAction: retryDecision.nextAction,
            manualTakeoverRequired: retryDecision.manualTakeoverRequired,
            occurredAt: new Date()
          })
          await sleep(retryDecision.delayMs)
        }
      }
    }

    // Exceeded max tool iterations
    logger.warn('sendMessage: max tool iterations exceeded', {
      maxIterations: runtime.maxToolIterations
    })
    return { content: fullContent, usage: totalUsage }
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const { systemPrompt, messages: anthropicMessages } = toAnthropicMessages(messages)
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const tools = getAnthropicTools(config.tools)
    const maxTokens = config.maxTokens || config.maxOutputTokens || runtime.defaultMaxTokens
    const thinking =
      config.thinkingMode === true ? ({ type: 'enabled', budget_tokens: 1024 } as const) : undefined
    const maxTokensForRequest = thinking ? Math.max(maxTokens, 1024) : maxTokens

    logger.info('[AnthropicAdapter] streamMessage called', {
      model,
      configModel: config.model,
      messageCount: messages.length
    })

    let currentMessages = [...anthropicMessages]
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0 }

    for (let iteration = 0; iteration < runtime.maxToolIterations; iteration++) {
      for (let attempt = 1; ; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let externalAbortHandler: (() => void) | null = null
        try {
          if (config.abortSignal?.aborted) {
            yield { content: '', done: true, type: 'done' }
            return
          }

          const controller = new AbortController()
          timeoutId = setTimeout(() => controller.abort(), runtime.timeoutMs)

          if (config.abortSignal) {
            externalAbortHandler = () => controller.abort()
            config.abortSignal.addEventListener('abort', externalAbortHandler, { once: true })
          }

          const stream = this.client.messages.stream(
            {
              model,
              max_tokens: maxTokensForRequest,
              system: systemPrompt,
              messages: currentMessages,
              temperature: config.temperature,
              top_p: config.topP,
              stop_sequences: config.stopSequences,
              thinking,
              tools: tools.length > 0 ? tools : undefined
            },
            { signal: controller.signal }
          )

          // Accumulate state during streaming
          let assistantContent: ContentBlock[] = []
          let currentToolUse: { id: string; name: string; input: string } | null = null
          let stopReason: string | null = null

          for await (const event of stream) {
            yield* this.processStreamEvent(event, currentToolUse, (toolUse) => {
              currentToolUse = toolUse
            })

            // Capture final message state
            if (event.type === 'message_stop') {
              const finalMessage = await stream.finalMessage()
              assistantContent = finalMessage.content
              stopReason = finalMessage.stop_reason
              const usage = (finalMessage as { usage?: { input_tokens?: number; output_tokens?: number } }).usage
              if (usage) {
                totalUsage.prompt_tokens += usage.input_tokens ?? 0
                totalUsage.completion_tokens += usage.output_tokens ?? 0
              }
            }

            if (event.type === 'message_delta') {
              stopReason = (event.delta as { stop_reason?: string }).stop_reason || stopReason
            }
          }

          clearTimeout(timeoutId)
          timeoutId = null

          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          // Check for tool use
          const toolUseBlocks = extractToolUseBlocks(assistantContent)

          if (toolUseBlocks.length === 0 || stopReason !== 'tool_use') {
            // No tool calls - we're done
            if (totalUsage.prompt_tokens > 0 || totalUsage.completion_tokens > 0) {
              yield {
                content: '',
                done: false,
                type: 'usage',
                usage: {
                  promptTokens: totalUsage.prompt_tokens,
                  completionTokens: totalUsage.completion_tokens,
                  totalTokens: totalUsage.prompt_tokens + totalUsage.completion_tokens
                }
              }
            }
            yield { content: '', done: true, type: 'done' }
            return
          }

          logger.info('streamMessage: executing tool calls', {
            iteration,
            toolCount: toolUseBlocks.length,
            tools: toolUseBlocks.map(tc => tc.name)
          })

          // Execute tool calls
          const parsedToolCalls = parseToolCalls(toolUseBlocks)
          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = {
            viewId,
            webContents,
            workspaceDir: config.workspaceDir || process.cwd(),
            sessionId: config.sessionId || '',
            traceId: config.traceId,
            taskId: config.taskId,
            runId: config.runId
          }

          const executionResult = await toolExecutionService.executeToolCalls(
            parsedToolCalls,
            context
          )

          logger.info('streamMessage: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          // Emit tool_end events
          for (const output of executionResult.outputs) {
            yield {
              content: '',
              done: false,
              type: 'tool_end',
              toolCall: {
                id: output.toolCall.id,
                name: output.toolCall.name,
                arguments: output.toolCall.arguments,
                result: output.result,
                permissionPreview: output.permissionPreview
              }
            }
          }

          // Append assistant message with tool use
          currentMessages = [
            ...currentMessages,
            {
              role: 'assistant' as const,
              content: assistantContent
            }
          ]

          // Append tool results
          const toolResults: ToolResultBlockParam[] = executionResult.outputs.map(output => ({
            type: 'tool_result' as const,
            tool_use_id: output.toolCall.id,
            content: JSON.stringify(output.result)
          }))

          currentMessages.push({
            role: 'user' as const,
            content: toolResults
          })

          // Continue to next iteration
          break
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          if (isAbortRequested(error, config.abortSignal)) {
            logger.info('Anthropic streaming aborted by user')
            yield { content: '', done: true, type: 'done' }
            return
          }
          const retryDecision = getLLMRetryDecision({
            error,
            attempt,
            maxRetries: runtime.maxRetries,
            baseDelayMs: runtime.baseDelayMs
          })
          if (!retryDecision.retryable) {
            throw error
          }
          if (!retryDecision.retryAllowed) {
            logger.error('Anthropic streaming failed without retry continuation', {
              error,
              attempt,
              maxAttempts: retryDecision.maxAttempts,
              classification: retryDecision.classification,
              nextAction: retryDecision.nextAction,
              manualTakeoverRequired: retryDecision.manualTakeoverRequired
            })
            throw error instanceof Error ? error : new Error(String(error))
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.warn(`Anthropic streaming failed (attempt ${attempt}), reconnecting`, {
            error,
            delayMs: retryDecision.delayMs,
            classification: retryDecision.classification,
            nextAction: retryDecision.nextAction,
            maxAttempts: retryDecision.maxAttempts
          })
          llmRetryNotifier.notify({
            sessionId: config.sessionId,
            provider: 'anthropic',
            attempt,
            delayMs: retryDecision.delayMs,
            error: errorMessage,
            classification: retryDecision.classification,
            nextAction: retryDecision.nextAction,
            manualTakeoverRequired: retryDecision.manualTakeoverRequired,
            occurredAt: new Date()
          })
          await sleep(retryDecision.delayMs)
        }
      }
    }

    // Exceeded max tool iterations
    logger.warn('streamMessage: max tool iterations exceeded', {
      maxIterations: runtime.maxToolIterations
    })
    yield {
      content: '',
      done: true,
      type: 'error',
      error: {
        message: `Max tool iterations exceeded (${runtime.maxToolIterations})`,
        code: 'MAX_ITERATIONS_EXCEEDED'
      }
    }
  }

  /**
   * Process a single stream event and yield appropriate chunks
   */
  private *processStreamEvent(
    event: MessageStreamEvent,
    currentToolUse: { id: string; name: string; input: string } | null,
    setCurrentToolUse: (toolUse: { id: string; name: string; input: string } | null) => void
  ): Generator<LLMChunk> {
    switch (event.type) {
      case 'content_block_start':
        if (event.content_block.type === 'tool_use') {
          const toolBlock = event.content_block
          setCurrentToolUse({
            id: toolBlock.id,
            name: toolBlock.name,
            input: ''
          })
          yield {
            content: '',
            done: false,
            type: 'tool_start',
            toolCall: {
              id: toolBlock.id,
              name: toolBlock.name
            }
          }
        }
        break

      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          yield {
            content: event.delta.text,
            done: false,
            type: 'content'
          }
        } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
          // Accumulate JSON input for tool use
          currentToolUse.input += event.delta.partial_json
        }
        break

      case 'content_block_stop':
        if (currentToolUse) {
          // Tool use block complete - parse arguments
          try {
            if (currentToolUse.input) {
              JSON.parse(currentToolUse.input)
            }
          } catch (error) {
            logger.error('Failed to parse tool call arguments', {
              toolCallId: currentToolUse.id,
              functionName: currentToolUse.name,
              input: currentToolUse.input,
              error
            })
          }

          // We don't emit tool_end here - it's emitted after actual execution
          setCurrentToolUse(null)
        }
        break
    }
  }
}

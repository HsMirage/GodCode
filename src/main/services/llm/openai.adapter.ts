import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall
} from 'openai/resources/chat/completions'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { browserViewManager } from '@/main/services/browser-view.service'
import {
  toolExecutionService,
  type ToolCall,
  type ToolExecutionOutput
} from '@/main/services/tools/tool-execution.service'
import { resolveLLMRuntimeConfig } from './runtime-config'
import { llmRetryNotifier } from './retry-notifier'

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
const MAX_RECONNECT_DELAY_MS = 30_000

const getReconnectDelay = (baseDelayMs: number, attempt: number): number => {
  const safeBaseDelayMs = Math.max(500, baseDelayMs)
  const factor = Math.min(Math.max(attempt - 1, 0), 6)
  return Math.min(safeBaseDelayMs * Math.pow(2, factor), MAX_RECONNECT_DELAY_MS)
}

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

const isRetryableApiError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return true
  const message = error.message.toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econn') ||
    message.includes('socket') ||
    message.includes('connection') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('overloaded') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('abort')
  )
}

const toOpenAIMessages = (messages: Message[]): ChatCompletionMessageParam[] => {
  return messages.map(msg => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content
  }))
}

/**
 * Convert tool definitions to OpenAI function calling format
 */
const getOpenAITools = (
  scopedTools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
): ChatCompletionTool[] => {
  const toolDefs = scopedTools ?? toolExecutionService.getToolDefinitions()
  return toolDefs.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>
    }
  }))
}

const parseToolCalls = (toolCalls: ChatCompletionMessageFunctionToolCall[]): ToolCall[] => {
  return toolCalls.map(tc => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(tc.function.arguments)
    } catch (error) {
      logger.error('Failed to parse tool call arguments', {
        toolCallId: tc.id,
        functionName: tc.function.name,
        arguments: tc.function.arguments,
        error
      })
    }
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: args
    }
  })
}

const isFunctionToolCall = (tc: { type?: string }): tc is ChatCompletionMessageFunctionToolCall =>
  tc.type === 'function'

const extractTextFromUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(item => extractTextFromUnknown(item)).join('')
  }
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const textLikeKeys = [
    'text',
    'content',
    'value',
    'output_text',
    'reasoning_content',
    'reasoning',
    'final_text'
  ] as const

  return textLikeKeys.map(key => extractTextFromUnknown(record[key])).join('')
}

const extractMessageText = (message: unknown): string => {
  if (!message || typeof message !== 'object') return ''

  const record = message as Record<string, unknown>
  const contentText = extractTextFromUnknown(record.content)
  if (contentText.trim()) return contentText

  const fallbackText = [
    record.output_text,
    record.text,
    record.final_text,
    record.reasoning_content,
    record.reasoning
  ]
    .map(item => extractTextFromUnknown(item))
    .map(item => item.trim())
    .filter(Boolean)
    .join('\n')

  return fallbackText
}

const extractDeltaText = (delta: unknown): string => {
  if (!delta || typeof delta !== 'object') return ''
  const record = delta as Record<string, unknown>

  const contentText = extractTextFromUnknown(record.content)
  if (contentText.trim()) return contentText

  return [record.output_text, record.text, record.reasoning_content, record.reasoning]
    .map(item => extractTextFromUnknown(item))
    .join('')
}

const truncateText = (text: string, maxLength = 280): string => {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

const formatToolExecutionFallback = (outputs: ToolExecutionOutput[]): string => {
  if (!outputs.length) return ''

  const lines = outputs.map(output => {
    const rawResult = (output.result ?? {}) as unknown as Record<string, unknown>
    const extracted =
      extractTextFromUnknown(rawResult?.output) ||
      extractTextFromUnknown(rawResult?.error) ||
      extractTextFromUnknown(rawResult)
    const normalized = extracted.replace(/\s+/g, ' ').trim()
    const preview = truncateText(normalized || 'tool result emitted without text payload')
    const status = output.success ? 'ok' : 'error'
    return `- ${output.toolCall.name} [${status}]: ${preview}`
  })

  return ['TOOL_EXECUTION_SUMMARY:', ...lines].join('\n')
}

/**
 * Accumulator for streaming tool call deltas
 */
interface StreamingToolCall {
  id: string
  name: string
  arguments: string
}

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI
  /**
   * No hardcoded default model here.
   * The effective model should be resolved upstream (DB/settings/bindings) and passed via LLMConfig.model.
   */
  private fallbackModel: string

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL })
    this.fallbackModel = ''
  }

  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    let openaiMessages: ChatCompletionMessageParam[] = toOpenAIMessages(messages)
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const tools = getOpenAITools(config.tools)

    let fullContent = ''
    let lastToolExecutionFallback = ''
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

          const response = await this.client.chat.completions.create(
            {
              model,
              messages: openaiMessages,
              temperature: config.temperature,
              max_tokens: config.maxTokens,
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

          const choice = Array.isArray((response as { choices?: unknown }).choices)
            ? response.choices[0]
            : undefined
          if (!choice) {
            logger.warn('OpenAI-compatible response missing choices[0], returning accumulated content', {
              model,
              hasUsage: Boolean(response.usage),
              responseKeys:
                response && typeof response === 'object'
                  ? Object.keys(response as unknown as Record<string, unknown>)
                  : []
            })
            return { content: fullContent, usage: totalUsage }
          }
          const message = choice?.message

          // Accumulate usage
          totalUsage.prompt_tokens += response.usage?.prompt_tokens ?? 0
          totalUsage.completion_tokens += response.usage?.completion_tokens ?? 0

          // Accumulate text content (support OpenAI-compatible non-standard fields)
          const messageText = extractMessageText(message)
          if (messageText) {
            fullContent += messageText
          } else if ((response.usage?.completion_tokens ?? 0) > 0) {
            logger.warn('OpenAI-compatible response contained completion tokens but no extractable text', {
              model,
              finishReason: choice?.finish_reason,
              messageKeys:
                message && typeof message === 'object'
                  ? Object.keys(message as unknown as Record<string, unknown>)
                  : []
            })
          }

          const toolCalls = message?.tool_calls
          if (!toolCalls || toolCalls.length === 0 || choice?.finish_reason !== 'tool_calls') {
            if (!fullContent.trim() && lastToolExecutionFallback.trim()) {
              logger.warn('OpenAI-compatible response returned no extractable text; using tool fallback summary', {
                model,
                finishReason: choice?.finish_reason
              })
              return { content: lastToolExecutionFallback, usage: totalUsage }
            }
            return { content: fullContent, usage: totalUsage }
          }

          const functionToolCalls = toolCalls.filter(isFunctionToolCall)
          if (functionToolCalls.length === 0) {
            return { content: fullContent, usage: totalUsage }
          }

          logger.info('sendMessage: executing tool calls', {
            iteration,
            toolCount: functionToolCalls.length,
            tools: functionToolCalls.map(tc => tc.function.name)
          })

          const parsedToolCalls = parseToolCalls(functionToolCalls)
          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = {
            viewId,
            webContents,
            workspaceDir: config.workspaceDir || process.cwd(),
            sessionId: config.sessionId || ''
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
          lastToolExecutionFallback = formatToolExecutionFallback(executionResult.outputs)

          // Append assistant message with tool_calls
          openaiMessages = [
            ...openaiMessages,
            {
              role: 'assistant',
              content: message.content ?? null,
              tool_calls: toolCalls
            }
          ]

          // Append tool result messages
          for (const output of executionResult.outputs) {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: output.toolCall.id,
              content: JSON.stringify(output.result)
            })
          }

          // Continue to next iteration for follow-up response
          break // Break retry loop, continue tool loop
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
          }

          if (isAbortRequested(error, config.abortSignal)) {
            logger.info('OpenAI request aborted by user')
            throw error instanceof Error ? error : new Error('Request aborted by user')
          }
          if (!isRetryableApiError(error)) {
            throw error
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          const delay = getReconnectDelay(runtime.baseDelayMs, attempt)
          logger.warn(`OpenAI request failed (attempt ${attempt}), reconnecting`, {
            error,
            delayMs: delay
          })
          llmRetryNotifier.notify({
            sessionId: config.sessionId,
            provider: 'openai',
            attempt,
            delayMs: delay,
            error: errorMessage,
            occurredAt: new Date()
          })
          await sleep(delay)
        }
      }
    }

    // Exceeded max tool iterations
    logger.warn('sendMessage: max tool iterations exceeded', {
      maxIterations: runtime.maxToolIterations
    })
    if (!fullContent.trim() && lastToolExecutionFallback.trim()) {
      logger.warn('sendMessage: returning tool fallback summary after max tool iterations', {
        maxIterations: runtime.maxToolIterations
      })
      return { content: lastToolExecutionFallback, usage: totalUsage }
    }
    return { content: fullContent, usage: totalUsage }
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    let openaiMessages: ChatCompletionMessageParam[] = toOpenAIMessages(messages)
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const tools = getOpenAITools(config.tools)

    logger.info('[OpenAIAdapter] streamMessage called', {
      model,
      configModel: config.model,
      baseURL: this.client.baseURL,
      fullEndpoint: `${this.client.baseURL}/chat/completions`,
      messageCount: messages.length
    })

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

          const stream = await this.client.chat.completions.create(
            {
              model,
              messages: openaiMessages,
              temperature: config.temperature,
              max_tokens: config.maxTokens,
              tools: tools.length > 0 ? tools : undefined,
              stream: true
            },
            { signal: controller.signal }
          )

          // Accumulate tool calls from streaming deltas
          const streamingToolCalls: Map<number, StreamingToolCall> = new Map()
          let finishReason: string | null = null
          let assistantContent = ''

          for await (const chunk of stream) {
            const choice = Array.isArray((chunk as { choices?: unknown }).choices)
              ? chunk.choices[0]
              : undefined
            if (!choice) {
              continue
            }
            const delta = choice?.delta

            // Accumulate text content (support OpenAI-compatible non-standard delta fields)
            const deltaText = extractDeltaText(delta)
            if (deltaText) {
              assistantContent += deltaText
              yield { content: deltaText, done: false, type: 'content' }
            }

            // Accumulate tool call deltas by index
            if (delta?.tool_calls) {
              for (const tcDelta of delta.tool_calls) {
                const idx = tcDelta.index
                let existing = streamingToolCalls.get(idx)

                if (!existing) {
                  existing = {
                    id: tcDelta.id ?? '',
                    name: tcDelta.function?.name ?? '',
                    arguments: ''
                  }
                  streamingToolCalls.set(idx, existing)

                  // Emit tool_start event when we first see a tool call
                  if (existing.name) {
                    yield {
                      content: '',
                      done: false,
                      type: 'tool_start',
                      toolCall: {
                        id: existing.id,
                        name: existing.name
                      }
                    }
                  }
                }

                // Update with delta values
                if (tcDelta.id) {
                  existing.id = tcDelta.id
                }
                if (tcDelta.function?.name) {
                  existing.name = tcDelta.function.name
                }
                if (tcDelta.function?.arguments) {
                  existing.arguments += tcDelta.function.arguments
                }
              }
            }

            // Capture finish reason
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason
            }
          }

          clearTimeout(timeoutId)
          timeoutId = null

          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          // Check if we have tool calls to execute
          if (streamingToolCalls.size === 0 || finishReason !== 'tool_calls') {
            // No tool calls or not a tool_calls finish - we're done
            yield { content: '', done: true, type: 'done' }
            return
          }

          // Parse accumulated tool calls
          const toolCalls: ToolCall[] = []
          for (const [_, tc] of streamingToolCalls) {
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(tc.arguments || '{}')
            } catch (error) {
              logger.error('Failed to parse streaming tool call arguments', {
                toolCallId: tc.id,
                functionName: tc.name,
                arguments: tc.arguments,
                error
              })
            }
            toolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: args
            })
          }

          logger.info('streamMessage: executing tool calls', {
            iteration,
            toolCount: toolCalls.length,
            tools: toolCalls.map(tc => tc.name)
          })

          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = {
            viewId,
            webContents,
            workspaceDir: config.workspaceDir || process.cwd(),
            sessionId: config.sessionId || ''
          }

          const executionResult = await toolExecutionService.executeToolCalls(toolCalls, context)

          logger.info('streamMessage: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          // Emit tool_end events for each completed tool call
          for (const output of executionResult.outputs) {
            yield {
              content: '',
              done: false,
              type: 'tool_end',
              toolCall: {
                id: output.toolCall.id,
                name: output.toolCall.name,
                arguments: output.toolCall.arguments,
                result: output.result
              }
            }
          }

          const openaiToolCalls: ChatCompletionMessageFunctionToolCall[] = Array.from(
            streamingToolCalls.values()
          ).map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments
            }
          }))

          // Append assistant message with tool_calls
          openaiMessages = [
            ...openaiMessages,
            {
              role: 'assistant',
              content: assistantContent || null,
              tool_calls: openaiToolCalls
            }
          ]

          // Append tool result messages
          for (const output of executionResult.outputs) {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: output.toolCall.id,
              content: JSON.stringify(output.result)
            })
          }

          // Continue to next iteration for follow-up streaming
          break // Break retry loop, continue tool loop
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
            logger.info('OpenAI streaming aborted by user')
            yield { content: '', done: true, type: 'done' }
            return
          }
          if (!isRetryableApiError(error)) {
            throw error
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          const delay = getReconnectDelay(runtime.baseDelayMs, attempt)
          logger.warn(`OpenAI streaming failed (attempt ${attempt}), reconnecting`, {
            error,
            delayMs: delay
          })
          llmRetryNotifier.notify({
            sessionId: config.sessionId,
            provider: 'openai',
            attempt,
            delayMs: delay,
            error: errorMessage,
            occurredAt: new Date()
          })
          await sleep(delay)
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
}

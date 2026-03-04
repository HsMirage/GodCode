import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall
} from 'openai/resources/chat/completions'
import type {
  EasyInputMessage,
  FunctionTool as ResponsesFunctionTool,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInputItem,
  ResponseStreamEvent
} from 'openai/resources/responses/responses'
import type {
  LLMAdapter,
  LLMChunk,
  LLMConfig,
  LLMConfigApiProtocol,
  LLMResponse
} from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { browserViewManager } from '@/main/services/browser-view.service'
import {
  toolExecutionService,
  type ToolCall,
  type ToolExecutionOutput
} from '@/main/services/tools/tool-execution.service'
import { resolveLLMRuntimeConfig, type ResolvedLLMRuntimeConfig } from './runtime-config'
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

const toStrictResponsesParameters = (
  schema: Record<string, unknown>
): Record<string, unknown> => {
  const normalize = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value
    }

    const cloned: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    const props = cloned.properties

    if (props && typeof props === 'object' && !Array.isArray(props)) {
      const properties = props as Record<string, unknown>

      for (const [key, propValue] of Object.entries(properties)) {
        properties[key] = normalize(propValue)
      }

      cloned.required = Object.keys(properties)
    }

    const items = cloned.items
    if (items !== undefined) {
      if (Array.isArray(items)) {
        cloned.items = items.map(item => normalize(item))
      } else {
        cloned.items = normalize(items)
      }
    }

    return cloned
  }

  return normalize(schema) as Record<string, unknown>
}

const getResponsesTools = (
  scopedTools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
): ResponsesFunctionTool[] => {
  const toolDefs = scopedTools ?? toolExecutionService.getToolDefinitions()
  return toolDefs.map(tool => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: toStrictResponsesParameters(tool.parameters),
    strict: true
  }))
}

const toResponsesInputMessages = (messages: Message[]): EasyInputMessage[] => {
  return messages.map(msg => {
    const role: EasyInputMessage['role'] =
      msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'user'

    return {
      role,
      content: [
        {
          type: 'input_text' as const,
          text: msg.content
        }
      ],
      type: 'message'
    }
  })
}

const parseResponseFunctionCalls = (response: unknown): ToolCall[] => {
  if (!response || typeof response !== 'object') return []
  const outputItems = Array.isArray((response as { output?: unknown }).output)
    ? ((response as { output: unknown[] }).output as unknown[])
    : []

  const toolCalls: ToolCall[] = []

  for (const item of outputItems) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (record.type !== 'function_call') continue

    const callId = typeof record.call_id === 'string' ? record.call_id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const rawArgs = typeof record.arguments === 'string' ? record.arguments : ''

    if (!callId || !name) continue

    let args: Record<string, unknown> = {}
    if (rawArgs.trim()) {
      try {
        const parsed = JSON.parse(rawArgs)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>
        }
      } catch (error) {
        logger.error('Failed to parse responses function call arguments', {
          callId,
          name,
          arguments: rawArgs,
          error
        })
      }
    }

    toolCalls.push({ id: callId, name, arguments: args })
  }

  return toolCalls
}

const toResponseFunctionCallOutputs = (
  outputs: ToolExecutionOutput[]
): Array<{ type: 'function_call_output'; call_id: string; output: string }> => {
  return outputs.map(output => ({
    type: 'function_call_output',
    call_id: output.toolCall.id,
    output: JSON.stringify(output.result)
  }))
}

const extractResponsesUsage = (
  response: unknown
): { prompt_tokens: number; completion_tokens: number } => {
  if (!response || typeof response !== 'object') {
    return { prompt_tokens: 0, completion_tokens: 0 }
  }

  const usage = (response as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: 0, completion_tokens: 0 }
  }

  const usageRecord = usage as Record<string, unknown>
  const prompt = Number(usageRecord.input_tokens ?? 0)
  const completion = Number(usageRecord.output_tokens ?? 0)

  return {
    prompt_tokens: Number.isFinite(prompt) ? prompt : 0,
    completion_tokens: Number.isFinite(completion) ? completion : 0
  }
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

const extractChoiceText = (choice: unknown): string => {
  if (!choice || typeof choice !== 'object') return ''

  const record = choice as Record<string, unknown>

  const directText = [
    record.output_text,
    record.text,
    record.content,
    record.final_text,
    record.reasoning_content,
    record.reasoning
  ]
    .map(item => extractTextFromUnknown(item))
    .map(item => item.trim())
    .filter(Boolean)
    .join('\n')

  if (directText) return directText

  return extractMessageText(record.message) || extractDeltaText(record.delta)
}

const extractResponseText = (response: unknown): string => {
  if (!response || typeof response !== 'object') return ''

  const record = response as Record<string, unknown>

  const topLevelText = [
    record.output_text,
    record.text,
    record.content,
    record.final_text,
    record.reasoning_content,
    record.reasoning
  ]
    .map(item => extractTextFromUnknown(item))
    .map(item => item.trim())
    .filter(Boolean)
    .join('\n')

  if (topLevelText) return topLevelText

  const messageText = extractMessageText(record.message)
  if (messageText.trim()) return messageText

  const choices = Array.isArray(record.choices) ? record.choices : []
  const fromChoices = choices
    .map(choice => extractChoiceText(choice))
    .map(text => text.trim())
    .filter(Boolean)
    .join('\n')

  return fromChoices
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

const resolveApiProtocol = (config: LLMConfig): LLMConfigApiProtocol => {
  const protocol = config.apiProtocol
  if (protocol === 'chat/completions' || protocol === 'responses') {
    return protocol
  }
  throw new Error(
    'MODEL_PROTOCOL_NOT_CONFIGURED: OpenAI-compatible 模型缺少 apiProtocol 配置。' +
      '请在“设置 -> 模型”中将协议设置为 chat/completions 或 responses。'
  )
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
    const protocol = resolveApiProtocol(config)
    if (protocol === 'responses') {
      return this.sendMessageWithResponses(messages, config, model, runtime)
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

          // Accumulate usage
          totalUsage.prompt_tokens += response.usage?.prompt_tokens ?? 0
          totalUsage.completion_tokens += response.usage?.completion_tokens ?? 0

          const choice = Array.isArray((response as { choices?: unknown }).choices)
            ? response.choices[0]
            : undefined
          if (!choice) {
            const recoveredText = extractResponseText(response)
            if (recoveredText.trim()) {
              logger.warn('OpenAI-compatible response missing choices[0], recovered text from fallback fields', {
                model,
                hasUsage: Boolean(response.usage),
                responseKeys:
                  response && typeof response === 'object'
                    ? Object.keys(response as unknown as Record<string, unknown>)
                    : []
              })
              fullContent += recoveredText
              return { content: fullContent, usage: totalUsage }
            }

            logger.error('OpenAI-compatible response missing choices[0] and no recoverable text payload', {
              model,
              hasUsage: Boolean(response.usage),
              responseKeys:
                response && typeof response === 'object'
                  ? Object.keys(response as unknown as Record<string, unknown>)
                  : []
            })
            throw new Error(
              'OpenAI-compatible response missing choices[0] and no extractable text. Please verify provider compatibility.'
            )
          }
          const message = choice?.message

          // Accumulate text content (support OpenAI-compatible non-standard fields)
          const choiceText = extractChoiceText(choice)
          if (choiceText) {
            fullContent += choiceText
          } else if ((response.usage?.completion_tokens ?? 0) > 0) {
            logger.warn('OpenAI-compatible response contained completion tokens but no extractable text', {
              model,
              finishReason: choice?.finish_reason,
              choiceKeys:
                choice && typeof choice === 'object'
                  ? Object.keys(choice as unknown as Record<string, unknown>)
                  : [],
              messageKeys:
                message && typeof message === 'object'
                  ? Object.keys(message as unknown as Record<string, unknown>)
                  : []
            })
          }

          const toolCalls = message?.tool_calls
          if (!toolCalls || toolCalls.length === 0) {
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

  private buildToolExecutionContext(config: LLMConfig): {
    viewId: string
    webContents: ReturnType<typeof browserViewManager.getWebContents>
    workspaceDir: string
    sessionId: string
  } {
    const viewId = 'default'
    const webContents = browserViewManager.getWebContents(viewId)
    return {
      viewId,
      webContents,
      workspaceDir: config.workspaceDir || process.cwd(),
      sessionId: config.sessionId || ''
    }
  }

  private async sendMessageWithResponses(
    messages: Message[],
    config: LLMConfig,
    model: string,
    runtime: ResolvedLLMRuntimeConfig
  ): Promise<LLMResponse> {
    const responseInputMessages = toResponsesInputMessages(messages)
    const tools = getResponsesTools(config.tools)

    let fullContent = ''
    let lastToolExecutionFallback = ''
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0 }
    let previousResponseId: string | undefined
    let pendingInput: ResponseInputItem[] | undefined

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

          const request: ResponseCreateParamsNonStreaming = {
            model,
            temperature: config.temperature,
            max_output_tokens: config.maxTokens,
            input:
              pendingInput && pendingInput.length > 0
                ? pendingInput
                : (responseInputMessages as unknown as ResponseCreateParamsNonStreaming['input']),
            tools: tools.length > 0 ? tools : undefined,
            previous_response_id: previousResponseId
          }

          const response = await this.client.responses.create(request, { signal: controller.signal })

          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          const usage = extractResponsesUsage(response)
          totalUsage.prompt_tokens += usage.prompt_tokens
          totalUsage.completion_tokens += usage.completion_tokens

          const responseText = extractResponseText(response)
          if (responseText) {
            fullContent += responseText
          }

          const toolCalls = parseResponseFunctionCalls(response)
          if (toolCalls.length === 0) {
            if (!fullContent.trim() && lastToolExecutionFallback.trim()) {
              logger.warn('Responses API returned no extractable text; using tool fallback summary', {
                model
              })
              return { content: lastToolExecutionFallback, usage: totalUsage }
            }
            return { content: fullContent, usage: totalUsage }
          }

          logger.info('sendMessageWithResponses: executing tool calls', {
            iteration,
            toolCount: toolCalls.length,
            tools: toolCalls.map(tc => tc.name)
          })

          const executionResult = await toolExecutionService.executeToolCalls(
            toolCalls,
            this.buildToolExecutionContext(config)
          )

          logger.info('sendMessageWithResponses: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          lastToolExecutionFallback = formatToolExecutionFallback(executionResult.outputs)
          pendingInput = toResponseFunctionCallOutputs(executionResult.outputs) as unknown as ResponseInputItem[]
          previousResponseId = response.id

          break
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
          }

          if (isAbortRequested(error, config.abortSignal)) {
            logger.info('Responses request aborted by user')
            throw error instanceof Error ? error : new Error('Request aborted by user')
          }
          if (!isRetryableApiError(error)) {
            throw error
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          const delay = getReconnectDelay(runtime.baseDelayMs, attempt)
          logger.warn(`Responses request failed (attempt ${attempt}), reconnecting`, {
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

    logger.warn('sendMessageWithResponses: max tool iterations exceeded', {
      maxIterations: runtime.maxToolIterations
    })
    if (!fullContent.trim() && lastToolExecutionFallback.trim()) {
      return { content: lastToolExecutionFallback, usage: totalUsage }
    }
    return { content: fullContent, usage: totalUsage }
  }

  private async *streamMessageWithResponses(
    messages: Message[],
    config: LLMConfig,
    model: string,
    runtime: ResolvedLLMRuntimeConfig
  ): AsyncGenerator<LLMChunk> {
    const responseInputMessages = toResponsesInputMessages(messages)
    const tools = getResponsesTools(config.tools)
    let previousResponseId: string | undefined
    let pendingInput: ResponseInputItem[] | undefined

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

          const request: ResponseCreateParamsStreaming = {
            model,
            temperature: config.temperature,
            max_output_tokens: config.maxTokens,
            stream: true,
            input:
              pendingInput && pendingInput.length > 0
                ? pendingInput
                : (responseInputMessages as unknown as ResponseCreateParamsStreaming['input']),
            tools: tools.length > 0 ? tools : undefined,
            previous_response_id: previousResponseId
          }

          const stream = await this.client.responses.create(request, { signal: controller.signal })

          const functionArgChunks = new Map<string, { name: string; arguments: string }>()
          const functionCallIdByItemId = new Map<string, string>()
          let latestResponseId = previousResponseId

          for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
            if (event.type === 'response.output_text.delta') {
              if (event.delta) {
                yield { content: event.delta, done: false, type: 'content' }
              }
              continue
            }

            if (event.type === 'response.function_call_arguments.delta') {
              const existing = functionArgChunks.get(event.item_id) ?? { name: '', arguments: '' }
              existing.arguments += event.delta
              functionArgChunks.set(event.item_id, existing)
              continue
            }

            if (event.type === 'response.function_call_arguments.done') {
              functionArgChunks.set(event.item_id, {
                name: event.name,
                arguments: event.arguments
              })
              continue
            }

            if (event.type === 'response.output_item.done' && event.item.type === 'function_call') {
              const itemId = event.item.id ?? event.item.call_id
              const existing = functionArgChunks.get(itemId) ?? { name: '', arguments: '' }
              if (!existing.name) {
                existing.name = event.item.name
              }
              if (!existing.arguments) {
                existing.arguments = event.item.arguments
              }
              functionArgChunks.set(itemId, existing)
              functionCallIdByItemId.set(itemId, event.item.call_id)
              continue
            }

            if (event.type === 'response.completed') {
              latestResponseId = event.response.id
              continue
            }

            if (event.type === 'response.failed') {
              throw new Error(event.response.error?.message || 'Responses API failed')
            }

            if (event.type === 'error') {
              throw new Error(event.message || 'Responses API stream error')
            }
          }

          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          const parsedToolCalls: ToolCall[] = []
          for (const [itemId, value] of functionArgChunks.entries()) {
            if (!value.name.trim()) continue

            const resolvedToolCallId = functionCallIdByItemId.get(itemId) ?? itemId

            let args: Record<string, unknown> = {}
            if (value.arguments.trim()) {
              try {
                const parsed = JSON.parse(value.arguments)
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  args = parsed as Record<string, unknown>
                }
              } catch (error) {
                logger.error('Failed to parse responses streaming tool call arguments', {
                  itemId,
                  functionName: value.name,
                  arguments: value.arguments,
                  error
                })
              }
            }
            parsedToolCalls.push({ id: resolvedToolCallId, name: value.name, arguments: args })
          }

          if (parsedToolCalls.length === 0) {
            yield { content: '', done: true, type: 'done' }
            return
          }

          for (const toolCall of parsedToolCalls) {
            yield {
              content: '',
              done: false,
              type: 'tool_start',
              toolCall: {
                id: toolCall.id,
                name: toolCall.name
              }
            }
          }

          const executionResult = await toolExecutionService.executeToolCalls(
            parsedToolCalls,
            this.buildToolExecutionContext(config)
          )

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

          pendingInput = toResponseFunctionCallOutputs(executionResult.outputs) as unknown as ResponseInputItem[]
          previousResponseId = latestResponseId

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
            logger.info('Responses streaming aborted by user')
            yield { content: '', done: true, type: 'done' }
            return
          }
          if (!isRetryableApiError(error)) {
            throw error
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          const delay = getReconnectDelay(runtime.baseDelayMs, attempt)
          logger.warn(`Responses streaming failed (attempt ${attempt}), reconnecting`, {
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

    logger.warn('streamMessageWithResponses: max tool iterations exceeded', {
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

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    let openaiMessages: ChatCompletionMessageParam[] = toOpenAIMessages(messages)
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const protocol = resolveApiProtocol(config)
    if (protocol === 'responses') {
      yield* this.streamMessageWithResponses(messages, config, model, runtime)
      return
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
          if (streamingToolCalls.size === 0) {
            // No tool calls - we're done
            yield { content: '', done: true, type: 'done' }
            return
          }

          if (finishReason && finishReason !== 'tool_calls') {
            logger.warn('OpenAI-compatible stream emitted tool_calls but finish_reason is non-standard', {
              model,
              finishReason,
              toolCallCount: streamingToolCalls.size
            })
          }

          // Parse accumulated tool calls
          const toolCalls: ToolCall[] = []
          for (const tc of streamingToolCalls.values()) {
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

          const executionResult = await toolExecutionService.executeToolCalls(
            toolCalls,
            this.buildToolExecutionContext(config)
          )

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

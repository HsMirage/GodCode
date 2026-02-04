import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall
} from 'openai/resources/chat/completions'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { allTools } from '@/main/services/ai-browser'
import { browserViewManager } from '@/main/services/browser-view.service'
import { toolExecutionService, type ToolCall } from '@/main/services/tools/tool-execution.service'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const TIMEOUT_MS = 30000
const DEFAULT_MODEL = 'gpt-4'
const MAX_TOOL_ITERATIONS = 10

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const toOpenAIMessages = (messages: Message[]): ChatCompletionMessageParam[] => {
  return messages.map(msg => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content
  }))
}

/**
 * Convert tool definitions to OpenAI function calling format
 */
const getOpenAITools = (): ChatCompletionTool[] => {
  const toolDefs = toolExecutionService.getToolDefinitions()
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
  private model: string

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL })
    this.model = DEFAULT_MODEL
  }

  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    let openaiMessages: ChatCompletionMessageParam[] = toOpenAIMessages(messages)
    const model = config.model || this.model
    const tools = getOpenAITools()

    // Register browser tools with execution service
    toolExecutionService.registerBrowserTools(allTools)

    let fullContent = ''
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0 }

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

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

          clearTimeout(timeoutId)

          const choice = response.choices[0]
          const message = choice?.message

          // Accumulate usage
          totalUsage.prompt_tokens += response.usage?.prompt_tokens ?? 0
          totalUsage.completion_tokens += response.usage?.completion_tokens ?? 0

          // Accumulate text content
          if (message?.content) {
            fullContent += message.content
          }

          const toolCalls = message?.tool_calls
          if (!toolCalls || toolCalls.length === 0 || choice?.finish_reason !== 'tool_calls') {
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
          const context = { viewId, webContents }

          const executionResult = await toolExecutionService.executeToolCalls(
            parsedToolCalls,
            context
          )

          logger.info('sendMessage: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

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
          logger.warn(`OpenAI request failed (attempt ${attempt}/${MAX_RETRIES})`, { error })

          if (attempt === MAX_RETRIES) {
            logger.error('OpenAI request failed after all retries', { error })
            throw error
          }

          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
          await sleep(delay)
        }
      }
    }

    // Exceeded max tool iterations
    logger.warn('sendMessage: max tool iterations exceeded', { maxIterations: MAX_TOOL_ITERATIONS })
    return { content: fullContent, usage: totalUsage }
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    let openaiMessages: ChatCompletionMessageParam[] = toOpenAIMessages(messages)
    const model = config.model || this.model
    const tools = getOpenAITools()

    // Debug: 打印请求参数
    logger.info('[OpenAIAdapter] streamMessage called', {
      model,
      configModel: config.model,
      defaultModel: this.model,
      baseURL: this.client.baseURL,
      fullEndpoint: `${this.client.baseURL}/chat/completions`,
      messageCount: messages.length
    })

    // Register browser tools with execution service
    toolExecutionService.registerBrowserTools(allTools)

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

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
            const choice = chunk.choices[0]
            const delta = choice?.delta

            // Accumulate text content
            if (delta?.content) {
              assistantContent += delta.content
              yield { content: delta.content, done: false }
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

          // Check if we have tool calls to execute
          if (streamingToolCalls.size === 0 || finishReason !== 'tool_calls') {
            // No tool calls or not a tool_calls finish - we're done
            yield { content: '', done: true }
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
          const context = { viewId, webContents }

          const executionResult = await toolExecutionService.executeToolCalls(toolCalls, context)

          logger.info('streamMessage: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

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
          logger.warn(`OpenAI streaming failed (attempt ${attempt}/${MAX_RETRIES})`, { error })

          if (attempt === MAX_RETRIES) {
            logger.error('OpenAI streaming failed after all retries', { error })
            throw error
          }

          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
          await sleep(delay)
        }
      }
    }

    // Exceeded max tool iterations
    logger.warn('streamMessage: max tool iterations exceeded', {
      maxIterations: MAX_TOOL_ITERATIONS
    })
    yield { content: '', done: true }
  }
}

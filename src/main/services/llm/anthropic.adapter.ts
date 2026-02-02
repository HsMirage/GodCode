import Anthropic from '@anthropic-ai/sdk'
import type {
  Message as AnthropicMessage,
  MessageCreateParams,
  MessageParam,
  TextBlock,
  ToolResultBlockParam,
  ContentBlock
} from '@anthropic-ai/sdk/resources/messages'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { allTools } from '@/main/services/ai-browser'
import { browserViewManager } from '@/main/services/browser-view.service'
import { toolExecutionService, type ToolCall } from '@/main/services/tools/tool-execution.service'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const TIMEOUT_MS = 30000
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20240620'

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const getSystemPrompt = (messages: Message[]): string | undefined => {
  const systemText = messages
    .filter(message => message.role === 'system')
    .map(message => message.content.trim())
    .filter(content => content.length > 0)
    .join('\n')

  return systemText.length > 0 ? systemText : undefined
}

const toAnthropicMessages = (messages: Message[]): MessageParam[] => {
  const result: MessageParam[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      continue
    }

    const role = message.role === 'assistant' ? 'assistant' : 'user'
    result.push({ role, content: message.content })
  }

  return result
}

const extractContent = (response: AnthropicMessage): string => {
  const textBlocks = response.content.filter((block): block is TextBlock => block.type === 'text')

  return textBlocks.map(block => block.text).join('')
}

const createTimeoutController = () => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { controller, timeoutId }
}

export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic
  private model: string

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
    this.model = DEFAULT_MODEL
  }

  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    const system = getSystemPrompt(messages)
    let anthropicMessages = toAnthropicMessages(messages)
    const maxTokens = config.maxTokens ?? 1024
    const maxToolIterations = 10

    let fullContent = ''
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0 }

    for (let iteration = 0; iteration < maxToolIterations; iteration++) {
      const params: MessageCreateParams = {
        model: this.model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        tools: allTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters
        }))
      }

      if (system) {
        params.system = system
      }

      if (config.temperature !== undefined) {
        params.temperature = config.temperature
      }

      if (config.topP !== undefined) {
        params.top_p = config.topP
      }

      if (config.stopSequences?.length) {
        params.stop_sequences = config.stopSequences
      }

      let response: AnthropicMessage | undefined

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        const { controller, timeoutId } = createTimeoutController()

        try {
          response = await this.client.messages.create(params, {
            signal: controller.signal
          })
          break
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error('Anthropic sendMessage failed', { attempt, error: message })

          if (attempt === MAX_RETRIES) {
            throw error
          }

          await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1))
        } finally {
          clearTimeout(timeoutId)
        }
      }

      if (!response) {
        throw new Error('Anthropic sendMessage failed after retries')
      }

      totalUsage.prompt_tokens += response.usage?.input_tokens ?? 0
      totalUsage.completion_tokens += response.usage?.output_tokens ?? 0

      const textContent = extractContent(response)
      fullContent += textContent

      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use')

      if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
        break
      }

      const toolResults: ToolResultBlockParam[] = []
      for (const toolBlock of toolUseBlocks) {
        const tool = allTools.find(t => t.name === toolBlock.name)
        let result: string

        if (tool) {
          try {
            const viewId = 'default'
            const webContents = browserViewManager.getWebContents(viewId)
            const context = { viewId, webContents }
            const toolInput = toolBlock.input as Record<string, unknown>
            const execResult = await tool.execute(toolInput, context)
            result = JSON.stringify(execResult)
            logger.info('Tool executed', { tool: toolBlock.name, result })
          } catch (error) {
            result = JSON.stringify({ error: (error as Error).message })
            logger.error('Tool execution failed', { tool: toolBlock.name, error })
          }
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${toolBlock.name}` })
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result
        })
      }

      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]
    }

    return {
      content: fullContent,
      usage: totalUsage
    }
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const system = getSystemPrompt(messages)
    let anthropicMessages = toAnthropicMessages(messages)
    const maxTokens = config.maxTokens ?? 1024
    const maxToolIterations = 10

    // Register browser tools with the execution service
    toolExecutionService.registerBrowserTools(allTools)

    const tools = allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }))

    // Tool use loop - continues streaming until stop_reason != tool_use
    for (let iteration = 0; iteration < maxToolIterations; iteration++) {
      const params: MessageCreateParams = {
        model: this.model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        stream: true,
        tools
      }

      if (system) {
        params.system = system
      }

      if (config.temperature !== undefined) {
        params.temperature = config.temperature
      }

      if (config.topP !== undefined) {
        params.top_p = config.topP
      }

      if (config.stopSequences?.length) {
        params.stop_sequences = config.stopSequences
      }

      // State for accumulating tool_use blocks during streaming
      const toolUseBlocks: Array<{ id: string; name: string; inputJson: string }> = []
      let currentBlockIndex = -1
      let currentBlockType: string | null = null
      let stopReason: string | null = null
      const contentBlocks: ContentBlock[] = []

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        const { controller, timeoutId } = createTimeoutController()

        try {
          const stream = this.client.messages.stream(params, {
            signal: controller.signal
          })

          for await (const event of stream) {
            // Handle content_block_start - start of a new content block
            if (event.type === 'content_block_start') {
              currentBlockIndex = event.index
              const block = event.content_block

              if (block.type === 'tool_use') {
                currentBlockType = 'tool_use'
                toolUseBlocks[currentBlockIndex] = {
                  id: block.id,
                  name: block.name,
                  inputJson: ''
                }
              } else if (block.type === 'text') {
                currentBlockType = 'text'
              }
            }

            // Handle content_block_delta - incremental content
            if (event.type === 'content_block_delta') {
              const delta = event.delta

              if (delta.type === 'text_delta') {
                const text = delta.text
                if (text.length > 0) {
                  yield { content: text, done: false }
                }
              } else if (delta.type === 'input_json_delta') {
                // Accumulate partial JSON for tool_use
                const blockData = toolUseBlocks[event.index]
                if (blockData) {
                  blockData.inputJson += delta.partial_json
                }
              }
            }

            // Handle content_block_stop - end of a content block
            if (event.type === 'content_block_stop') {
              const blockData = toolUseBlocks[event.index]
              if (blockData) {
                // Parse the accumulated JSON
                try {
                  const parsedInput = JSON.parse(blockData.inputJson || '{}')
                  contentBlocks[event.index] = {
                    type: 'tool_use',
                    id: blockData.id,
                    name: blockData.name,
                    input: parsedInput
                  }
                } catch (parseError) {
                  logger.error('Failed to parse tool input JSON', {
                    blockId: blockData.id,
                    inputJson: blockData.inputJson,
                    error: parseError
                  })
                  contentBlocks[event.index] = {
                    type: 'tool_use',
                    id: blockData.id,
                    name: blockData.name,
                    input: {}
                  }
                }
              }
              currentBlockType = null
            }

            // Handle message_delta - contains stop_reason
            if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason ?? null
            }

            // Handle message_stop - end of message
            if (event.type === 'message_stop') {
              // Don't emit done:true here if we have tool_use to process
              if (stopReason !== 'tool_use') {
                yield { content: '', done: true }
              }
            }
          }

          break // Success, exit retry loop
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error('Anthropic streamMessage failed', { attempt, error: message })

          if (attempt === MAX_RETRIES) {
            throw error
          }

          await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1))
        } finally {
          clearTimeout(timeoutId)
        }
      }

      // Check if we need to execute tools
      const validToolBlocks = contentBlocks.filter(
        (block): block is ContentBlock & { type: 'tool_use' } => block?.type === 'tool_use'
      )

      if (validToolBlocks.length === 0 || stopReason !== 'tool_use') {
        // No tool calls or not a tool_use stop reason - we're done
        return
      }

      // Execute tools via ToolExecutionService
      logger.info('Streaming: executing tool calls', {
        iteration,
        toolCount: validToolBlocks.length,
        tools: validToolBlocks.map(b => b.name)
      })

      const toolCalls: ToolCall[] = validToolBlocks.map(block => ({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>
      }))

      const viewId = 'default'
      const webContents = browserViewManager.getWebContents(viewId)
      const context = { viewId, webContents }

      const executionResult = await toolExecutionService.executeToolCalls(toolCalls, context)

      // Format tool results for LLM
      const toolResults: ToolResultBlockParam[] = executionResult.outputs.map(output => ({
        type: 'tool_result',
        tool_use_id: output.toolCall.id,
        content: JSON.stringify(output.result)
      }))

      logger.info('Streaming: tool execution complete', {
        iteration,
        allSucceeded: executionResult.allSucceeded,
        durationMs: executionResult.totalDurationMs
      })

      // Append assistant response (with tool_use blocks) and tool results for next iteration
      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: contentBlocks.filter(Boolean) },
        { role: 'user', content: toolResults }
      ]
    }

    // Exceeded max tool iterations
    logger.warn('Streaming: max tool iterations exceeded', { maxToolIterations })
    yield { content: '', done: true }
  }
}

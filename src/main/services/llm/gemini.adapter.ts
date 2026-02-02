import {
  GoogleGenerativeAI,
  type GenerateContentResult,
  type GenerateContentStreamResult,
  type FunctionDeclarationsTool,
  type Part,
  type Content
} from '@google/generative-ai'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { allTools } from '@/main/services/ai-browser'
import { browserViewManager } from '@/main/services/browser-view.service'
import { toolExecutionService, type ToolCall } from '@/main/services/tools/tool-execution.service'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const TIMEOUT_MS = 30000
const DEFAULT_MODEL = 'gemini-pro'
const MAX_TOOL_ITERATIONS = 10

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const getGeminiTools = (): FunctionDeclarationsTool[] => {
  if (allTools.length === 0) return []

  return [
    {
      functionDeclarations: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }
  ] as FunctionDeclarationsTool[]
}

const extractFunctionCalls = (parts: Part[]): ToolCall[] => {
  const toolCalls: ToolCall[] = []

  for (const part of parts) {
    if ('functionCall' in part && part.functionCall) {
      const { name, args } = part.functionCall
      toolCalls.push({
        id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        arguments: (args as Record<string, unknown>) ?? {}
      })
    }
  }

  return toolCalls
}

const hasFunctionCalls = (parts: Part[]): boolean => {
  return parts.some(part => 'functionCall' in part && part.functionCall)
}

const buildFunctionResponseParts = (
  outputs: Array<{ toolCall: ToolCall; result: unknown }>
): Part[] => {
  return outputs.map(output => ({
    functionResponse: {
      name: output.toolCall.name,
      response: output.result as object
    }
  }))
}

const toGeminiMessages = (messages: Message[]) => {
  const systemMessages = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n')
  const conversationMessages = messages.filter(m => m.role !== 'system')

  const history = conversationMessages.slice(0, -1).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }))

  const lastMessage = conversationMessages[conversationMessages.length - 1]
  let userPrompt = lastMessage?.content || ''

  if (systemMessages) {
    userPrompt = `${systemMessages}\n\n${userPrompt}`
  }

  return { history, userPrompt }
}

export class GeminiAdapter implements LLMAdapter {
  private client: GoogleGenerativeAI
  private model: string

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey)
    this.model = DEFAULT_MODEL
  }

  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    const { history, userPrompt } = toGeminiMessages(messages)
    const modelName = config.model || this.model
    const tools = getGeminiTools()

    toolExecutionService.registerBrowserTools(allTools)

    let fullContent = ''
    const totalUsage = { prompt_tokens: 0, completion_tokens: 0 }
    let conversationHistory: Content[] = history as Content[]
    let currentPrompt: string | Part[] = userPrompt

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const model = this.client.getGenerativeModel({
            model: modelName,
            tools: tools.length > 0 ? tools : undefined
          })
          const chat = model.startChat({ history: conversationHistory })

          const result = (await Promise.race([
            chat.sendMessage(currentPrompt),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
            )
          ])) as GenerateContentResult

          totalUsage.prompt_tokens += result.response.usageMetadata?.promptTokenCount ?? 0
          totalUsage.completion_tokens += result.response.usageMetadata?.candidatesTokenCount ?? 0

          const candidate = result.response.candidates?.[0]
          const parts = candidate?.content?.parts ?? []

          const textContent = parts
            .filter((p): p is Part & { text: string } => 'text' in p)
            .map(p => p.text)
            .join('')
          fullContent += textContent

          if (!hasFunctionCalls(parts)) {
            return { content: fullContent, usage: totalUsage }
          }

          const toolCalls = extractFunctionCalls(parts)

          logger.info('sendMessage: executing tool calls', {
            iteration,
            toolCount: toolCalls.length,
            tools: toolCalls.map(tc => tc.name)
          })

          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = { viewId, webContents }

          const executionResult = await toolExecutionService.executeToolCalls(toolCalls, context)

          logger.info('sendMessage: tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          const functionResponseParts = buildFunctionResponseParts(executionResult.outputs)

          conversationHistory = [
            ...conversationHistory,
            {
              role: 'user',
              parts: typeof currentPrompt === 'string' ? [{ text: currentPrompt }] : currentPrompt
            },
            { role: 'model', parts },
            { role: 'user', parts: functionResponseParts }
          ]
          currentPrompt = functionResponseParts

          break
        } catch (error) {
          logger.warn(`Gemini request failed (attempt ${attempt}/${MAX_RETRIES})`, { error })

          if (attempt === MAX_RETRIES) {
            logger.error('Gemini request failed after all retries', { error })
            throw error
          }

          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
          await sleep(delay)
        }
      }
    }

    logger.warn('sendMessage: max tool iterations exceeded', { maxIterations: MAX_TOOL_ITERATIONS })
    return { content: fullContent, usage: totalUsage }
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const { history, userPrompt } = toGeminiMessages(messages)
    const modelName = config.model || this.model
    const tools = getGeminiTools()

    toolExecutionService.registerBrowserTools(allTools)

    let conversationHistory: Content[] = history as Content[]
    let currentPrompt: string | Part[] = userPrompt

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const model = this.client.getGenerativeModel({
            model: modelName,
            tools: tools.length > 0 ? tools : undefined
          })
          const chat = model.startChat({ history: conversationHistory })

          const result = (await Promise.race([
            chat.sendMessageStream(currentPrompt),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
            )
          ])) as GenerateContentStreamResult

          const accumulatedParts: Part[] = []

          for await (const chunk of result.stream) {
            const chunkParts = chunk.candidates?.[0]?.content?.parts ?? []

            for (const part of chunkParts) {
              if ('text' in part && part.text) {
                yield { content: part.text, done: false }
              }
              if ('functionCall' in part) {
                accumulatedParts.push(part)
              }
            }
          }

          if (!hasFunctionCalls(accumulatedParts)) {
            yield { content: '', done: true }
            return
          }

          const toolCalls = extractFunctionCalls(accumulatedParts)

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

          const functionResponseParts = buildFunctionResponseParts(executionResult.outputs)

          conversationHistory = [
            ...conversationHistory,
            {
              role: 'user',
              parts: typeof currentPrompt === 'string' ? [{ text: currentPrompt }] : currentPrompt
            },
            { role: 'model', parts: accumulatedParts },
            { role: 'user', parts: functionResponseParts }
          ]
          currentPrompt = functionResponseParts

          break
        } catch (error) {
          logger.warn(`Gemini streaming failed (attempt ${attempt}/${MAX_RETRIES})`, { error })

          if (attempt === MAX_RETRIES) {
            logger.error('Gemini streaming failed after all retries', { error })
            throw error
          }

          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
          await sleep(delay)
        }
      }
    }

    logger.warn('streamMessage: max tool iterations exceeded', {
      maxIterations: MAX_TOOL_ITERATIONS
    })
    yield { content: '', done: true }
  }
}

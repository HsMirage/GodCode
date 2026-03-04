/**
 * Google Gemini API 原生适配器
 *
 * 支持 Gemini 1.5 Pro、Gemini 1.5 Flash 等模型
 * 实现流式和非流式消息传递，以及工具调用（function calling）
 */

import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'
import { browserViewManager } from '@/main/services/browser-view.service'
import { toolExecutionService, type ToolCall } from '@/main/services/tools/tool-execution.service'
import { resolveLLMRuntimeConfig } from './runtime-config'
import { llmRetryNotifier } from './retry-notifier'

// ============= 常量配置 =============

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// ============= Gemini API 类型定义 =============

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiPart {
  text?: string
  functionCall?: {
    name: string
    args: Record<string, unknown>
  }
  functionResponse?: {
    name: string
    response: Record<string, unknown>
  }
}

interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[]
}

interface GeminiGenerateContentRequest {
  contents: GeminiContent[]
  tools?: GeminiTool[]
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
    topP?: number
    topK?: number
    stopSequences?: string[]
  }
  safetySettings?: Array<{
    category: string
    threshold: string
  }>
}

interface GeminiCandidate {
  content: GeminiContent
  finishReason?: string
  safetyRatings?: Array<{
    category: string
    probability: string
  }>
}

interface GeminiUsageMetadata {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
}

// ============= 辅助函数 =============

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
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

/**
 * 将内部消息格式转换为 Gemini API 格式
 */
function toGeminiContents(messages: Message[]): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (const msg of messages) {
    // 跳过空消息
    if (!msg.content?.trim()) continue

    // Gemini 只支持 user 和 model 两种角色
    // system 消息需要作为第一个 user 消息的一部分
    if (msg.role === 'system') {
      // 系统消息作为第一条 user 消息的前缀
      if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: `[System Instructions]\n${msg.content}` }]
        })
      } else {
        // 追加到现有的 user 消息
        contents[contents.length - 1].parts.push({
          text: `\n\n[System Instructions]\n${msg.content}`
        })
      }
    } else if (msg.role === 'user') {
      // 如果前一条也是 user，合并它们
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push({ text: msg.content })
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        })
      }
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }]
      })
    }
  }

  // Gemini 要求第一条消息必须是 user
  if (contents.length > 0 && contents[0].role !== 'user') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'Hello' }]
    })
  }

  return contents
}

/**
 * 将工具定义转换为 Gemini 函数声明格式
 */
function getGeminiTools(
  scopedTools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
): GeminiTool | undefined {
  const toolDefs = scopedTools ?? toolExecutionService.getToolDefinitions()

  if (toolDefs.length === 0) {
    return undefined
  }

  const functionDeclarations: GeminiFunctionDeclaration[] = toolDefs.map((tool) => {
    const params = tool.parameters as {
      properties?: Record<string, unknown>
      required?: string[]
    }

    const required = Array.isArray(params?.required) ? params.required : undefined

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: params?.properties ?? {},
        required: required && required.length > 0 ? required : undefined
      }
    }
  })

  return { functionDeclarations }
}

/**
 * 从 Gemini 响应中提取函数调用
 */
function extractFunctionCalls(candidate: GeminiCandidate): ToolCall[] {
  const calls: ToolCall[] = []

  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      calls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args
      })
    }
  }

  return calls
}

/**
 * 从 Gemini 响应中提取文本内容
 */
function extractTextContent(candidate: GeminiCandidate): string {
  return candidate.content.parts
    .filter((part) => part.text)
    .map((part) => part.text)
    .join('')
}

/**
 * 创建函数响应内容
 */
function createFunctionResponseContent(
  toolCalls: ToolCall[],
  results: Array<{ toolCall: ToolCall; result: unknown }>
): GeminiContent {
  const parts: GeminiPart[] = results.map((r) => ({
    functionResponse: {
      name: r.toolCall.name,
      response: { result: r.result }
    }
  }))

  return {
    role: 'user',
    parts
  }
}

// ============= Gemini 适配器实现 =============

export class GeminiAdapter implements LLMAdapter {
  private apiKey: string
  private fallbackModel: string
  private baseURL: string

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey
    this.fallbackModel = ''
    this.baseURL = baseURL || GEMINI_API_BASE
  }

  /**
   * 构建 API 端点 URL
   */
  private getEndpoint(model: string, stream = false): string {
    const action = stream ? 'streamGenerateContent' : 'generateContent'
    return `${this.baseURL}/models/${model}:${action}?key=${this.apiKey}`
  }

  /**
   * 非流式消息发送
   */
  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const contents = toGeminiContents(messages)
    const tools = getGeminiTools(config.tools)

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

          const requestBody: GeminiGenerateContentRequest = {
            contents,
            generationConfig: {
              temperature: config.temperature,
              maxOutputTokens: config.maxOutputTokens ?? config.maxTokens,
              topP: config.topP,
              stopSequences: config.stopSequences
            }
          }

          if (tools) {
            requestBody.tools = [tools]
          }

          const response = await fetch(this.getEndpoint(model), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          })

          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
          }

          const data = (await response.json()) as GeminiGenerateContentResponse

          // 提取使用量
          if (data.usageMetadata) {
            totalUsage.prompt_tokens += data.usageMetadata.promptTokenCount
            totalUsage.completion_tokens += data.usageMetadata.candidatesTokenCount
          }

          const candidate = data.candidates?.[0]
          if (!candidate) {
            throw new Error('No candidates in Gemini response')
          }

          // 提取文本内容
          const textContent = extractTextContent(candidate)
          fullContent += textContent

          // 检查是否有函数调用
          const functionCalls = extractFunctionCalls(candidate)

          if (functionCalls.length === 0) {
            return { content: fullContent, usage: totalUsage }
          }

          logger.info('sendMessage: executing Gemini function calls', {
            iteration,
            toolCount: functionCalls.length,
            tools: functionCalls.map((tc) => tc.name)
          })

          // 执行工具调用
          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = {
            viewId,
            webContents,
            workspaceDir: config.workspaceDir || process.cwd(),
            sessionId: config.sessionId || ''
          }

          const executionResult = await toolExecutionService.executeToolCalls(functionCalls, context)

          logger.info('sendMessage: Gemini tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          // 添加模型的函数调用响应
          contents.push({
            role: 'model',
            parts: functionCalls.map((call) => ({
              functionCall: {
                name: call.name,
                args: call.arguments
              }
            }))
          })

          // 添加函数执行结果
          contents.push(createFunctionResponseContent(functionCalls, executionResult.outputs))

          // 继续下一轮迭代
          break
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
          }

          if (isAbortRequested(error, config.abortSignal)) {
            logger.info('Gemini request aborted by user')
            throw error instanceof Error ? error : new Error('Request aborted by user')
          }
          if (!isRetryableApiError(error)) {
            throw error
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          const delay = getReconnectDelay(runtime.baseDelayMs, attempt)
          logger.warn(`Gemini request failed (attempt ${attempt}), reconnecting`, {
            error,
            delayMs: delay
          })
          llmRetryNotifier.notify({
            sessionId: config.sessionId,
            provider: 'gemini',
            attempt,
            delayMs: delay,
            error: errorMessage,
            occurredAt: new Date()
          })
          await sleep(delay)
        }
      }
    }

    logger.warn('sendMessage: max tool iterations exceeded', {
      maxIterations: runtime.maxToolIterations
    })
    return { content: fullContent, usage: totalUsage }
  }

  /**
   * 流式消息发送
   */
  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const runtime = resolveLLMRuntimeConfig(config)
    const model = (config.model || this.fallbackModel || '').trim()
    if (!model) {
      throw new Error('No model configured. Please set a default model in Settings.')
    }
    const contents = toGeminiContents(messages)
    const tools = getGeminiTools(config.tools)

    logger.info('[GeminiAdapter] streamMessage called', {
      model,
      configModel: config.model,
      baseURL: this.baseURL,
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

          const requestBody: GeminiGenerateContentRequest = {
            contents,
            generationConfig: {
              temperature: config.temperature,
              maxOutputTokens: config.maxOutputTokens ?? config.maxTokens,
              topP: config.topP,
              stopSequences: config.stopSequences
            }
          }

          if (tools) {
            requestBody.tools = [tools]
          }

          const response = await fetch(this.getEndpoint(model, true) + '&alt=sse', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          })

          clearTimeout(timeoutId)
          timeoutId = null

          if (config.abortSignal && externalAbortHandler) {
            config.abortSignal.removeEventListener('abort', externalAbortHandler)
            externalAbortHandler = null
          }

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
          }

          if (!response.body) {
            throw new Error('No response body for streaming')
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let accumulatedFunctionCalls: ToolCall[] = []

          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // 解析 SSE 事件
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue

              const data = line.slice(6).trim()
              if (!data || data === '[DONE]') continue

              try {
                const chunk = JSON.parse(data) as GeminiStreamChunk

                const candidate = chunk.candidates?.[0]
                if (!candidate) continue

                // 提取文本内容
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    yield { content: part.text, done: false, type: 'content' }
                  }

                  // 收集函数调用
                  if (part.functionCall) {
                    const toolCall: ToolCall = {
                      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      name: part.functionCall.name,
                      arguments: part.functionCall.args
                    }
                    accumulatedFunctionCalls.push(toolCall)

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
                }
              } catch {
                // 忽略解析错误，继续处理下一行
              }
            }
          }

          // 检查是否有函数调用需要执行
          if (accumulatedFunctionCalls.length === 0) {
            yield { content: '', done: true, type: 'done' }
            return
          }

          logger.info('streamMessage: executing Gemini function calls', {
            iteration,
            toolCount: accumulatedFunctionCalls.length,
            tools: accumulatedFunctionCalls.map((tc) => tc.name)
          })

          // 执行工具调用
          const viewId = 'default'
          const webContents = browserViewManager.getWebContents(viewId)
          const context = {
            viewId,
            webContents,
            workspaceDir: config.workspaceDir || process.cwd(),
            sessionId: config.sessionId || ''
          }

          const executionResult = await toolExecutionService.executeToolCalls(
            accumulatedFunctionCalls,
            context
          )

          logger.info('streamMessage: Gemini tool execution complete', {
            iteration,
            allSucceeded: executionResult.allSucceeded,
            durationMs: executionResult.totalDurationMs
          })

          // 发送 tool_end 事件
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

          // 更新对话历史
          contents.push({
            role: 'model',
            parts: accumulatedFunctionCalls.map((call) => ({
              functionCall: {
                name: call.name,
                args: call.arguments
              }
            }))
          })

          contents.push(createFunctionResponseContent(accumulatedFunctionCalls, executionResult.outputs))

          // 重置累积的函数调用，继续下一轮
          accumulatedFunctionCalls = []
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
            logger.info('Gemini streaming aborted by user')
            yield { content: '', done: true, type: 'done' }
            return
          }
          if (!isRetryableApiError(error)) {
            throw error
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          const delay = getReconnectDelay(runtime.baseDelayMs, attempt)
          logger.warn(`Gemini streaming failed (attempt ${attempt}), reconnecting`, {
            error,
            delayMs: delay
          })
          llmRetryNotifier.notify({
            sessionId: config.sessionId,
            provider: 'gemini',
            attempt,
            delayMs: delay,
            error: errorMessage,
            occurredAt: new Date()
          })
          await sleep(delay)
        }
      }
    }

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

// 模型能力由数据库元数据驱动，不在运行时代码内硬编码 Gemini 模型目录。
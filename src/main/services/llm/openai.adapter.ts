import OpenAI from 'openai'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const TIMEOUT_MS = 30000
const DEFAULT_MODEL = 'gpt-4'

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const toOpenAIMessages = (messages: Message[]): OpenAI.ChatCompletionMessageParam[] => {
  return messages.map(msg => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content
  }))
}

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL })
    this.model = DEFAULT_MODEL
  }

  async sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse> {
    const openaiMessages = toOpenAIMessages(messages)
    const model = config.model || this.model

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

        const response = await this.client.chat.completions.create(
          {
            model,
            messages: openaiMessages,
            temperature: config.temperature,
            max_tokens: config.maxTokens
          },
          { signal: controller.signal }
        )

        clearTimeout(timeoutId)

        const content = response.choices[0]?.message?.content || ''
        const usage = {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0
        }

        return { content, usage }
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

    throw new Error('OpenAI request failed')
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const openaiMessages = toOpenAIMessages(messages)
    const model = config.model || this.model

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
            stream: true
          },
          { signal: controller.signal }
        )

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            yield { content, done: false }
          }
        }

        yield { content: '', done: true }
        clearTimeout(timeoutId)
        return
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
}

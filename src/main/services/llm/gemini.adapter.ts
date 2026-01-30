import {
  GoogleGenerativeAI,
  type GenerateContentResult,
  type GenerateContentStreamResult
} from '@google/generative-ai'
import type { LLMAdapter, LLMChunk, LLMConfig, LLMResponse } from './adapter.interface'
import type { Message } from '@/types/domain'
import { logger } from '@/shared/logger'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const TIMEOUT_MS = 30000
const DEFAULT_MODEL = 'gemini-pro'

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

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

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const model = this.client.getGenerativeModel({ model: modelName })
        const chat = model.startChat({ history })

        const result = (await Promise.race([
          chat.sendMessage(userPrompt),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
          )
        ])) as GenerateContentResult

        const content = result.response.text()
        const usage = {
          prompt_tokens: result.response.usageMetadata?.promptTokenCount ?? 0,
          completion_tokens: result.response.usageMetadata?.candidatesTokenCount ?? 0
        }

        return { content, usage }
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

    throw new Error('Gemini request failed')
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const { history, userPrompt } = toGeminiMessages(messages)
    const modelName = config.model || this.model

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const model = this.client.getGenerativeModel({ model: modelName })
        const chat = model.startChat({ history })

        const result = (await Promise.race([
          chat.sendMessageStream(userPrompt),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
          )
        ])) as GenerateContentStreamResult

        for await (const chunk of result.stream) {
          const content = chunk.text()
          if (content) {
            yield { content, done: false }
          }
        }

        yield { content: '', done: true }
        return
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
}

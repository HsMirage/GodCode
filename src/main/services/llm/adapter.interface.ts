import type { Message } from '@/types/domain'

export interface LLMConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  maxOutputTokens?: number
  topP?: number
  stopSequences?: string[]
}

export interface LLMResponse {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
  }
}

export interface LLMChunk {
  content: string
  done: boolean
}

export interface LLMAdapter {
  sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse>
  streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk>
}

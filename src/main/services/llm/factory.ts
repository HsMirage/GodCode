import type { LLMAdapter } from './adapter.interface'
import { AnthropicAdapter } from './anthropic.adapter'
import { OpenAIAdapter } from './openai.adapter'
import { GeminiAdapter } from './gemini.adapter'
import { OpenAICompatAdapter } from './openai-compat.adapter'
import { mockLLMAdapter } from './mock.adapter'

export const createLLMAdapter = (
  provider: string,
  config: { apiKey: string; baseURL?: string }
): LLMAdapter => {
  if (process.env.CODEALL_E2E_TEST === '1') {
    return mockLLMAdapter
  }
  switch (provider.toLowerCase()) {
    case 'anthropic':
      return new AnthropicAdapter(config.apiKey)
    case 'openai':
      return new OpenAIAdapter(config.apiKey)
    case 'google':
    case 'gemini':
      return new GeminiAdapter(config.apiKey)
    case 'openai-compat':
      if (!config.baseURL) {
        throw new Error('baseURL required for openai-compat provider')
      }
      return new OpenAICompatAdapter(config.apiKey, config.baseURL)
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`)
  }
}

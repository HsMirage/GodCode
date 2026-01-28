import type { LLMAdapter } from './adapter.interface'
import { AnthropicAdapter } from './anthropic.adapter'

export const createLLMAdapter = (
  provider: 'anthropic',
  config: { apiKey: string }
): LLMAdapter => {
  if (provider === 'anthropic') {
    return new AnthropicAdapter(config.apiKey)
  }

  throw new Error(`Unsupported LLM provider: ${provider}`)
}

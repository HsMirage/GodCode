import type { LLMAdapter } from './adapter.interface'
import { OpenAICompatAdapter } from './openai-compat.adapter'
import { mockLLMAdapter } from './mock.adapter'

export const createLLMAdapter = (
  _provider: string,
  config: { apiKey: string; baseURL?: string }
): LLMAdapter => {
  if (process.env.CODEALL_E2E_TEST === '1') {
    return mockLLMAdapter
  }

  if (!config.baseURL) {
    throw new Error('baseURL is required for API adapter')
  }

  return new OpenAICompatAdapter(config.apiKey, config.baseURL)
}

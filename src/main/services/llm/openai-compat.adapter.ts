import type { LLMConfig, LLMConfigApiProtocol } from './adapter.interface'
import { OpenAIAdapter, resolveApiProtocol } from './openai.adapter'
import { normalizeOpenAICompatibleBaseURL } from './openai-base-url'

export class OpenAICompatAdapter extends OpenAIAdapter {
  constructor(apiKey: string, baseURL: string) {
    if (!baseURL) {
      throw new Error('baseURL is required for OpenAI-compatible adapter')
    }
    const normalizedURL = normalizeOpenAICompatibleBaseURL(baseURL)
    super(apiKey, normalizedURL)
  }

  protected override resolveApiProtocol(config: LLMConfig): LLMConfigApiProtocol {
    return resolveApiProtocol(config, 'chat/completions')
  }
}

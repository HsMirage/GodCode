import type { LLMAdapter } from './adapter.interface'
import { OpenAIAdapter } from './openai.adapter'
import { OpenAICompatAdapter } from './openai-compat.adapter'
import { AnthropicAdapter } from './anthropic.adapter'
import { GeminiAdapter } from './gemini.adapter'
import { mockLLMAdapter } from './mock.adapter'

/**
 * Known provider types
 */
export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openai-compatible'
  | 'azure-openai'

/**
 * Configuration for LLM adapter creation
 */
export interface LLMAdapterConfig {
  apiKey: string
  baseURL?: string
}

/**
 * Creates an LLM adapter based on provider type
 *
 * @param provider - The LLM provider type
 * @param config - Configuration including API key and optional base URL
 * @returns An LLM adapter instance
 */
export const createLLMAdapter = (
  provider: string,
  config: LLMAdapterConfig
): LLMAdapter => {
  // Use mock adapter in E2E tests
  if (process.env.CODEALL_E2E_TEST === '1') {
    return mockLLMAdapter
  }

  const normalizedProvider = provider.toLowerCase()

  switch (normalizedProvider) {
    case 'anthropic':
    case 'claude':
      // Native Anthropic API
      return new AnthropicAdapter(config.apiKey, config.baseURL)

    case 'openai':
      // Native OpenAI API
      return new OpenAIAdapter(config.apiKey, config.baseURL)

    case 'gemini':
    case 'google':
    case 'google-gemini':
      // Native Google Gemini API
      return new GeminiAdapter(config.apiKey, config.baseURL)

    case 'azure-openai':
    case 'azure':
      // Azure OpenAI uses OpenAI-compatible endpoint
      if (!config.baseURL) {
        throw new Error('baseURL is required for Azure OpenAI')
      }
      return new OpenAICompatAdapter(config.apiKey, config.baseURL)

    case 'openai-compatible':
    case 'openai-compat':
    case 'custom':
    default:
      // Generic OpenAI-compatible API (Ollama, LM Studio, vLLM, etc.)
      if (!config.baseURL) {
        throw new Error('baseURL is required for OpenAI-compatible adapter')
      }
      return new OpenAICompatAdapter(config.apiKey, config.baseURL)
  }
}

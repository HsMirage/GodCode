import { describe, it, expect, vi } from 'vitest'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { OpenAICompatAdapter } from '@/main/services/llm/openai-compat.adapter'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-user-data'),
    isPackaged: false
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

vi.mock('@/main/services/llm/openai-compat.adapter')
vi.mock('@/main/services/llm/openai.adapter')
vi.mock('@/main/services/llm/anthropic.adapter')

describe('LLM Factory', () => {
  const apiKey = 'test-key'

  it('should create OpenAICompatAdapter for openai-compat provider', () => {
    const baseURL = 'https://local-model.com/v1'
    createLLMAdapter('openai-compat', { apiKey, baseURL })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, baseURL)
  })

  it('should throw error for OpenAICompatAdapter without baseURL', () => {
    expect(() => createLLMAdapter('openai-compat', { apiKey })).toThrow(
      'baseURL is required for OpenAI-compatible adapter'
    )
  })

  it('should create AnthropicAdapter for anthropic provider', () => {
    createLLMAdapter('anthropic', { apiKey })
    expect(AnthropicAdapter).toHaveBeenCalledWith(apiKey, undefined)
  })

  it('should create AnthropicAdapter for claude provider', () => {
    createLLMAdapter('claude', { apiKey })
    expect(AnthropicAdapter).toHaveBeenCalledWith(apiKey, undefined)
  })

  it('should create OpenAIAdapter for openai provider', () => {
    createLLMAdapter('openai', { apiKey })
    expect(OpenAIAdapter).toHaveBeenCalledWith(apiKey, undefined)
  })

  it('should create OpenAICompatAdapter for azure-openai provider with baseURL', () => {
    const baseURL = 'https://my-resource.openai.azure.com'
    createLLMAdapter('azure-openai', { apiKey, baseURL })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, baseURL)
  })

  it('should throw error for azure-openai without baseURL', () => {
    expect(() => createLLMAdapter('azure-openai', { apiKey })).toThrow('baseURL is required for Azure OpenAI')
  })

  it('should fallback to OpenAICompatAdapter for unknown providers with baseURL', () => {
    const baseURL = 'https://custom-provider.com/v1'
    createLLMAdapter('unknown-provider', { apiKey, baseURL })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, baseURL)
  })

  it('should throw error for unknown providers without baseURL', () => {
    expect(() => createLLMAdapter('unknown-provider', { apiKey })).toThrow(
      'baseURL is required for OpenAI-compatible adapter'
    )
  })
})

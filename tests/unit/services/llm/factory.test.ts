import { describe, it, expect, vi } from 'vitest'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { OpenAICompatAdapter } from '@/main/services/llm/openai-compat.adapter'

vi.mock('@/main/services/llm/openai-compat.adapter')

describe('LLM Factory', () => {
  const apiKey = 'test-key'

  it('should create OpenAICompatAdapter', () => {
    const baseURL = 'https://local-model.com/v1'
    createLLMAdapter('openai-compat', { apiKey, baseURL })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, baseURL)
  })

  it('should throw error for OpenAICompatAdapter without baseURL', () => {
    expect(() => createLLMAdapter('openai-compat', { apiKey })).toThrow(
      'baseURL is required for API adapter'
    )
  })

  it('should be tolerant to provider string (always uses OpenAICompatAdapter if not mock)', () => {
    const baseURL = 'https://example.com'
    createLLMAdapter('ANTHROPIC', { apiKey, baseURL })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, baseURL)
  })

  it('should create OpenAICompatAdapter for legacy providers with default URLs', () => {
    createLLMAdapter('anthropic', { apiKey })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, 'https://api.anthropic.com/v1')

    createLLMAdapter('openai', { apiKey })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, 'https://api.openai.com/v1')

    createLLMAdapter('google', { apiKey })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(
      apiKey,
      'https://generativelanguage.googleapis.com/v1beta/openai'
    )
  })
})

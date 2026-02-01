import { describe, it, expect, vi } from 'vitest'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
import { GeminiAdapter } from '@/main/services/llm/gemini.adapter'
import { OpenAICompatAdapter } from '@/main/services/llm/openai-compat.adapter'

// Mock the adapter classes
vi.mock('@/main/services/llm/anthropic.adapter')
vi.mock('@/main/services/llm/openai.adapter')
vi.mock('@/main/services/llm/gemini.adapter')
vi.mock('@/main/services/llm/openai-compat.adapter')

describe('LLM Factory', () => {
  const apiKey = 'test-key'

  it('should create AnthropicAdapter', () => {
    createLLMAdapter('anthropic', { apiKey })
    expect(AnthropicAdapter).toHaveBeenCalledWith(apiKey)
  })

  it('should create OpenAIAdapter', () => {
    createLLMAdapter('openai', { apiKey })
    expect(OpenAIAdapter).toHaveBeenCalledWith(apiKey)
  })

  it('should create GeminiAdapter for "gemini"', () => {
    createLLMAdapter('gemini', { apiKey })
    expect(GeminiAdapter).toHaveBeenCalledWith(apiKey)
  })

  it('should create GeminiAdapter for "google"', () => {
    createLLMAdapter('google', { apiKey })
    expect(GeminiAdapter).toHaveBeenCalledWith(apiKey)
  })

  it('should create OpenAICompatAdapter', () => {
    const baseURL = 'https://local-model.com/v1'
    createLLMAdapter('openai-compat', { apiKey, baseURL })
    expect(OpenAICompatAdapter).toHaveBeenCalledWith(apiKey, baseURL)
  })

  it('should throw error for OpenAICompatAdapter without baseURL', () => {
    expect(() => createLLMAdapter('openai-compat', { apiKey })).toThrow(
      'baseURL required for openai-compat provider'
    )
  })

  it('should throw error for unsupported provider', () => {
    expect(() => createLLMAdapter('unsupported', { apiKey })).toThrow(
      'Unsupported LLM provider: unsupported'
    )
  })

  it('should be case insensitive', () => {
    createLLMAdapter('ANTHROPIC', { apiKey })
    expect(AnthropicAdapter).toHaveBeenCalledWith(apiKey)
  })
})

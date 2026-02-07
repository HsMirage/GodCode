import { describe, it, expect, vi } from 'vitest'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { OpenAICompatAdapter } from '@/main/services/llm/openai-compat.adapter'

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
    expect(() => createLLMAdapter('anthropic', { apiKey })).toThrow('baseURL is required for API adapter')
    expect(() => createLLMAdapter('openai', { apiKey })).toThrow('baseURL is required for API adapter')
    expect(() => createLLMAdapter('google', { apiKey })).toThrow('baseURL is required for API adapter')
  })
})

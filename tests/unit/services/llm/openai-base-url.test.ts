import { describe, expect, it } from 'vitest'
import { normalizeOpenAICompatibleBaseURL } from '@/main/services/llm/openai-base-url'

describe('normalizeOpenAICompatibleBaseURL', () => {
  it('appends /v1 for root host URLs', () => {
    expect(normalizeOpenAICompatibleBaseURL('https://api.example.com')).toBe(
      'https://api.example.com/v1'
    )
    expect(normalizeOpenAICompatibleBaseURL('https://api.example.com/')).toBe(
      'https://api.example.com/v1'
    )
  })

  it('preserves custom path prefixes without force-appending /v1', () => {
    expect(normalizeOpenAICompatibleBaseURL('https://gateway.example.com/newapi')).toBe(
      'https://gateway.example.com/newapi'
    )
    expect(normalizeOpenAICompatibleBaseURL('https://gateway.example.com/openai/v1')).toBe(
      'https://gateway.example.com/openai/v1'
    )
  })

  it('strips mistakenly configured full completion endpoints', () => {
    expect(
      normalizeOpenAICompatibleBaseURL('https://gateway.example.com/v1/chat/completions')
    ).toBe('https://gateway.example.com/v1')
    expect(
      normalizeOpenAICompatibleBaseURL('https://gateway.example.com/newapi/chat/completions')
    ).toBe('https://gateway.example.com/newapi')
  })

  it('keeps other known endpoint paths normalized to their base path', () => {
    expect(normalizeOpenAICompatibleBaseURL('https://gateway.example.com/v1/responses')).toBe(
      'https://gateway.example.com/v1'
    )
    expect(normalizeOpenAICompatibleBaseURL('https://gateway.example.com/v1/embeddings')).toBe(
      'https://gateway.example.com/v1'
    )
  })
})


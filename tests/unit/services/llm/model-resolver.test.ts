import { describe, it, expect } from 'vitest'
import {
  fuzzyMatchModel,
  resolveModelWithFallback,
  DEFAULT_FALLBACK_CHAINS
} from '@/main/services/llm/model-resolver'

describe('Model Resolver', () => {
  describe('fuzzyMatchModel', () => {
    const available = new Set([
      'openai/gpt-4-turbo-preview',
      'anthropic/claude-3-opus-20240229',
      'google/gemini-1.5-pro',
      'gpt-3.5-turbo'
    ])

    it('should return exact match when available', () => {
      expect(fuzzyMatchModel('openai/gpt-4-turbo-preview', available)).toBe(
        'openai/gpt-4-turbo-preview'
      )
      expect(fuzzyMatchModel('gpt-3.5-turbo', available)).toBe('gpt-3.5-turbo')
    })

    it('should match with provider prefix', () => {
      expect(fuzzyMatchModel('gpt-4-turbo-preview', available, ['openai'])).toBe(
        'openai/gpt-4-turbo-preview'
      )
      expect(fuzzyMatchModel('claude-3-opus-20240229', available, ['anthropic'])).toBe(
        'anthropic/claude-3-opus-20240229'
      )
    })

    it('should fuzzy match when model starts with query', () => {
      // "gpt-4" should match "openai/gpt-4-turbo-preview" because the model part starts with "gpt-4"
      expect(fuzzyMatchModel('gpt-4', available)).toBe('openai/gpt-4-turbo-preview')
    })

    it('should fuzzy match when query starts with model (reverse fuzzy)', () => {
      // available has "gpt-3.5-turbo", query is "gpt-3.5-turbo-v1"
      // modelPart "gpt-3.5-turbo" is prefix of "gpt-3.5-turbo-v1"
      expect(fuzzyMatchModel('gpt-3.5-turbo-v1', available)).toBe('gpt-3.5-turbo')
    })

    it('should return null when no match found', () => {
      expect(fuzzyMatchModel('non-existent-model', available)).toBeNull()
    })

    it('should return null for empty available models', () => {
      expect(fuzzyMatchModel('gpt-4', new Set())).toBeNull()
    })
  })

  describe('resolveModelWithFallback', () => {
    const availableModels = new Set([
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-sonnet-20241022',
      'google/gemini-1.5-flash'
    ])

    it('should prioritize user override', () => {
      const result = resolveModelWithFallback({
        userModel: 'openai/gpt-4o',
        availableModels
      })
      expect(result).toEqual({
        model: 'gpt-4o',
        provider: 'openai',
        source: 'override'
      })
    })

    it('should handle user override without provider', () => {
      const result = resolveModelWithFallback({
        userModel: 'some-model',
        availableModels
      })
      expect(result).toEqual({
        model: 'some-model',
        provider: 'unknown',
        source: 'override'
      })
    })

    it('should fall through when userModel is empty or whitespace', () => {
      const result = resolveModelWithFallback({
        userModel: '  ',
        systemDefaultModel: 'openai/gpt-4o',
        availableModels
      })
      expect(result?.source).toBe('system-default')
    })

    it('should resolve via fallback chain when userModel is missing', () => {
      const fallbackChain = [
        { model: 'claude-3-5-sonnet-20241022', providers: ['anthropic'], variant: 'high-perf' },
        { model: 'gpt-4o', providers: ['openai'] }
      ]
      const result = resolveModelWithFallback({
        fallbackChain,
        availableModels
      })
      expect(result).toEqual({
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        source: 'provider-fallback',
        variant: 'high-perf'
      })
    })

    it('should skip unavailable models in fallback chain', () => {
      const fallbackChain = [
        { model: 'non-existent', providers: ['anthropic'] },
        { model: 'gpt-4o-mini', providers: ['openai'] }
      ]
      const result = resolveModelWithFallback({
        fallbackChain,
        availableModels
      })
      expect(result).toEqual({
        model: 'gpt-4o-mini',
        provider: 'openai',
        source: 'provider-fallback',
        variant: undefined
      })
    })

    it('should resolve to system default when fallback chain fails', () => {
      const fallbackChain = [{ model: 'non-existent', providers: ['anthropic'] }]
      const result = resolveModelWithFallback({
        fallbackChain,
        availableModels,
        systemDefaultModel: 'google/gemini-1.5-flash'
      })
      expect(result).toEqual({
        model: 'gemini-1.5-flash',
        provider: 'google',
        source: 'system-default'
      })
    })

    it('should return null when nothing resolves', () => {
      const result = resolveModelWithFallback({
        availableModels,
        fallbackChain: [{ model: 'missing', providers: ['test'] }]
        // no systemDefaultModel
      })
      expect(result).toBeNull()
    })
  })

  describe('DEFAULT_FALLBACK_CHAINS', () => {
    it('should have all required chains', () => {
      expect(DEFAULT_FALLBACK_CHAINS.orchestrator).toBeDefined()
      expect(DEFAULT_FALLBACK_CHAINS.quick).toBeDefined()
      expect(DEFAULT_FALLBACK_CHAINS.visual).toBeDefined()
      expect(DEFAULT_FALLBACK_CHAINS.coding).toBeDefined()
    })

    it('should have at least one entry in each chain', () => {
      expect(DEFAULT_FALLBACK_CHAINS.orchestrator.length).toBeGreaterThan(0)
      expect(DEFAULT_FALLBACK_CHAINS.quick.length).toBeGreaterThan(0)
      expect(DEFAULT_FALLBACK_CHAINS.visual.length).toBeGreaterThan(0)
      expect(DEFAULT_FALLBACK_CHAINS.coding.length).toBeGreaterThan(0)
    })

    it('should have valid providers for each entry', () => {
      for (const chain of Object.values(DEFAULT_FALLBACK_CHAINS)) {
        for (const entry of chain) {
          expect(entry.providers.length).toBeGreaterThan(0)
          expect(typeof entry.model).toBe('string')
        }
      }
    })
  })
})

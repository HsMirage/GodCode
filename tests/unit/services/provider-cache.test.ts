import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProviderCacheService } from '@/main/services/provider-cache.service'

describe('ProviderCacheService', () => {
  let service: ProviderCacheService
  const CACHE_TTL_MS = 5 * 60 * 1000

  beforeEach(() => {
    service = new ProviderCacheService()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('provider status', () => {
    it('should set and get provider status', () => {
      const now = Date.now()
      service.setProviderStatus('openai', true)

      const status = service.getProviderStatus('openai')
      expect(status).toBeDefined()
      expect(status?.connected).toBe(true)
      expect(status?.lastChecked).toBeGreaterThanOrEqual(now)
      expect(status?.error).toBeUndefined()
    })

    it('should store error message in provider status', () => {
      service.setProviderStatus('anthropic', false, 'API Key invalid')

      const status = service.getProviderStatus('anthropic')
      expect(status?.connected).toBe(false)
      expect(status?.error).toBe('API Key invalid')
    })

    it('should return null for non-existent provider', () => {
      expect(service.getProviderStatus('unknown')).toBeNull()
    })

    it('should return null if status is expired', () => {
      service.setProviderStatus('openai', true)

      vi.advanceTimersByTime(CACHE_TTL_MS + 1)

      expect(service.getProviderStatus('openai')).toBeNull()
    })

    it('should correctly report provider connection state', () => {
      service.setProviderStatus('openai', true)
      service.setProviderStatus('anthropic', false)

      expect(service.isProviderConnected('openai')).toBe(true)
      expect(service.isProviderConnected('anthropic')).toBe(false)
      expect(service.isProviderConnected('unknown')).toBe(false)
    })

    it('should handle expiration in isProviderConnected', () => {
      service.setProviderStatus('openai', true)
      vi.advanceTimersByTime(CACHE_TTL_MS + 1)

      expect(service.isProviderConnected('openai')).toBe(false)
    })

    it('should return list of connected providers', () => {
      service.setProviderStatus('openai', true)
      service.setProviderStatus('anthropic', true)
      service.setProviderStatus('google', false)

      const connected = service.getConnectedProviders()
      expect(connected).toContain('openai')
      expect(connected).toContain('anthropic')
      expect(connected).not.toContain('google')
      expect(connected.length).toBe(2)
    })

    it('should filter out expired providers in getConnectedProviders', () => {
      service.setProviderStatus('openai', true)
      vi.advanceTimersByTime(CACHE_TTL_MS + 1)
      service.setProviderStatus('anthropic', true)

      const connected = service.getConnectedProviders()
      expect(connected).toEqual(['anthropic'])
    })
  })

  describe('model management', () => {
    it('should add and retrieve available models', () => {
      service.addAvailableModel('gpt-4', 'openai', ['chat', 'vision'])

      expect(service.isModelAvailable('gpt-4')).toBe(true)
      expect(service.getAvailableModels().has('gpt-4')).toBe(true)

      const info = service.getModelInfo('gpt-4')
      expect(info).toEqual({
        id: 'gpt-4',
        provider: 'openai',
        available: true,
        capabilities: ['chat', 'vision']
      })
    })

    it('should remove models', () => {
      service.addAvailableModel('gpt-4', 'openai')
      service.removeModel('gpt-4')

      expect(service.isModelAvailable('gpt-4')).toBe(false)
      expect(service.getModelInfo('gpt-4')).toBeNull()
    })

    it('should return available models as a new Set', () => {
      service.addAvailableModel('gpt-4', 'openai')
      const models = service.getAvailableModels()

      models.add('malicious-model')
      expect(service.isModelAvailable('malicious-model')).toBe(false)
    })
  })

  describe('cache status', () => {
    it('should correctly report if providers are cached', () => {
      expect(service.hasCachedProviders()).toBe(false)

      service.setProviderStatus('openai', true)
      expect(service.hasCachedProviders()).toBe(true)
    })

    it('should report false if all cached providers are expired', () => {
      service.setProviderStatus('openai', true)
      vi.advanceTimersByTime(CACHE_TTL_MS + 1)

      expect(service.hasCachedProviders()).toBe(false)
    })

    it('should report if models are cached', () => {
      expect(service.hasCachedModels()).toBe(false)

      service.addAvailableModel('gpt-4', 'openai')
      expect(service.hasCachedModels()).toBe(true)
    })
  })

  describe('callbacks', () => {
    it('should notify cache miss callbacks', () => {
      const callback = vi.fn()
      service.onCacheMiss(callback)

      service.notifyCacheMiss('openai')
      expect(callback).toHaveBeenCalledWith('openai')
    })

    it('should handle errors in callbacks gracefully', () => {
      const failingCallback = vi.fn(() => {
        throw new Error('Failed')
      })
      const healthyCallback = vi.fn()

      service.onCacheMiss(failingCallback)
      service.onCacheMiss(healthyCallback)

      expect(() => service.notifyCacheMiss('openai')).not.toThrow()
      expect(failingCallback).toHaveBeenCalled()
      expect(healthyCallback).toHaveBeenCalled()
    })
  })

  describe('utility methods', () => {
    it('should clear all cached data', () => {
      service.setProviderStatus('openai', true)
      service.addAvailableModel('gpt-4', 'openai')

      service.clearCache()

      expect(service.hasCachedProviders()).toBe(false)
      expect(service.hasCachedModels()).toBe(false)
      expect(service.getProviderStatus('openai')).toBeNull()
      expect(service.getModelInfo('gpt-4')).toBeNull()
    })

    it('should return cache stats', () => {
      service.setProviderStatus('openai', true)
      service.addAvailableModel('gpt-4', 'openai')
      service.addAvailableModel('gpt-3.5', 'openai')

      const stats = service.getCacheStats()
      expect(stats).toEqual({
        providers: 1,
        models: 2,
        connectedProviders: ['openai']
      })
    })
  })
})

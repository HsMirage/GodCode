import { logger } from '../../shared/logger'

export interface ProviderStatus {
  connected: boolean
  lastChecked: number
  error?: string
}

export interface ModelInfo {
  id: string
  provider: string
  available: boolean
  capabilities?: string[]
}

const CACHE_TTL_MS = 5 * 60 * 1000

export class ProviderCacheService {
  private providerStatus = new Map<string, ProviderStatus>()
  private availableModels = new Set<string>()
  private modelInfo = new Map<string, ModelInfo>()
  private onCacheMissCallbacks: Array<(provider: string) => void> = []

  setProviderStatus(provider: string, connected: boolean, error?: string): void {
    this.providerStatus.set(provider, {
      connected,
      lastChecked: Date.now(),
      error
    })
    logger.info('[ProviderCache] Provider status updated', { provider, connected, error })
  }

  getProviderStatus(provider: string): ProviderStatus | null {
    const status = this.providerStatus.get(provider)
    if (!status) return null

    if (Date.now() - status.lastChecked > CACHE_TTL_MS) {
      return null
    }

    return status
  }

  isProviderConnected(provider: string): boolean {
    const status = this.getProviderStatus(provider)
    return status?.connected ?? false
  }

  getConnectedProviders(): string[] {
    const connected: string[] = []
    for (const [provider, status] of this.providerStatus) {
      if (status.connected && Date.now() - status.lastChecked <= CACHE_TTL_MS) {
        connected.push(provider)
      }
    }
    return connected
  }

  addAvailableModel(modelId: string, provider: string, capabilities?: string[]): void {
    this.availableModels.add(modelId)
    this.modelInfo.set(modelId, {
      id: modelId,
      provider,
      available: true,
      capabilities
    })
  }

  removeModel(modelId: string): void {
    this.availableModels.delete(modelId)
    this.modelInfo.delete(modelId)
  }

  getAvailableModels(): Set<string> {
    return new Set(this.availableModels)
  }

  isModelAvailable(modelId: string): boolean {
    return this.availableModels.has(modelId)
  }

  getModelInfo(modelId: string): ModelInfo | null {
    return this.modelInfo.get(modelId) ?? null
  }

  hasCachedProviders(): boolean {
    if (this.providerStatus.size === 0) return false

    for (const status of this.providerStatus.values()) {
      if (Date.now() - status.lastChecked <= CACHE_TTL_MS) {
        return true
      }
    }
    return false
  }

  hasCachedModels(): boolean {
    return this.availableModels.size > 0
  }

  onCacheMiss(callback: (provider: string) => void): void {
    this.onCacheMissCallbacks.push(callback)
  }

  notifyCacheMiss(provider: string): void {
    logger.warn('[ProviderCache] Cache miss for provider', { provider })
    for (const callback of this.onCacheMissCallbacks) {
      try {
        callback(provider)
      } catch (err) {
        logger.error('[ProviderCache] Cache miss callback error', { error: String(err) })
      }
    }
  }

  clearCache(): void {
    this.providerStatus.clear()
    this.availableModels.clear()
    this.modelInfo.clear()
    logger.info('[ProviderCache] Cache cleared')
  }

  getCacheStats(): { providers: number; models: number; connectedProviders: string[] } {
    return {
      providers: this.providerStatus.size,
      models: this.availableModels.size,
      connectedProviders: this.getConnectedProviders()
    }
  }
}

export const providerCacheService = new ProviderCacheService()

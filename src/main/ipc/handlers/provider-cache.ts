import { IpcMainInvokeEvent } from 'electron'
import { providerCacheService } from '../../services/provider-cache.service'

export async function handleProviderCacheGetStats(_event: IpcMainInvokeEvent) {
  return providerCacheService.getCacheStats()
}

export async function handleProviderCacheIsConnected(_event: IpcMainInvokeEvent, provider: string) {
  return providerCacheService.isProviderConnected(provider)
}

export async function handleProviderCacheGetAvailableModels(_event: IpcMainInvokeEvent) {
  return Array.from(providerCacheService.getAvailableModels())
}

export async function handleProviderCacheSetStatus(
  _event: IpcMainInvokeEvent,
  input: { provider: string; connected: boolean; error?: string }
) {
  providerCacheService.setProviderStatus(input.provider, input.connected, input.error)
  return { success: true }
}

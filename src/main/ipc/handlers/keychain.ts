import { type IpcMainInvokeEvent } from 'electron'
import { KeychainService } from '../../services/keychain.service'

const keychainService = KeychainService.getInstance()

export const handleKeychainSetPassword = async (
  _: IpcMainInvokeEvent,
  {
    id,
    label,
    baseURL,
    apiKey,
    provider
  }: { id?: string; label?: string; baseURL: string; apiKey: string; provider?: string }
): Promise<void> => {
  await keychainService.storeApiKey({ id, label, baseURL, apiKey, provider })
}

export const handleKeychainGetPassword = async (
  _: IpcMainInvokeEvent,
  { service, account }: { service: string; account: string }
): Promise<string | null> => {
  // Legacy support for retrieving keys by provider name
  const provider = account.replace('-api-key', '')
  const keys = await keychainService.getAllApiKeys()
  const key = keys.find(k => k.provider === provider || k.label === provider)
  return key ? key.apiKey : null
}

export const handleKeychainDeletePassword = async (
  _: IpcMainInvokeEvent,
  { service, account, id }: { service: string; account: string; id?: string }
): Promise<boolean> => {
  if (id) {
    await keychainService.deleteApiKey(id)
  } else {
    // Legacy support
    const provider = account.replace('-api-key', '')
    await keychainService.deleteApiKey(provider)
  }
  return true
}

export const handleKeychainList = async (): Promise<Array<any>> => {
  return await keychainService.getAllApiKeys()
}

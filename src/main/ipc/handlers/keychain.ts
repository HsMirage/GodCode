import { type IpcMainInvokeEvent } from 'electron'
import { KeychainService } from '../../services/keychain.service'

const keychainService = KeychainService.getInstance()

export const handleKeychainSetPassword = async (
  _: IpcMainInvokeEvent,
  { service, account, password }: { service: string; account: string; password: string }
): Promise<void> => {
  // Map service/account to provider
  const provider = account.replace('-api-key', '')
  await keychainService.storeApiKey(provider, password)
}

export const handleKeychainGetPassword = async (
  _: IpcMainInvokeEvent,
  { service, account }: { service: string; account: string }
): Promise<string | null> => {
  const provider = account.replace('-api-key', '')
  return await keychainService.getApiKey(provider)
}

export const handleKeychainDeletePassword = async (
  _: IpcMainInvokeEvent,
  { service, account }: { service: string; account: string }
): Promise<boolean> => {
  const provider = account.replace('-api-key', '')
  await keychainService.deleteApiKey(provider)
  return true
}

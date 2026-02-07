import { type IpcMainInvokeEvent } from 'electron'
import { KeychainService } from '../../services/keychain.service'
import { DatabaseService } from '../../services/database'
import { SecureStorageService } from '../../services/secure-storage.service'

const keychainService = KeychainService.getInstance()

type ApiKeyModelInfo = {
  id: string
  modelName: string
  provider: string
}

type ApiKeyWithModelsRecord = {
  id: string
  provider: string
  label: string | null
  baseURL: string
  encryptedKey: string
  models: ApiKeyModelInfo[]
}

export type ApiKeyWithModelsMasked = {
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKeyMasked: string
  models: ApiKeyModelInfo[]
}

export type ApiKeyWithModelsDecrypted = {
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKey: string
  models: ApiKeyModelInfo[]
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '...' + key.slice(-4)
}

export const handleKeychainSetPassword = async (
  _: IpcMainInvokeEvent,
  {
    id,
    label,
    baseURL,
    apiKey,
    provider
  }: { id?: string; label?: string; baseURL: string; apiKey: string; provider?: string }
): Promise<{ id: string }> => {
  return await keychainService.storeApiKey({ id, label, baseURL, apiKey, provider })
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

export async function handleKeychainListWithModels(): Promise<ApiKeyWithModelsMasked[]> {
  await DatabaseService.getInstance().init()
  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()

  const records: ApiKeyWithModelsRecord[] = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      models: {
        select: {
          id: true,
          modelName: true,
          provider: true
        }
      }
    }
  })

  return records.map(record => {
    const decryptedKey = secureStorage.decrypt(record.encryptedKey)

    return {
      id: record.id,
      provider: record.provider,
      label: record.label,
      baseURL: record.baseURL,
      apiKeyMasked: maskApiKey(decryptedKey),
      models: record.models
    }
  })
}

export async function handleKeychainGetWithModels(
  _event: IpcMainInvokeEvent,
  apiKeyId: string
): Promise<ApiKeyWithModelsDecrypted | null> {
  await DatabaseService.getInstance().init()
  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()

  const record: ApiKeyWithModelsRecord | null = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    include: {
      models: {
        select: {
          id: true,
          modelName: true,
          provider: true
        }
      }
    }
  })

  if (!record) {
    return null
  }

  return {
    id: record.id,
    provider: record.provider,
    label: record.label,
    baseURL: record.baseURL,
    apiKey: secureStorage.decrypt(record.encryptedKey),
    models: record.models
  }
}

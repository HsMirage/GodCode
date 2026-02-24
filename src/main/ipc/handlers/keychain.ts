import { type IpcMainInvokeEvent } from 'electron'
import { KeychainService } from '../../services/keychain.service'
import { DatabaseService } from '../../services/database'
import { SecureStorageService, maskApiKey } from '../../services/secure-storage.service'

const keychainService = KeychainService.getInstance()

type ApiKeyModelInfo = {
  id: string
  modelName: string
  provider: string
}

type ApiKeyRecord = {
  id: string
  provider: string
  label: string | null
  baseURL: string
  encryptedKey: string
}

type ModelLinkRecord = {
  id: string
  modelName: string
  provider: string
  apiKeyId: string | null
  baseURL: string | null
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

function normalizeBaseURL(baseURL: string | null | undefined): string {
  return (baseURL || '').trim().replace(/\/+$/, '')
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function buildProviderModelMap(
  apiKeys: ApiKeyRecord[],
  models: ModelLinkRecord[]
): Map<string, ApiKeyModelInfo[]> {
  const modelsByProviderId = new Map<string, ApiKeyModelInfo[]>()
  const apiKeyById = new Map<string, ApiKeyRecord>()
  const apiKeyIdsByBaseURL = new Map<string, string[]>()
  const apiKeyIdsByName = new Map<string, string[]>()

  const appendModel = (apiKeyId: string, model: ModelLinkRecord, linkedModelIds: Set<string>): void => {
    if (linkedModelIds.has(model.id)) return
    if (!modelsByProviderId.has(apiKeyId)) modelsByProviderId.set(apiKeyId, [])
    modelsByProviderId.get(apiKeyId)?.push({
      id: model.id,
      modelName: model.modelName,
      provider: model.provider
    })
    linkedModelIds.add(model.id)
  }

  const addNameMapping = (name: string | null | undefined, apiKeyId: string): void => {
    const normalized = normalizeName(name)
    if (!normalized) return
    const ids = apiKeyIdsByName.get(normalized) ?? []
    ids.push(apiKeyId)
    apiKeyIdsByName.set(normalized, ids)
  }

  for (const apiKey of apiKeys) {
    apiKeyById.set(apiKey.id, apiKey)
    modelsByProviderId.set(apiKey.id, [])

    const normalizedURL = normalizeBaseURL(apiKey.baseURL)
    if (normalizedURL) {
      const ids = apiKeyIdsByBaseURL.get(normalizedURL) ?? []
      ids.push(apiKey.id)
      apiKeyIdsByBaseURL.set(normalizedURL, ids)
    }

    addNameMapping(apiKey.provider, apiKey.id)
    addNameMapping(apiKey.label, apiKey.id)
  }

  const linkedModelIds = new Set<string>()

  // 1) Strong link: explicit foreign key relation.
  for (const model of models) {
    if (!model.apiKeyId) continue
    if (!apiKeyById.has(model.apiKeyId)) continue
    appendModel(model.apiKeyId, model, linkedModelIds)
  }

  // 2) Backward-compat link for legacy rows without apiKeyId.
  for (const model of models) {
    if (linkedModelIds.has(model.id)) continue

    const normalizedModelURL = normalizeBaseURL(model.baseURL)
    let candidateIds = normalizedModelURL ? [...(apiKeyIdsByBaseURL.get(normalizedModelURL) ?? [])] : []

    // Disambiguate by provider/label when multiple Base URLs match.
    const normalizedModelProvider = normalizeName(model.provider)
    if (candidateIds.length > 1 && normalizedModelProvider) {
      const byName = candidateIds.filter(id => {
        const key = apiKeyById.get(id)
        if (!key) return false
        return (
          normalizeName(key.provider) === normalizedModelProvider ||
          normalizeName(key.label) === normalizedModelProvider
        )
      })
      if (byName.length === 1) {
        candidateIds = byName
      }
    }

    // If URL did not match anything, try provider/label exact match.
    if (candidateIds.length === 0 && normalizedModelProvider) {
      candidateIds = [...(apiKeyIdsByName.get(normalizedModelProvider) ?? [])]
    }

    if (candidateIds.length === 1) {
      appendModel(candidateIds[0], model, linkedModelIds)
    }
  }

  return modelsByProviderId
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
  { service: _service, account }: { service: string; account: string }
): Promise<string | null> => {
  // Legacy support for retrieving keys by provider name.
  // Return full decrypted key via get-with-models to avoid leaking plaintext through list endpoints.
  const provider = account.replace('-api-key', '')
  const keys = await handleKeychainListWithModels()
  const matched = keys.find(k => k.provider === provider || k.label === provider)
  if (!matched) {
    return null
  }
  const detail = await handleKeychainGetWithModels({} as IpcMainInvokeEvent, matched.id)
  return detail?.apiKey ?? null
}

export const handleKeychainDeletePassword = async (
  _: IpcMainInvokeEvent,
  { service: _service, account, id }: { service: string; account: string; id?: string }
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

export const handleKeychainList = async (): Promise<
  Array<{ id: string; label: string | null; baseURL: string; apiKey: string; provider: string }>
> => {
  return await keychainService.getAllApiKeys()
}

export async function handleKeychainListWithModels(): Promise<ApiKeyWithModelsMasked[]> {
  await DatabaseService.getInstance().init()
  const prisma = DatabaseService.getInstance().getClient()
  const secureStorage = SecureStorageService.getInstance()

  const records: ApiKeyRecord[] = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' }
  })
  const allModels: ModelLinkRecord[] = await prisma.model.findMany({
    select: {
      id: true,
      modelName: true,
      provider: true,
      apiKeyId: true,
      baseURL: true
    }
  })
  const providerModelMap = buildProviderModelMap(records, allModels)

  return records.map(record => {
    const decryptedKey = secureStorage.decrypt(record.encryptedKey)

    return {
      id: record.id,
      provider: record.provider,
      label: record.label,
      baseURL: record.baseURL,
      apiKeyMasked: maskApiKey(decryptedKey),
      models: providerModelMap.get(record.id) ?? []
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

  const record: ApiKeyRecord | null = await prisma.apiKey.findUnique({
    where: { id: apiKeyId }
  })

  if (!record) {
    return null
  }

  const allRecords: ApiKeyRecord[] = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' }
  })
  const allModels: ModelLinkRecord[] = await prisma.model.findMany({
    select: {
      id: true,
      modelName: true,
      provider: true,
      apiKeyId: true,
      baseURL: true
    }
  })
  const providerModelMap = buildProviderModelMap(allRecords, allModels)

  return {
    id: record.id,
    provider: record.provider,
    label: record.label,
    baseURL: record.baseURL,
    apiKey: secureStorage.decrypt(record.encryptedKey),
    models: providerModelMap.get(record.id) ?? []
  }
}

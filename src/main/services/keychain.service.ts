import { DatabaseService } from './database'
import { SecureStorageService } from './secure-storage.service'

export class KeychainService {
  private static instance: KeychainService | null = null

  private constructor() {}

  static getInstance(): KeychainService {
    if (!KeychainService.instance) {
      KeychainService.instance = new KeychainService()
    }
    return KeychainService.instance
  }

  /**
   * Securely store an API key entry.
   * @param id The ID of the key entry (optional, for updates)
   * @param data The key data including provider/label, baseURL and key
   */
  async storeApiKey(data: {
    id?: string
    label?: string
    baseURL: string
    apiKey: string
    provider?: string
  }): Promise<void> {
    try {
      const { id, label, baseURL, apiKey, provider } = data

      if (!baseURL || !apiKey) {
        throw new Error('Base URL and API key are required')
      }

      const secureStorage = SecureStorageService.getInstance()
      const encryptedKey = secureStorage.encrypt(apiKey)

      const prisma = DatabaseService.getInstance().getClient()

      // For backward compatibility or if provider is used
      const providerValue = provider || label || 'custom'

      if (id) {
        await prisma.apiKey.update({
          where: { id },
          data: {
            label: label || providerValue,
            baseURL,
            encryptedKey,
            provider: providerValue,
            updatedAt: new Date()
          }
        })
      } else {
        await prisma.apiKey.create({
          data: {
            label: label || providerValue,
            baseURL,
            encryptedKey,
            provider: providerValue
          }
        })
      }

      console.log(`[Keychain] Successfully stored API key for ${label || providerValue}`)
    } catch (error) {
      console.error(`[Keychain] Failed to store API key:`, error)
      throw error
    }
  }

  /**
   * Retrieve all API keys.
   * @returns Array of API key entries with decrypted keys
   */
  async getAllApiKeys(): Promise<
    Array<{ id: string; label: string | null; baseURL: string; apiKey: string; provider: string }>
  > {
    try {
      const prisma = DatabaseService.getInstance().getClient()
      const records = await prisma.apiKey.findMany({
        orderBy: { createdAt: 'desc' }
      })

      const secureStorage = SecureStorageService.getInstance()

      return records.map(
        (record: {
          id: string
          label: string | null
          baseURL: string
          encryptedKey: string
          provider: string
        }) => ({
          id: record.id,
          label: record.label,
          baseURL: record.baseURL,
          provider: record.provider,
          apiKey: secureStorage.decrypt(record.encryptedKey)
        })
      )
    } catch (error) {
      console.error(`[Keychain] Failed to retrieve API keys:`, error)
      throw error
    }
  }

  /**
   * Delete an API key by ID.
   * @param id The ID of the key entry
   */
  async deleteApiKey(id: string): Promise<void> {
    try {
      const prisma = DatabaseService.getInstance().getClient()
      try {
        await prisma.apiKey.delete({
          where: { id }
        })
        console.log(`[Keychain] Deleted API key ${id}`)
      } catch (e) {
        if ((e as any).code === 'P2025') {
          console.log(`[Keychain] No API key found to delete for ${id}`)
          return
        }
        throw e
      }
    } catch (error) {
      console.error(`[Keychain] Failed to delete API key ${id}:`, error)
      throw error
    }
  }

  /**
   * List all providers that have stored API keys.
   * @returns Array of provider names
   * @deprecated Use getAllApiKeys instead
   */
  async listProviders(): Promise<string[]> {
    try {
      const prisma = DatabaseService.getInstance().getClient()
      const records = await prisma.apiKey.findMany({
        select: {
          provider: true
        },
        orderBy: {
          provider: 'asc'
        }
      })
      return records.map((r: { provider: string }) => r.provider)
    } catch (error) {
      console.error('[Keychain] Failed to list providers:', error)
      throw error
    }
  }

  /**
   * Check if an API key exists for a provider.
   * @param provider The provider name
   * @returns True if key exists, false otherwise
   * @deprecated Use getAllApiKeys instead
   */
  async hasApiKey(provider: string): Promise<boolean> {
    try {
      const prisma = DatabaseService.getInstance().getClient()
      const count = await prisma.apiKey.count({
        where: {
          provider
        }
      })
      return count > 0
    } catch (error) {
      console.error(`[Keychain] Failed to check API key existence for ${provider}:`, error)
      throw error
    }
  }
}

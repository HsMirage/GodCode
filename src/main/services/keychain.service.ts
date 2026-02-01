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
   * Securely store an API key for a provider.
   * If the key already exists, it will be updated (upsert).
   * @param provider The provider name (e.g., 'openai', 'anthropic')
   * @param plainKey The plaintext API key
   */
  async storeApiKey(provider: string, plainKey: string): Promise<void> {
    try {
      if (!provider || !plainKey) {
        throw new Error('Provider and API key are required')
      }

      const secureStorage = SecureStorageService.getInstance()
      const encryptedKey = secureStorage.encrypt(plainKey)

      const prisma = DatabaseService.getInstance().getClient()

      await prisma.apiKey.upsert({
        where: {
          provider
        },
        update: {
          encryptedKey,
          updatedAt: new Date()
        },
        create: {
          provider,
          encryptedKey
        }
      })

      console.log(`[Keychain] Successfully stored API key for ${provider}`)
    } catch (error) {
      console.error(`[Keychain] Failed to store API key for ${provider}:`, error)
      throw error
    }
  }

  /**
   * Retrieve and decrypt an API key for a provider.
   * @param provider The provider name
   * @returns The decrypted API key or null if not found
   */
  async getApiKey(provider: string): Promise<string | null> {
    try {
      const prisma = DatabaseService.getInstance().getClient()
      const record = await prisma.apiKey.findUnique({
        where: {
          provider
        }
      })

      if (!record) {
        return null
      }

      const secureStorage = SecureStorageService.getInstance()
      return secureStorage.decrypt(record.encryptedKey)
    } catch (error) {
      console.error(`[Keychain] Failed to retrieve API key for ${provider}:`, error)
      throw error
    }
  }

  /**
   * Delete an API key for a provider.
   * @param provider The provider name
   */
  async deleteApiKey(provider: string): Promise<void> {
    try {
      const prisma = DatabaseService.getInstance().getClient()
      // Check if it exists first to avoid error or to decide on idempotent behavior
      // Prisma delete throws if record not found
      try {
        await prisma.apiKey.delete({
          where: {
            provider
          }
        })
        console.log(`[Keychain] Deleted API key for ${provider}`)
      } catch (e) {
        // Ignore "Record to delete does not exist" error
        if ((e as any).code === 'P2025') {
          console.log(`[Keychain] No API key found to delete for ${provider}`)
          return
        }
        throw e
      }
    } catch (error) {
      console.error(`[Keychain] Failed to delete API key for ${provider}:`, error)
      throw error
    }
  }

  /**
   * List all providers that have stored API keys.
   * @returns Array of provider names
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

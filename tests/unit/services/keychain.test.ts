import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeychainService } from '@/main/services/keychain.service'
import { SecureStorageService } from '@/main/services/secure-storage.service'
import { DatabaseService } from '@/main/services/database'
import { v4 as uuid } from 'uuid'

// Mock SecureStorageService
const mockSecureStorage = {
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  isEncryptionAvailable: vi.fn()
}

vi.mock('@/main/services/secure-storage.service', () => ({
  SecureStorageService: {
    getInstance: vi.fn(() => mockSecureStorage)
  }
}))

// Mock DatabaseService and Prisma
const mockApiKeyStore: any[] = []

const prismaMock = {
  apiKey: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existingIndex = mockApiKeyStore.findIndex(item => item.provider === where.provider)
      if (existingIndex >= 0) {
        const existing = mockApiKeyStore[existingIndex]
        Object.assign(existing, update, { updatedAt: new Date() })
        return existing
      } else {
        const entry = { id: uuid(), ...create, createdAt: new Date(), updatedAt: new Date() }
        mockApiKeyStore.push(entry)
        return entry
      }
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return mockApiKeyStore.find(item => item.provider === where.provider) || null
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = mockApiKeyStore.findIndex(item => item.provider === where.provider)
      if (index >= 0) {
        const deleted = mockApiKeyStore[index]
        mockApiKeyStore.splice(index, 1)
        return deleted
      }
      // Simulate Prisma error P2025
      const error: any = new Error('Record to delete does not exist.')
      error.code = 'P2025'
      throw error
    }),
    findMany: vi.fn(async () => mockApiKeyStore),
    count: vi.fn(async ({ where }: any) => {
      return mockApiKeyStore.filter(item => item.provider === where.provider).length
    })
  }
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      getClient: vi.fn(() => prismaMock)
    }))
  }
}))

describe('KeychainService', () => {
  let keychain: KeychainService

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiKeyStore.length = 0 // Clear in-memory store
    keychain = KeychainService.getInstance()

    // Default mocks
    mockSecureStorage.encrypt.mockImplementation((text: string) => `encrypted_${text}`)
    mockSecureStorage.decrypt.mockImplementation((text: string) => text.replace('encrypted_', ''))
    mockSecureStorage.isEncryptionAvailable.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('storeApiKey', () => {
    it('should encrypt and store a new API key', async () => {
      const provider = 'openai'
      const key = 'sk-123456'

      await keychain.storeApiKey(provider, key)

      expect(mockSecureStorage.encrypt).toHaveBeenCalledWith(key)
      expect(prismaMock.apiKey.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { provider },
          create: expect.objectContaining({
            provider,
            encryptedKey: `encrypted_${key}`
          })
        })
      )
    })

    it('should update existing API key (upsert)', async () => {
      const provider = 'openai'
      const oldKey = 'sk-old'
      const newKey = 'sk-new'

      // Pre-populate
      mockApiKeyStore.push({
        id: '1',
        provider,
        encryptedKey: `encrypted_${oldKey}`,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      await keychain.storeApiKey(provider, newKey)

      expect(mockSecureStorage.encrypt).toHaveBeenCalledWith(newKey)
      expect(prismaMock.apiKey.upsert).toHaveBeenCalled()

      // Verify store updated
      const stored = mockApiKeyStore.find(k => k.provider === provider)
      expect(stored.encryptedKey).toBe(`encrypted_${newKey}`)
    })

    it('should throw error if inputs are missing', async () => {
      await expect(keychain.storeApiKey('', 'key')).rejects.toThrow()
      await expect(keychain.storeApiKey('provider', '')).rejects.toThrow()
    })
  })

  describe('getApiKey', () => {
    it('should retrieve and decrypt API key', async () => {
      const provider = 'anthropic'
      const key = 'sk-ant-123'

      mockApiKeyStore.push({
        id: '1',
        provider,
        encryptedKey: `encrypted_${key}`,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const result = await keychain.getApiKey(provider)

      expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith({ where: { provider } })
      expect(mockSecureStorage.decrypt).toHaveBeenCalledWith(`encrypted_${key}`)
      expect(result).toBe(key)
    })

    it('should return null if key not found', async () => {
      const result = await keychain.getApiKey('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('deleteApiKey', () => {
    it('should delete API key', async () => {
      const provider = 'openai'
      mockApiKeyStore.push({
        id: '1',
        provider,
        encryptedKey: 'enc_key',
        createdAt: new Date(),
        updatedAt: new Date()
      })

      await keychain.deleteApiKey(provider)

      expect(prismaMock.apiKey.delete).toHaveBeenCalledWith({ where: { provider } })
      expect(mockApiKeyStore.length).toBe(0)
    })

    it('should handle non-existent key gracefully', async () => {
      // Should not throw
      await keychain.deleteApiKey('nonexistent')
      expect(prismaMock.apiKey.delete).toHaveBeenCalled()
    })
  })

  describe('listProviders', () => {
    it('should list all providers', async () => {
      mockApiKeyStore.push(
        { id: '1', provider: 'openai', encryptedKey: 'k1' },
        { id: '2', provider: 'anthropic', encryptedKey: 'k2' }
      )

      const providers = await keychain.listProviders()

      expect(providers).toEqual(['openai', 'anthropic']) // Mock implementation returns filtered array
      expect(prismaMock.apiKey.findMany).toHaveBeenCalled()
    })
  })

  describe('hasApiKey', () => {
    it('should return true if key exists', async () => {
      mockApiKeyStore.push({ id: '1', provider: 'openai', encryptedKey: 'k1' })
      const result = await keychain.hasApiKey('openai')
      expect(result).toBe(true)
    })

    it('should return false if key does not exist', async () => {
      const result = await keychain.hasApiKey('gemini')
      expect(result).toBe(false)
    })
  })
})

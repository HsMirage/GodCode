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
    create: vi.fn(async ({ data }: any) => {
      const entry = { id: uuid(), ...data, createdAt: new Date(), updatedAt: new Date() }
      mockApiKeyStore.push(entry)
      return entry
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = mockApiKeyStore.findIndex(item => item.id === where.id)
      if (index >= 0) {
        const existing = mockApiKeyStore[index]
        Object.assign(existing, data, { updatedAt: new Date() })
        return existing
      }
      throw new Error('Record to update does not exist.')
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      // Not used anymore in new implementation but kept for completeness
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
      return (
        mockApiKeyStore.find(item => item.provider === where.provider || item.id === where.id) ||
        null
      )
    }),
    delete: vi.fn(async ({ where }: any) => {
      const index = mockApiKeyStore.findIndex(
        item => item.id === where.id || item.provider === where.provider
      )
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
      const data = {
        label: 'My Key',
        baseURL: 'https://api.example.com',
        apiKey: 'sk-123456',
        provider: 'custom'
      }

      await keychain.storeApiKey(data)

      expect(mockSecureStorage.encrypt).toHaveBeenCalledWith(data.apiKey)
      expect(prismaMock.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            label: data.label,
            baseURL: data.baseURL,
            provider: data.provider,
            encryptedKey: `encrypted_${data.apiKey}`
          })
        })
      )
    })

    it('should update existing API key', async () => {
      const id = 'existing-id'
      const oldKey = 'sk-old'
      const newKey = 'sk-new'

      // Pre-populate
      mockApiKeyStore.push({
        id,
        label: 'Old Label',
        baseURL: 'https://old.com',
        provider: 'custom',
        encryptedKey: `encrypted_${oldKey}`,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const updateData = {
        id,
        label: 'New Label',
        baseURL: 'https://new.com',
        apiKey: newKey,
        provider: 'custom'
      }

      await keychain.storeApiKey(updateData)

      expect(mockSecureStorage.encrypt).toHaveBeenCalledWith(newKey)
      expect(prismaMock.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          data: expect.objectContaining({
            label: updateData.label,
            baseURL: updateData.baseURL,
            encryptedKey: `encrypted_${newKey}`
          })
        })
      )
    })

    it('should throw error if inputs are missing', async () => {
      await expect(
        keychain.storeApiKey({ label: 'test', baseURL: '', apiKey: 'key' })
      ).rejects.toThrow()
      await expect(
        keychain.storeApiKey({ label: 'test', baseURL: 'url', apiKey: '' })
      ).rejects.toThrow()
    })
  })

  describe('getAllApiKeys', () => {
    it('should retrieve and decrypt all API keys', async () => {
      const key1 = 'sk-1'
      const key2 = 'sk-2'

      mockApiKeyStore.push(
        {
          id: '1',
          label: 'Key 1',
          baseURL: 'url1',
          provider: 'custom',
          encryptedKey: `encrypted_${key1}`,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: '2',
          label: 'Key 2',
          baseURL: 'url2',
          provider: 'custom',
          encryptedKey: `encrypted_${key2}`,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      )

      const result = await keychain.getAllApiKeys()

      expect(result).toHaveLength(2)
      expect(result[0].apiKey).toBe(key1)
      expect(result[1].apiKey).toBe(key2)
      expect(mockSecureStorage.decrypt).toHaveBeenCalledTimes(2)
    })
  })

  describe('deleteApiKey', () => {
    it('should delete API key by ID', async () => {
      const id = 'delete-me'
      mockApiKeyStore.push({
        id,
        label: 'Key',
        baseURL: 'url',
        provider: 'custom',
        encryptedKey: 'enc_key',
        createdAt: new Date(),
        updatedAt: new Date()
      })

      await keychain.deleteApiKey(id)

      expect(prismaMock.apiKey.delete).toHaveBeenCalledWith({ where: { id } })
      expect(mockApiKeyStore.length).toBe(0)
    })

    it('should handle non-existent key gracefully', async () => {
      await keychain.deleteApiKey('nonexistent')
      expect(prismaMock.apiKey.delete).toHaveBeenCalled()
    })
  })
})

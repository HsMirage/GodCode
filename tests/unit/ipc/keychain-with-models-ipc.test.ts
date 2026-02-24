import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import {
  handleKeychainGetPassword,
  handleKeychainGetWithModels,
  handleKeychainListWithModels
} from '@/main/ipc/handlers/keychain'

const prismaMock = {
  apiKey: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  model: {
    findMany: vi.fn()
  }
}

const dbInstance = {
  init: vi.fn(async () => {}),
  getClient: vi.fn(() => prismaMock)
}

const decryptMock = vi.fn((value: string) => value.replace('enc:', ''))

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => dbInstance)
  }
}))

vi.mock('@/main/services/secure-storage.service', () => ({
  SecureStorageService: {
    getInstance: vi.fn(() => ({
      decrypt: decryptMock
    }))
  },
  maskApiKey: (key: string) => {
    if (!key) return '********'
    if (key.length < 8) return '********'
    return `${key.slice(0, 4)}...${key.slice(-4)}`
  }
}))

describe('keychain list/get with models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links models by apiKeyId first, then falls back to baseURL/provider', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([
      {
        id: 'k1',
        provider: 'custom-a',
        label: 'Provider A',
        baseURL: 'https://api.a.com/v1',
        encryptedKey: 'enc:sk-a-1234567890'
      },
      {
        id: 'k2',
        provider: 'custom-b',
        label: 'Provider B',
        baseURL: 'https://api.b.com/v1/',
        encryptedKey: 'enc:sk-b-1234567890'
      }
    ])
    prismaMock.model.findMany.mockResolvedValue([
      {
        id: 'm1',
        modelName: 'model-explicit',
        provider: 'openai-compatible',
        apiKeyId: 'k1',
        baseURL: null
      },
      {
        id: 'm2',
        modelName: 'model-by-base-url',
        provider: 'openai-compatible',
        apiKeyId: null,
        baseURL: 'https://api.b.com/v1'
      },
      {
        id: 'm3',
        modelName: 'model-by-provider-name',
        provider: 'provider b',
        apiKeyId: null,
        baseURL: null
      }
    ])

    const result = await handleKeychainListWithModels()
    const k1 = result.find(r => r.id === 'k1')
    const k2 = result.find(r => r.id === 'k2')

    expect(k1?.models.map(m => m.id)).toEqual(['m1'])
    expect(k2?.models.map(m => m.id)).toEqual(['m2', 'm3'])
    expect(k1?.apiKeyMasked).toBe('sk-a...7890')
    expect(k2?.apiKeyMasked).toBe('sk-b...7890')
  })

  it('does not force-link ambiguous baseURL matches unless provider disambiguates', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([
      {
        id: 'k1',
        provider: 'alpha',
        label: 'Alpha',
        baseURL: 'https://same.example.com/v1',
        encryptedKey: 'enc:sk-alpha-12345678'
      },
      {
        id: 'k2',
        provider: 'beta',
        label: 'Beta',
        baseURL: 'https://same.example.com/v1/',
        encryptedKey: 'enc:sk-beta-12345678'
      }
    ])
    prismaMock.model.findMany.mockResolvedValue([
      {
        id: 'm-ambiguous',
        modelName: 'model-ambiguous',
        provider: 'unknown',
        apiKeyId: null,
        baseURL: 'https://same.example.com/v1'
      },
      {
        id: 'm-beta',
        modelName: 'model-beta',
        provider: 'beta',
        apiKeyId: null,
        baseURL: 'https://same.example.com/v1'
      }
    ])

    const result = await handleKeychainListWithModels()
    const k1 = result.find(r => r.id === 'k1')
    const k2 = result.find(r => r.id === 'k2')

    expect(k1?.models.map(m => m.id)).toEqual([])
    expect(k2?.models.map(m => m.id)).toEqual(['m-beta'])
  })

  it('returns resolved linked models for a single provider in get-with-models', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: 'k2',
      provider: 'custom-b',
      label: 'Provider B',
      baseURL: 'https://api.b.com/v1/',
      encryptedKey: 'enc:sk-b-1234567890'
    })
    prismaMock.apiKey.findMany.mockResolvedValue([
      {
        id: 'k1',
        provider: 'custom-a',
        label: 'Provider A',
        baseURL: 'https://api.a.com/v1',
        encryptedKey: 'enc:sk-a-1234567890'
      },
      {
        id: 'k2',
        provider: 'custom-b',
        label: 'Provider B',
        baseURL: 'https://api.b.com/v1/',
        encryptedKey: 'enc:sk-b-1234567890'
      }
    ])
    prismaMock.model.findMany.mockResolvedValue([
      {
        id: 'm2',
        modelName: 'model-by-base-url',
        provider: 'openai-compatible',
        apiKeyId: null,
        baseURL: 'https://api.b.com/v1'
      }
    ])

    const result = await handleKeychainGetWithModels({} as IpcMainInvokeEvent, 'k2')

    expect(result?.id).toBe('k2')
    expect(result?.apiKey).toBe('sk-b-1234567890')
    expect(result?.models.map(m => m.id)).toEqual(['m2'])
  })

  it('returns full decrypted key via legacy get-password handler', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([
      {
        id: 'k2',
        provider: 'custom-b',
        label: 'Provider B',
        baseURL: 'https://api.b.com/v1/',
        encryptedKey: 'enc:sk-b-1234567890'
      }
    ])
    prismaMock.model.findMany.mockResolvedValue([])
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: 'k2',
      provider: 'custom-b',
      label: 'Provider B',
      baseURL: 'https://api.b.com/v1/',
      encryptedKey: 'enc:sk-b-1234567890'
    })

    const result = await handleKeychainGetPassword({} as IpcMainInvokeEvent, {
      service: 'codeall-app',
      account: 'custom-b-api-key'
    })

    expect(result).toBe('sk-b-1234567890')
  })
})

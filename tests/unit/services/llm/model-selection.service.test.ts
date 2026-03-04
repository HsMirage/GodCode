import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModelSelectionService } from '@/main/services/llm/model-selection.service'

const findUniqueMock = vi.fn()
const findManyMock = vi.fn()
const agentBindingFindUniqueMock = vi.fn()
const categoryBindingFindUniqueMock = vi.fn()
const systemSettingFindUniqueMock = vi.fn()

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => ({
        model: {
          findUnique: findUniqueMock,
          findMany: findManyMock
        },
        agentBinding: {
          findUnique: agentBindingFindUniqueMock
        },
        categoryBinding: {
          findUnique: categoryBindingFindUniqueMock
        },
        systemSetting: {
          findUnique: systemSettingFindUniqueMock
        }
      })
    })
  }
}))

vi.mock('@/main/services/secure-storage.service', () => ({
  SecureStorageService: {
    getInstance: () => ({
      decrypt: (value: string) => value
    })
  }
}))

describe('ModelSelectionService protocol validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUniqueMock.mockReset()
    findManyMock.mockReset()
    agentBindingFindUniqueMock.mockReset()
    categoryBindingFindUniqueMock.mockReset()
    systemSettingFindUniqueMock.mockReset()
    systemSettingFindUniqueMock.mockResolvedValue(null)
    findUniqueMock.mockResolvedValue(null)
  })

  it('throws MODEL_PROTOCOL_NOT_CONFIGURED for openai-compatible model missing apiProtocol', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'model-1',
        provider: 'openai-compatible',
        modelName: 'gpt-4o-mini',
        apiKey: 'enc-key',
        apiKeyRef: null,
        baseURL: 'https://api.example.com/v1',
        config: {}
      }
    ])

    const service = ModelSelectionService.getInstance()

    await expect(
      service.resolveModelSelection({
        overrideModelSpec: 'openai-compatible/gpt-4o-mini'
      })
    ).rejects.toThrow('MODEL_PROTOCOL_NOT_CONFIGURED')
  })

  it('accepts openai-compatible model when apiProtocol is responses', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'model-2',
        provider: 'openai-compatible',
        modelName: 'gpt-4.1-mini',
        apiKey: 'enc-key',
        apiKeyRef: null,
        baseURL: 'https://api.example.com/v1',
        config: { apiProtocol: 'responses' }
      }
    ])

    const service = ModelSelectionService.getInstance()

    const result = await service.resolveModelSelection({
      overrideModelSpec: 'openai-compatible/gpt-4.1-mini'
    })

    expect(result.protocol).toBe('responses')
    expect(result.source).toBe('override')
    expect(result.provider).toBe('openai-compatible')
    expect(result.model).toBe('gpt-4.1-mini')
  })

  it('falls back to system-default when enabled category binding has empty modelId', async () => {
    categoryBindingFindUniqueMock.mockResolvedValue({
      enabled: true,
      modelId: null,
      model: null,
      temperature: null
    })
    systemSettingFindUniqueMock.mockResolvedValue({
      key: 'defaultModelId',
      value: 'model-default'
    })
    findUniqueMock.mockResolvedValue({
      id: 'model-default',
      provider: 'openai-compatible',
      modelName: 'gpt-4o-mini',
      apiKey: 'enc-key',
      apiKeyRef: null,
      baseURL: 'https://api.example.com/v1',
      config: { apiProtocol: 'responses' }
    })

    const service = ModelSelectionService.getInstance()

    const result = await service.resolveModelSelection({
      categoryCode: 'zhinv'
    })

    expect(result.source).toBe('system-default')
    expect(result.modelId).toBe('model-default')
    expect(result.model).toBe('gpt-4o-mini')
    expect(result.protocol).toBe('responses')
  })

  it('throws MODEL_NOT_FOUND when enabled category binding points to missing model', async () => {
    categoryBindingFindUniqueMock.mockResolvedValue({
      enabled: true,
      modelId: 'missing-model',
      model: null,
      temperature: null
    })

    const service = ModelSelectionService.getInstance()

    await expect(
      service.resolveModelSelection({
        categoryCode: 'zhinv'
      })
    ).rejects.toThrow('MODEL_NOT_FOUND')
  })
})

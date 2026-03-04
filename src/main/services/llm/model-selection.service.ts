import { SETTING_KEYS } from '@/main/services/settings/schema-registry'
import { DatabaseService } from '@/main/services/database'
import { SecureStorageService } from '@/main/services/secure-storage.service'
import type { LLMConfigApiProtocol } from './adapter.interface'

export type ModelSource =
  | 'override'
  | 'agent-binding'
  | 'category-binding'
  | 'system-default'

export interface ResolvedModelSelection {
  modelId: string
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  source: ModelSource
  temperature?: number
  protocol?: LLMConfigApiProtocol
  config?: Record<string, unknown>
}

interface ResolveModelSelectionInput {
  overrideModelSpec?: string
  agentCode?: string
  categoryCode?: string
  temperatureFallback?: number
}

const OPENAI_PROTOCOL_REQUIRED_PROVIDERS = new Set([
  'openai',
  'openai-compatible',
  'openai-compat',
  'custom',
  'azure-openai',
  'azure'
])

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase()
}

function parseOverrideModelSpec(spec: string): { provider?: string; modelName: string } {
  const trimmed = spec.trim()
  if (!trimmed) {
    throw new Error('MODEL_NOT_CONFIGURED: override model is empty')
  }

  const slashIndex = trimmed.indexOf('/')
  if (slashIndex <= 0) {
    return { modelName: trimmed }
  }

  return {
    provider: trimmed.slice(0, slashIndex).trim(),
    modelName: trimmed.slice(slashIndex + 1).trim()
  }
}

function readModelProtocol(model: { provider: string; config: unknown; modelName: string }):
  | LLMConfigApiProtocol
  | undefined {
  const provider = normalizeProvider(model.provider)
  if (!OPENAI_PROTOCOL_REQUIRED_PROVIDERS.has(provider)) {
    return undefined
  }

  const config = model.config && typeof model.config === 'object' ? (model.config as Record<string, unknown>) : {}
  const value = typeof config.apiProtocol === 'string' ? config.apiProtocol.trim() : ''
  if (value === 'chat/completions' || value === 'responses') {
    return value
  }

  throw new Error(
    `MODEL_PROTOCOL_NOT_CONFIGURED: 模型「${model.modelName}」缺少 apiProtocol 配置。` +
      '请在“设置 -> 模型”中为该模型设置协议（chat/completions 或 responses）。'
  )
}

export class ModelSelectionService {
  private static instance: ModelSelectionService
  private readonly prisma = DatabaseService.getInstance().getClient()
  private readonly secureStorage = SecureStorageService.getInstance()

  static getInstance(): ModelSelectionService {
    if (!ModelSelectionService.instance) {
      ModelSelectionService.instance = new ModelSelectionService()
    }
    return ModelSelectionService.instance
  }

  private decryptModelApiKey(model: {
    modelName: string
    apiKey: string | null
    apiKeyRef?: { encryptedKey: string; baseURL: string } | null
  }): string {
    const encrypted = model.apiKeyRef?.encryptedKey ?? model.apiKey
    if (!encrypted) {
      throw new Error(
        `MODEL_CREDENTIAL_MISSING: 模型「${model.modelName}」缺少 API Key。请在“设置 -> API Keys/模型”补全后重试。`
      )
    }

    const decrypted = this.secureStorage.decrypt(encrypted).trim()
    if (!decrypted) {
      throw new Error(
        `MODEL_CREDENTIAL_MISSING: 模型「${model.modelName}」缺少 API Key。请在“设置 -> API Keys/模型”补全后重试。`
      )
    }

    return decrypted
  }

  private toResolvedSelection(input: {
    model: {
      id: string
      provider: string
      modelName: string
      apiKey: string | null
      baseURL: string | null
      config: unknown
      apiKeyRef?: { encryptedKey: string; baseURL: string } | null
    }
    source: ModelSource
    temperature?: number
  }): ResolvedModelSelection {
    const { model, source, temperature } = input
    const apiKey = this.decryptModelApiKey(model)
    const protocol = readModelProtocol(model)

    return {
      modelId: model.id,
      provider: model.provider,
      model: model.modelName,
      apiKey,
      baseURL: model.apiKeyRef?.baseURL ?? model.baseURL ?? undefined,
      source,
      temperature,
      protocol,
      config: model.config && typeof model.config === 'object' ? (model.config as Record<string, unknown>) : {}
    }
  }

  private async resolveFromBinding(params: {
    kind: 'agent' | 'category'
    code: string
  }): Promise<ResolvedModelSelection | null> {
    if (params.kind === 'agent') {
      const binding = await this.prisma.agentBinding.findUnique({
        where: { agentCode: params.code },
        include: { model: { include: { apiKeyRef: true } } }
      })

      if (!binding?.enabled) return null
      if (binding.modelId && !binding.model) {
        throw new Error(
          `MODEL_NOT_FOUND: Agent「${params.code}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定”重新选择模型。`
        )
      }
      if (!binding.model) {
        return null
      }

      return this.toResolvedSelection({
        model: binding.model,
        source: 'agent-binding',
        temperature: binding.temperature
      })
    }

    const binding = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode: params.code },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding?.enabled) return null
    if (binding.modelId && !binding.model) {
      throw new Error(
        `MODEL_NOT_FOUND: 任务类别「${params.code}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定 -> 任务类别”重新选择模型。`
      )
    }
    if (!binding.model) {
      return null
    }

    return this.toResolvedSelection({
      model: binding.model,
      source: 'category-binding',
      temperature: binding.temperature
    })
  }

  private async resolveFromSystemDefault(
    temperatureFallback?: number
  ): Promise<ResolvedModelSelection | null> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.DEFAULT_MODEL_ID } })
    const modelId = setting?.value?.trim()
    if (!modelId) return null

    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      include: { apiKeyRef: true }
    })

    if (!model) {
      throw new Error(
        'MODEL_NOT_FOUND: 系统默认模型记录不存在。请在“设置 -> Agent 绑定”重新设置系统默认模型。'
      )
    }

    return this.toResolvedSelection({
      model,
      source: 'system-default',
      temperature: temperatureFallback
    })
  }

  private async resolveFromOverrideModelSpec(
    overrideModelSpec: string,
    temperatureFallback?: number
  ): Promise<ResolvedModelSelection> {
    const parsed = parseOverrideModelSpec(overrideModelSpec)

    const candidates = await this.prisma.model.findMany({
      where: parsed.provider
        ? {
            provider: { equals: parsed.provider, mode: 'insensitive' },
            modelName: parsed.modelName
          }
        : {
            modelName: parsed.modelName
          },
      include: { apiKeyRef: true },
      orderBy: { updatedAt: 'desc' }
    })

    if (!candidates.length) {
      throw new Error(
        `MODEL_NOT_FOUND: 未找到覆盖模型「${overrideModelSpec}」。请先在“设置 -> 模型”中创建该模型。`
      )
    }

    if (!parsed.provider) {
      const providers = Array.from(
        new Set(candidates.map((item: { provider: string }) => normalizeProvider(item.provider)))
      )
      if (providers.length > 1) {
        throw new Error(
          `MODEL_NOT_CONFIGURED: 覆盖模型「${parsed.modelName}」匹配到多个 provider（${providers.join(', ')}）。` +
            '请使用 provider/model 形式显式指定。'
        )
      }
    }

    const model = candidates[0]
    if (!model) {
      throw new Error(`MODEL_NOT_FOUND: 未找到覆盖模型「${overrideModelSpec}」。`)
    }

    return this.toResolvedSelection({
      model,
      source: 'override',
      temperature: temperatureFallback
    })
  }

  async resolveModelSelection(input: ResolveModelSelectionInput): Promise<ResolvedModelSelection> {
    const { overrideModelSpec, agentCode, categoryCode, temperatureFallback } = input

    if (overrideModelSpec?.trim()) {
      return this.resolveFromOverrideModelSpec(overrideModelSpec.trim(), temperatureFallback)
    }

    if (agentCode?.trim()) {
      const fromAgentBinding = await this.resolveFromBinding({
        kind: 'agent',
        code: agentCode.trim()
      })
      if (fromAgentBinding) return fromAgentBinding
    }

    if (categoryCode?.trim()) {
      const fromCategoryBinding = await this.resolveFromBinding({
        kind: 'category',
        code: categoryCode.trim()
      })
      if (fromCategoryBinding) return fromCategoryBinding
    }

    const fromSystemDefault = await this.resolveFromSystemDefault(temperatureFallback)
    if (fromSystemDefault) return fromSystemDefault

    throw new Error(
      'MODEL_NOT_CONFIGURED: 未配置可用模型。请在“设置 -> Agent 绑定”中为当前 Agent/任务类别绑定模型，或设置系统默认模型。'
    )
  }
}

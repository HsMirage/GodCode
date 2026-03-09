import { SETTING_KEYS } from '@/main/services/settings/schema-registry'
import { DatabaseService } from '@/main/services/database'
import { SecureStorageService } from '@/main/services/secure-storage.service'
import { getAgentByCode, getCategoryByCode } from '@/shared/agent-definitions'
import type {
  FallbackReason,
  ModelSelectionAttemptSummary,
  ModelSelectionReason,
  ModelSelectionSource,
  ModelSelectionTrace
} from '@/shared/model-selection-contract'
import type { LLMConfigApiProtocol } from './adapter.interface'
import {
  inferPreferredOpenAIProtocol,
  isOpenAIProtocolProvider,
  normalizeOpenAIProtocol
} from './openai-protocol'

export type { ModelSelectionSource as ModelSource } from '@/shared/model-selection-contract'

export interface ResolvedModelSelection {
  modelId: string
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  source: ModelSelectionSource
  modelSelectionSource: ModelSelectionSource
  modelSelectionReason: ModelSelectionReason
  modelSelectionSummary: string
  fallbackReason?: FallbackReason
  fallbackAttemptSummary: ModelSelectionAttemptSummary[]
  temperature?: number
  protocol?: LLMConfigApiProtocol
  config?: Record<string, unknown>
}

interface ResolvedModelSelectionCore {
  modelId: string
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  source: ModelSelectionSource
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

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase()
}

function resolveBindingDisplayName(kind: 'agent' | 'category', code: string): string {
  const definition = kind === 'agent' ? getAgentByCode(code) : getCategoryByCode(code)
  if (!definition) {
    return code
  }

  return `${definition.chineseName} / ${code}`
}

function isFallbackReason(value: string | undefined): value is FallbackReason {
  return [
    'override-not-requested',
    'binding-not-requested',
    'binding-not-configured',
    'binding-disabled',
    'binding-model-unset',
    'system-default-not-configured'
  ].includes(value || '')
}

function buildSelectedSummary(input: {
  source: ModelSelectionSource
  provider: string
  model: string
  bindingCode?: string
  bindingName?: string
}): string {
  const modelSpec = `${input.provider}/${input.model}`

  switch (input.source) {
    case 'override':
      return `命中显式覆盖模型 ${modelSpec}。`
    case 'agent-binding':
      return `命中 Agent 绑定（${input.bindingName || input.bindingCode || 'unknown'}），使用模型 ${modelSpec}。`
    case 'category-binding':
      return `命中类别绑定（${input.bindingName || input.bindingCode || 'unknown'}），使用模型 ${modelSpec}。`
    case 'system-default':
      return `命中系统默认模型 ${modelSpec}。`
  }
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
  if (!isOpenAIProtocolProvider(provider)) {
    return undefined
  }

  const config = model.config && typeof model.config === 'object' ? (model.config as Record<string, unknown>) : {}
  return normalizeOpenAIProtocol(config.apiProtocol) ?? inferPreferredOpenAIProtocol(provider)
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

  private toResolvedSelectionCore(input: {
    model: {
      id: string
      provider: string
      modelName: string
      apiKey: string | null
      baseURL: string | null
      config: unknown
      apiKeyRef?: { encryptedKey: string; baseURL: string } | null
    }
    source: ModelSelectionSource
    temperature?: number
  }): ResolvedModelSelectionCore {
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

  private attachSelectionTrace(
    selection: ResolvedModelSelectionCore,
    trace: Omit<ModelSelectionTrace, 'modelSelectionSource'> & { modelSelectionSource?: ModelSelectionSource }
  ): ResolvedModelSelection {
    return {
      ...selection,
      source: selection.source,
      modelSelectionSource: trace.modelSelectionSource || selection.source,
      modelSelectionReason: trace.modelSelectionReason,
      modelSelectionSummary: trace.modelSelectionSummary,
      fallbackReason: trace.fallbackReason,
      fallbackAttemptSummary: trace.fallbackAttemptSummary
    }
  }

  private async resolveFromBinding(params: {
    kind: 'agent' | 'category'
    code: string
  }): Promise<{ selection: ResolvedModelSelectionCore | null; attempt: ModelSelectionAttemptSummary }> {
    const bindingName = resolveBindingDisplayName(params.kind, params.code)

    if (params.kind === 'agent') {
      const binding = await this.prisma.agentBinding.findUnique({
        where: { agentCode: params.code },
        include: { model: { include: { apiKeyRef: true } } }
      })

      if (!binding) {
        return {
          selection: null,
          attempt: {
            source: 'agent-binding',
            status: 'fallback',
            reason: 'binding-not-configured',
            summary: `Agent 绑定（${bindingName}）未配置，继续回退。`,
            bindingCode: params.code,
            bindingName
          }
        }
      }

      if (!binding.enabled) {
        return {
          selection: null,
          attempt: {
            source: 'agent-binding',
            status: 'fallback',
            reason: 'binding-disabled',
            summary: `Agent 绑定（${bindingName}）已禁用，继续回退。`,
            bindingCode: params.code,
            bindingName
          }
        }
      }

      if (binding.modelId && !binding.model) {
        throw new Error(
          `MODEL_NOT_FOUND: Agent「${params.code}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定”重新选择模型。`
        )
      }
      if (!binding.model) {
        return {
          selection: null,
          attempt: {
            source: 'agent-binding',
            status: 'fallback',
            reason: 'binding-model-unset',
            summary: `Agent 绑定（${bindingName}）未设置模型，继续回退。`,
            bindingCode: params.code,
            bindingName
          }
        }
      }

      const selection = this.toResolvedSelectionCore({
        model: binding.model,
        source: 'agent-binding',
        temperature: binding.temperature
      })

      return {
        selection,
        attempt: {
          source: 'agent-binding',
          status: 'selected',
          reason: 'agent-binding-hit',
          summary: buildSelectedSummary({
            source: 'agent-binding',
            provider: selection.provider,
            model: selection.model,
            bindingCode: params.code,
            bindingName
          }),
          bindingCode: params.code,
          bindingName,
          modelId: selection.modelId,
          modelName: selection.model,
          provider: selection.provider
        }
      }
    }

    const binding = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode: params.code },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding) {
      return {
        selection: null,
        attempt: {
          source: 'category-binding',
          status: 'fallback',
          reason: 'binding-not-configured',
          summary: `类别绑定（${bindingName}）未配置，继续回退。`,
          bindingCode: params.code,
          bindingName
        }
      }
    }

    if (!binding.enabled) {
      return {
        selection: null,
        attempt: {
          source: 'category-binding',
          status: 'fallback',
          reason: 'binding-disabled',
          summary: `类别绑定（${bindingName}）已禁用，继续回退。`,
          bindingCode: params.code,
          bindingName
        }
      }
    }

    if (binding.modelId && !binding.model) {
      throw new Error(
        `MODEL_NOT_FOUND: 任务类别「${params.code}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定 -> 任务类别”重新选择模型。`
      )
    }
    if (!binding.model) {
      return {
        selection: null,
        attempt: {
          source: 'category-binding',
          status: 'fallback',
          reason: 'binding-model-unset',
          summary: `类别绑定（${bindingName}）未设置模型，继续回退。`,
          bindingCode: params.code,
          bindingName
        }
      }
    }

    const selection = this.toResolvedSelectionCore({
      model: binding.model,
      source: 'category-binding',
      temperature: binding.temperature
    })

    return {
      selection,
      attempt: {
        source: 'category-binding',
        status: 'selected',
        reason: 'category-binding-hit',
        summary: buildSelectedSummary({
          source: 'category-binding',
          provider: selection.provider,
          model: selection.model,
          bindingCode: params.code,
          bindingName
        }),
        bindingCode: params.code,
        bindingName,
        modelId: selection.modelId,
        modelName: selection.model,
        provider: selection.provider
      }
    }
  }

  private async resolveFromSystemDefault(
    temperatureFallback?: number
  ): Promise<ResolvedModelSelectionCore | null> {
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

    return this.toResolvedSelectionCore({
      model,
      source: 'system-default',
      temperature: temperatureFallback
    })
  }

  private async resolveFromOverrideModelSpec(
    overrideModelSpec: string,
    temperatureFallback?: number
  ): Promise<ResolvedModelSelectionCore> {
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

    return this.toResolvedSelectionCore({
      model,
      source: 'override',
      temperature: temperatureFallback
    })
  }

  async resolveModelSelection(input: ResolveModelSelectionInput): Promise<ResolvedModelSelection> {
    const { overrideModelSpec, agentCode, categoryCode, temperatureFallback } = input
    const attempts: ModelSelectionAttemptSummary[] = []

    if (overrideModelSpec?.trim()) {
      const selection = await this.resolveFromOverrideModelSpec(overrideModelSpec.trim(), temperatureFallback)

      return this.attachSelectionTrace(selection, {
        modelSelectionSource: 'override',
        modelSelectionReason: 'explicit-override',
        modelSelectionSummary: buildSelectedSummary({
          source: 'override',
          provider: selection.provider,
          model: selection.model
        }),
        fallbackAttemptSummary: []
      })
    }

    attempts.push({
      source: 'override',
      status: 'skipped',
      reason: 'override-not-requested',
      summary: '未提供覆盖模型，继续检查绑定。'
    })

    if (agentCode?.trim()) {
      const fromAgentBinding = await this.resolveFromBinding({
        kind: 'agent',
        code: agentCode.trim()
      })
      if (fromAgentBinding.selection) {
        return this.attachSelectionTrace(fromAgentBinding.selection, {
          modelSelectionSource: 'agent-binding',
          modelSelectionReason: 'agent-binding-hit',
          modelSelectionSummary: fromAgentBinding.attempt.summary,
          fallbackReason: attempts
            .map(item => (item.status === 'fallback' && isFallbackReason(item.reason) ? item.reason : undefined))
            .filter((value): value is FallbackReason => Boolean(value))
            .at(-1),
          fallbackAttemptSummary: attempts
        })
      }
      attempts.push(fromAgentBinding.attempt)
    } else {
      attempts.push({
        source: 'agent-binding',
        status: 'skipped',
        reason: 'binding-not-requested',
        summary: '未提供 Agent code，跳过 Agent 绑定。'
      })
    }

    if (categoryCode?.trim()) {
      const fromCategoryBinding = await this.resolveFromBinding({
        kind: 'category',
        code: categoryCode.trim()
      })
      if (fromCategoryBinding.selection) {
        return this.attachSelectionTrace(fromCategoryBinding.selection, {
          modelSelectionSource: 'category-binding',
          modelSelectionReason: 'category-binding-hit',
          modelSelectionSummary: fromCategoryBinding.attempt.summary,
          fallbackReason: attempts
            .map(item => (item.status === 'fallback' && isFallbackReason(item.reason) ? item.reason : undefined))
            .filter((value): value is FallbackReason => Boolean(value))
            .at(-1),
          fallbackAttemptSummary: attempts
        })
      }
      attempts.push(fromCategoryBinding.attempt)
    } else {
      attempts.push({
        source: 'category-binding',
        status: 'skipped',
        reason: 'binding-not-requested',
        summary: '未提供类别 code，跳过类别绑定。'
      })
    }

    const fromSystemDefault = await this.resolveFromSystemDefault(temperatureFallback)
    if (fromSystemDefault) {
      const fallbackReason = attempts
        .map(item => (item.status === 'fallback' && isFallbackReason(item.reason) ? item.reason : undefined))
        .filter((value): value is FallbackReason => Boolean(value))
        .at(-1)

      return this.attachSelectionTrace(fromSystemDefault, {
        modelSelectionSource: 'system-default',
        modelSelectionReason: 'system-default-hit',
        modelSelectionSummary: buildSelectedSummary({
          source: 'system-default',
          provider: fromSystemDefault.provider,
          model: fromSystemDefault.model
        }),
        fallbackReason,
        fallbackAttemptSummary: attempts
      })
    }

    attempts.push({
      source: 'system-default',
      status: 'fallback',
      reason: 'system-default-not-configured',
      summary: '系统默认模型未配置，模型选择失败。'
    })

    throw new Error(
      'MODEL_NOT_CONFIGURED: 未配置可用模型。请在“设置 -> Agent 绑定”中为当前 Agent/任务类别绑定模型，或设置系统默认模型。'
    )
  }
}

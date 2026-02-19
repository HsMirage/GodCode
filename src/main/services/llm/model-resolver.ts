/**
 * Model Resolver with Fallback Chain
 * Inspired by oh-my-opencode v3.1.7
 *
 * Provides 3-step model resolution:
 * 1. UI Selection (highest priority)
 * 2. Provider fallback chain (with availability check)
 * 3. System default
 */

import { logger } from '../../../shared/logger'

export interface FallbackEntry {
  model: string
  providers: string[]
  variant?: string
}

export type ModelSource = 'override' | 'provider-fallback' | 'system-default'

export interface ModelResolutionResult {
  model: string
  provider: string
  source: ModelSource
  variant?: string
}

export interface ModelResolutionInput {
  userModel?: string
  fallbackChain?: FallbackEntry[]
  availableModels: Set<string>
  systemDefaultModel?: string
}

function splitProviderAndModel(value: string): { provider: string; model: string } {
  const parts = value.split('/')
  if (parts.length < 2) {
    return {
      provider: 'unknown',
      model: value
    }
  }

  return {
    provider: parts[0] || 'unknown',
    model: parts.slice(1).join('/')
  }
}

function parseMatchedModel(
  matched: string,
  providerHint?: string
): { provider: string; model: string } {
  if (matched.includes('/')) {
    return splitProviderAndModel(matched)
  }

  return {
    provider: providerHint || 'unknown',
    model: matched
  }
}

function normalizeModel(model?: string): string | undefined {
  const trimmed = model?.trim()
  return trimmed || undefined
}

/**
 * Fuzzy match a model name against available models
 * Handles cases like "gpt-4" matching "gpt-4-turbo-preview"
 */
export function fuzzyMatchModel(
  modelName: string,
  availableModels: Set<string>,
  providers?: string[]
): string | null {
  // Exact match first
  if (availableModels.has(modelName)) {
    return modelName
  }

  // Try with provider prefix
  if (providers) {
    for (const provider of providers) {
      const fullName = `${provider}/${modelName}`
      if (availableModels.has(fullName)) {
        return fullName
      }
    }
  }

  // Fuzzy match - find models that start with the given name
  for (const available of availableModels) {
    const modelPart = available.includes('/') ? available.split('/')[1] : available
    if (modelPart?.startsWith(modelName) || modelName.startsWith(modelPart ?? '')) {
      return available
    }
  }

  return null
}

/**
 * Resolve model with fallback chain
 * Priority: userModel → fallbackChain → systemDefault
 */
export function resolveModelWithFallback(
  input: ModelResolutionInput
): ModelResolutionResult | null {
  const { userModel, fallbackChain, availableModels, systemDefaultModel } = input

  // Step 1: User override (highest priority)
  const normalizedUserModel = normalizeModel(userModel)
  if (normalizedUserModel) {
    const parts = normalizedUserModel.split('/')
    const provider = parts.length > 1 ? parts[0] : 'unknown'
    const model = parts.length > 1 ? parts.slice(1).join('/') : normalizedUserModel

    logger.info('[ModelResolver] Model resolved via user override', { model: normalizedUserModel })
    return {
      model,
      provider,
      source: 'override'
    }
  }

  // Step 2: Provider fallback chain (with availability check)
  if (fallbackChain && fallbackChain.length > 0) {
    for (const entry of fallbackChain) {
      for (const provider of entry.providers) {
        const fullModel = `${provider}/${entry.model}`
        const match =
          fuzzyMatchModel(fullModel, availableModels, [provider]) ||
          fuzzyMatchModel(entry.model, availableModels, [provider])
        if (match) {
          const resolved = parseMatchedModel(match, provider)
          logger.info('[ModelResolver] Model resolved via fallback chain', {
            provider: resolved.provider,
            model: entry.model,
            match,
            variant: entry.variant
          })
          return {
            model: resolved.model,
            provider: resolved.provider,
            source: 'provider-fallback',
            variant: entry.variant
          }
        }
      }
    }
    logger.info(
      '[ModelResolver] No available model found in fallback chain, falling through to system default'
    )
  }

  // Step 3: System default (if provided)
  if (!systemDefaultModel) {
    logger.warn('[ModelResolver] No model resolved - systemDefaultModel not configured')
    return null
  }

  const normalizedSystemDefault = normalizeModel(systemDefaultModel)
  if (!normalizedSystemDefault) {
    logger.warn('[ModelResolver] No model resolved - systemDefaultModel is empty')
    return null
  }

  let provider: string
  let model: string

  if (normalizedSystemDefault.includes('/')) {
    const parsed = splitProviderAndModel(normalizedSystemDefault)
    provider = parsed.provider
    model = parsed.model
  } else {
    const matched = fuzzyMatchModel(normalizedSystemDefault, availableModels)
    if (matched) {
      const parsed = parseMatchedModel(matched)
      provider = parsed.provider
      model = parsed.model
    } else {
      provider = fallbackChain?.[0]?.providers?.[0] || 'openai-compatible'
      model = normalizedSystemDefault
    }
  }

  logger.info('[ModelResolver] Model resolved via system default', { model: systemDefaultModel })
  return {
    model,
    provider,
    source: 'system-default'
  }
}

/**
 * Default fallback chains for different use cases
 */
export const DEFAULT_FALLBACK_CHAINS = {
  // Primary orchestrator - needs best reasoning
  orchestrator: [
    { model: 'claude-3-5-sonnet-20241022', providers: ['openai-compatible'] },
    { model: 'gpt-4o', providers: ['openai-compatible'] }
  ],
  // Fast tasks - prioritize speed
  quick: [
    { model: 'gpt-4o-mini', providers: ['openai-compatible'] },
    { model: 'claude-3-haiku-20240307', providers: ['openai-compatible'] }
  ],
  // Visual/frontend tasks
  visual: [
    { model: 'gpt-4o', providers: ['openai-compatible'] },
    { model: 'claude-3-5-sonnet-20241022', providers: ['openai-compatible'] }
  ],
  // Code generation
  coding: [
    { model: 'claude-3-5-sonnet-20241022', providers: ['openai-compatible'] },
    { model: 'gpt-4o', providers: ['openai-compatible'] }
  ]
} as const

/**
 * 将 AgentDefinition 或 CategoryDefinition 的 fallbackModels 转换为 FallbackEntry[] 格式
 */
function toFallbackEntries(
  fallbackModels: Array<{ model: string; provider: string }>
): FallbackEntry[] {
  return fallbackModels.map((entry) => ({
    model: entry.model,
    providers: [entry.provider, 'openai-compatible']
  }))
}

/**
 * 为 Agent 解析模型，结合 UI 选择和 Agent 自身的 fallback chain
 *
 * - 如果 Agent mode 为 'primary'，会尊重 userModel（UI 选择）
 * - 如果 Agent mode 为 'subagent'，忽略 userModel 直接使用自身 fallback chain
 */
export function resolveModelForAgent(
  agentDef: {
    mode: 'primary' | 'subagent'
    defaultModel: string
    fallbackModels: Array<{ model: string; provider: string }>
  },
  availableModels: Set<string>,
  userModel?: string
): ModelResolutionResult | null {
  const fallbackChain = toFallbackEntries(agentDef.fallbackModels)
  const effectiveUserModel = agentDef.mode === 'primary' ? userModel : undefined

  return resolveModelWithFallback({
    userModel: effectiveUserModel,
    fallbackChain,
    availableModels,
    systemDefaultModel: agentDef.defaultModel
  })
}

/**
 * 为 Category 解析模型，使用 Category 的 fallback chain
 */
export function resolveModelForCategory(
  categoryDef: {
    defaultModel: string
    fallbackModels: Array<{ model: string; provider: string }>
  },
  availableModels: Set<string>,
  userModel?: string
): ModelResolutionResult | null {
  const fallbackChain = toFallbackEntries(categoryDef.fallbackModels)

  return resolveModelWithFallback({
    userModel,
    fallbackChain,
    availableModels,
    systemDefaultModel: categoryDef.defaultModel
  })
}

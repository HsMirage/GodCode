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
        const match = fuzzyMatchModel(fullModel, availableModels, [provider])
        if (match) {
          logger.info('[ModelResolver] Model resolved via fallback chain', {
            provider,
            model: entry.model,
            match,
            variant: entry.variant
          })
          return {
            model: entry.model,
            provider,
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

  const parts = systemDefaultModel.split('/')
  const provider = parts.length > 1 ? parts[0] : 'unknown'
  const model = parts.length > 1 ? parts.slice(1).join('/') : systemDefaultModel

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
    { model: 'claude-3-opus-20240229', providers: ['anthropic'] },
    { model: 'gpt-4-turbo-preview', providers: ['openai'] },
    { model: 'gemini-1.5-pro', providers: ['google'] }
  ],
  // Fast tasks - prioritize speed
  quick: [
    { model: 'gpt-4o-mini', providers: ['openai'] },
    { model: 'claude-3-haiku-20240307', providers: ['anthropic'] },
    { model: 'gemini-1.5-flash', providers: ['google'] }
  ],
  // Visual/frontend tasks
  visual: [
    { model: 'gemini-1.5-pro', providers: ['google'] },
    { model: 'gpt-4-turbo-preview', providers: ['openai'] },
    { model: 'claude-3-sonnet-20240229', providers: ['anthropic'] }
  ],
  // Code generation
  coding: [
    { model: 'claude-3-5-sonnet-20241022', providers: ['anthropic'] },
    { model: 'gpt-4-turbo-preview', providers: ['openai'] },
    { model: 'gemini-1.5-pro', providers: ['google'] }
  ]
} as const

import type { LLMConfig } from './adapter.interface'
import {
  GODCODE_LLM_BASE_DELAY_MS_ENV,
  GODCODE_LLM_DEFAULT_MAX_TOKENS_ENV,
  GODCODE_LLM_MAX_RETRIES_ENV,
  GODCODE_LLM_MAX_TOOL_ITERATIONS_ENV,
  GODCODE_LLM_TIMEOUT_MS_ENV,
  LEGACY_CODEALL_LLM_BASE_DELAY_MS_ENV,
  LEGACY_CODEALL_LLM_DEFAULT_MAX_TOKENS_ENV,
  LEGACY_CODEALL_LLM_MAX_RETRIES_ENV,
  LEGACY_CODEALL_LLM_MAX_TOOL_ITERATIONS_ENV,
  LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV,
  readCompatibleEnvValue
} from '@/shared/brand-compat'

export type ResolvedLLMRuntimeConfig = {
  maxRetries: number
  baseDelayMs: number
  timeoutMs: number
  maxToolIterations: number
  defaultMaxTokens: number
}

function toInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return undefined
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function envInt(primaryName: string, legacyName: string): number | undefined {
  return toInt(readCompatibleEnvValue(process.env, primaryName, legacyName))
}

/**
 * Resolve runtime config from (highest -> lowest priority):
 * 1) LLMConfig fields (typically from Model.config)
 * 2) Environment variables
 * 3) Built-in defaults
 */
export function resolveLLMRuntimeConfig(config: LLMConfig): ResolvedLLMRuntimeConfig {
  const maxRetries = clampInt(
    toInt(config.maxRetries) ??
      envInt(GODCODE_LLM_MAX_RETRIES_ENV, LEGACY_CODEALL_LLM_MAX_RETRIES_ENV) ??
      3,
    0,
    10
  )
  const baseDelayMs = clampInt(
    toInt(config.baseDelayMs) ??
      envInt(GODCODE_LLM_BASE_DELAY_MS_ENV, LEGACY_CODEALL_LLM_BASE_DELAY_MS_ENV) ??
      1000,
    0,
    60000
  )
  const timeoutMs = clampInt(
    // Backward compatible: some stored configs use `timeout` instead of `timeoutMs`.
    toInt(config.timeoutMs) ??
      toInt((config as unknown as { timeout?: unknown }).timeout) ??
      envInt(GODCODE_LLM_TIMEOUT_MS_ENV, LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV) ??
      300_000,
    1000,
    10 * 60 * 1000
  )
  const maxToolIterations = clampInt(
    toInt(config.maxToolIterations) ??
      envInt(GODCODE_LLM_MAX_TOOL_ITERATIONS_ENV, LEGACY_CODEALL_LLM_MAX_TOOL_ITERATIONS_ENV) ??
      100,
    1,
    1000
  )
  const defaultMaxTokens = clampInt(
    toInt(config.defaultMaxTokens) ??
      envInt(GODCODE_LLM_DEFAULT_MAX_TOKENS_ENV, LEGACY_CODEALL_LLM_DEFAULT_MAX_TOKENS_ENV) ??
      8192,
    1,
    200000
  )

  return {
    maxRetries,
    baseDelayMs,
    timeoutMs,
    maxToolIterations,
    defaultMaxTokens
  }
}

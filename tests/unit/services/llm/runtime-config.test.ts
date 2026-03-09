import { afterEach, describe, expect, it } from 'vitest'
import {
  GODCODE_LLM_TIMEOUT_MS_ENV,
  LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV
} from '@/shared/brand-compat'
import { resolveLLMRuntimeConfig } from '@/main/services/llm/runtime-config'

const ORIGINAL_TIMEOUT_ENV = process.env[GODCODE_LLM_TIMEOUT_MS_ENV]
const ORIGINAL_LEGACY_TIMEOUT_ENV = process.env[LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV]

describe('resolveLLMRuntimeConfig', () => {
  afterEach(() => {
    if (ORIGINAL_TIMEOUT_ENV === undefined) {
      delete process.env[GODCODE_LLM_TIMEOUT_MS_ENV]
    } else {
      process.env[GODCODE_LLM_TIMEOUT_MS_ENV] = ORIGINAL_TIMEOUT_ENV
    }

    if (ORIGINAL_LEGACY_TIMEOUT_ENV === undefined) {
      delete process.env[LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV]
    } else {
      process.env[LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV] = ORIGINAL_LEGACY_TIMEOUT_ENV
    }
  })

  it('uses a longer default timeout for uncapped real model requests', () => {
    delete process.env[GODCODE_LLM_TIMEOUT_MS_ENV]
    delete process.env[LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV]

    expect(resolveLLMRuntimeConfig({}).timeoutMs).toBe(300_000)
  })

  it('honors explicit timeout overrides from model config', () => {
    delete process.env[GODCODE_LLM_TIMEOUT_MS_ENV]
    delete process.env[LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV]

    expect(resolveLLMRuntimeConfig({ timeoutMs: 45_000 }).timeoutMs).toBe(45_000)
  })

  it('honors environment timeout overrides', () => {
    process.env[GODCODE_LLM_TIMEOUT_MS_ENV] = '120000'

    expect(resolveLLMRuntimeConfig({}).timeoutMs).toBe(120_000)
  })

  it('falls back to legacy environment timeout overrides', () => {
    delete process.env[GODCODE_LLM_TIMEOUT_MS_ENV]
    process.env[LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV] = '90000'

    expect(resolveLLMRuntimeConfig({}).timeoutMs).toBe(90_000)
  })
})

export const GODCODE_PACKAGE_NAME = 'godcode'
export const LEGACY_CODEALL_PACKAGE_NAME = 'codeall'

export const GODCODE_DISPLAY_NAME = 'GodCode'
export const LEGACY_CODEALL_DISPLAY_NAME = 'CodeAll'

export const GODCODE_RUNTIME_NAMESPACE = 'godcode'
export const LEGACY_CODEALL_RUNTIME_NAMESPACE = 'codeall'

export const GODCODE_UI_STORAGE_KEY = 'godcode-ui-storage'
export const LEGACY_CODEALL_UI_STORAGE_KEY = 'codeall-ui-storage'

export const GODCODE_DATA_STORAGE_KEY = 'godcode:data-store'
export const LEGACY_CODEALL_DATA_STORAGE_KEY = 'codeall:data-store'

export const GODCODE_CHAT_SCROLL_PREFIX = 'godcode:chat-scroll:'
export const LEGACY_CODEALL_CHAT_SCROLL_PREFIX = 'codeall:chat-scroll:'

export const GODCODE_TASK_READINESS_HISTORY_KEY = 'godcode.task-readiness.dashboard.history'
export const LEGACY_CODEALL_TASK_READINESS_HISTORY_KEY = 'codeall.task-readiness.dashboard.history'

export const GODCODE_KEYCHAIN_SERVICE = 'godcode-app'
export const LEGACY_CODEALL_KEYCHAIN_SERVICE = 'codeall-app'

export const GODCODE_WORKSPACE_DIR = '.godcode'
export const LEGACY_CODEALL_WORKSPACE_DIR = '.codeall'

export const GODCODE_DEFAULT_PLAN_NAME = 'godcode-unified-plan'
export const LEGACY_CODEALL_DEFAULT_PLAN_NAME = 'codeall-unified-plan'

export const GODCODE_E2E_TEST_ENV = 'GODCODE_E2E_TEST'
export const LEGACY_CODEALL_E2E_TEST_ENV = 'CODEALL_E2E_TEST'

export const GODCODE_E2E_SPACE_DIR_ENV = 'GODCODE_E2E_SPACE_DIR'
export const LEGACY_CODEALL_E2E_SPACE_DIR_ENV = 'CODEALL_E2E_SPACE_DIR'

export const GODCODE_ALLOW_CHROMIUM_NOISE_ENV = 'GODCODE_ALLOW_CHROMIUM_NOISE'
export const LEGACY_CODEALL_ALLOW_CHROMIUM_NOISE_ENV = 'CODEALL_ALLOW_CHROMIUM_NOISE'

export const GODCODE_LLM_MAX_RETRIES_ENV = 'GODCODE_LLM_MAX_RETRIES'
export const LEGACY_CODEALL_LLM_MAX_RETRIES_ENV = 'CODEALL_LLM_MAX_RETRIES'

export const GODCODE_LLM_BASE_DELAY_MS_ENV = 'GODCODE_LLM_BASE_DELAY_MS'
export const LEGACY_CODEALL_LLM_BASE_DELAY_MS_ENV = 'CODEALL_LLM_BASE_DELAY_MS'

export const GODCODE_LLM_TIMEOUT_MS_ENV = 'GODCODE_LLM_TIMEOUT_MS'
export const LEGACY_CODEALL_LLM_TIMEOUT_MS_ENV = 'CODEALL_LLM_TIMEOUT_MS'

export const GODCODE_LLM_MAX_TOOL_ITERATIONS_ENV = 'GODCODE_LLM_MAX_TOOL_ITERATIONS'
export const LEGACY_CODEALL_LLM_MAX_TOOL_ITERATIONS_ENV = 'CODEALL_LLM_MAX_TOOL_ITERATIONS'

export const GODCODE_LLM_DEFAULT_MAX_TOKENS_ENV = 'GODCODE_LLM_DEFAULT_MAX_TOKENS'
export const LEGACY_CODEALL_LLM_DEFAULT_MAX_TOKENS_ENV = 'CODEALL_LLM_DEFAULT_MAX_TOKENS'

export const GODCODE_APP_ID = 'com.godcode.app'
export const LEGACY_CODEALL_APP_ID = 'com.codeall.app'

export const LEGACY_USER_DATA_DIR_NAMES = ['CodeAll', 'codeall'] as const

export function readCompatibleEnvValue(
  env: Record<string, string | undefined>,
  primaryName: string,
  legacyName: string
): string | undefined {
  const primaryValue = env[primaryName]
  if (typeof primaryValue === 'string' && primaryValue.trim() !== '') {
    return primaryValue
  }

  const legacyValue = env[legacyName]
  if (typeof legacyValue === 'string' && legacyValue.trim() !== '') {
    return legacyValue
  }

  return undefined
}

export function isCompatibleEnvEnabled(
  env: Record<string, string | undefined>,
  primaryName: string,
  legacyName: string
): boolean {
  return readCompatibleEnvValue(env, primaryName, legacyName) === '1'
}

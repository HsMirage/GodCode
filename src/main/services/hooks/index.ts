/**
 * Hook 生命周期框架
 *
 * 提供可扩展的 Hook 系统，支持：
 * - onToolStart: 工具执行开始前
 * - onToolEnd: 工具执行结束后
 * - onMessageCreate: 消息创建时
 * - onContextOverflow: 上下文窗口溢出时
 * - onEditError: 编辑工具错误时
 * - onTaskLifecycle: 任务/工作流生命周期事件
 */

// 类型导出
export type {
  HookEventType,
  TaskLifecycleStatus,
  HookContext,
  ToolExecutionInput,
  ToolExecutionOutput,
  MessageInfo,
  ContextOverflowInfo,
  EditErrorInfo,
  TaskLifecycleInfo,
  OnToolStartCallback,
  OnToolEndCallback,
  OnMessageCreateCallback,
  OnContextOverflowCallback,
  OnEditErrorCallback,
  OnTaskLifecycleCallback,
  HookCallbackMap,
  HookConfig,
  RegisteredHook,
  HookFactoryInput,
  HookFactory,
  HookExecutionStatus,
  HookExecutionResult,
  EventEmitResult,
  HookExecutionAuditRecord
} from './types'

// Hook 管理器
export { HookManager, hookManager } from './manager'

// 内置 Hooks
export {
  createContextWindowMonitorHook,
  getContextLimit,
  calculateContextUsage,
  clearSessionReminder,
  clearAllReminders
} from './context-window-monitor'

export {
  createEditErrorRecoveryHook,
  createEditErrorRecoveryToolHook,
  parseEditError,
  EDIT_ERROR_PATTERNS,
  EDIT_ERROR_REMINDERS
} from './edit-error-recovery'

export {
  createToolOutputTruncatorHook,
  estimateTokens,
  truncateToTokens,
  smartTruncate
} from './tool-output-truncator'

export { createRulesInjectorHook } from './rules-injector.hook'

export {
  createTodoContinuationHooks,
  createTodoContinuationToolHook,
  createTodoContinuationMessageHook,
  clearTodoContinuationReminder
} from './todo-continuation.hook'

export { createStopSignalHook, isStopSignalRequested, resetStopSignal } from './stop-signal.hook'

// Claude Code 兼容层
export {
  loadClaudeCodeHooks,
  ClaudeCodeConfigLoader,
  ClaudeCodeAdapter,
  createAdapter,
  mergeConfigs,
  expandEnvVariables,
  expandCommandEnv
} from './claude-code'

export type {
  ClaudeCodeHookEvent,
  ClaudeCodeHooksConfig,
  ClaudeCodeMatcherGroup,
  ClaudeCodeHookHandler
} from './claude-code'

// 注册默认 Hooks
import { hookManager } from './manager'
import type { HookExecutionAuditRecord } from './types'
import { createContextWindowMonitorHook } from './context-window-monitor'
import { createEditErrorRecoveryToolHook } from './edit-error-recovery'
import { createToolOutputTruncatorHook } from './tool-output-truncator'
import { createRulesInjectorHook } from './rules-injector.hook'
import { createTodoContinuationHooks } from './todo-continuation.hook'
import { createStopSignalHook } from './stop-signal.hook'
import { loadClaudeCodeHooks } from './claude-code'
import { logger } from '../../../shared/logger'
import { DatabaseService } from '../database'
import { SETTING_KEYS } from '@/main/services/settings/schema-registry'

/**
 * 初始化默认 Hooks
 */
export function initializeDefaultHooks(): void {
  hookManager.register(createRulesInjectorHook())
  hookManager.registerMany(createTodoContinuationHooks())
  hookManager.register(createContextWindowMonitorHook())
  hookManager.register(createEditErrorRecoveryToolHook())
  hookManager.register(createToolOutputTruncatorHook())
  hookManager.register(createStopSignalHook())
}

/**
 * 初始化 Claude Code 兼容 Hooks
 */
export async function initializeClaudeCodeHooks(
  projectDir: string,
  sessionId: string
): Promise<void> {
  try {
    const hooks = await loadClaudeCodeHooks(projectDir, sessionId)
    if (hooks.length > 0) {
      hookManager.registerMany(hooks)
      logger.info(`Loaded ${hooks.length} Claude Code hooks from ${projectDir}`)
    }
  } catch (error) {
    logger.warn('Failed to load Claude Code hooks:', error)
  }
}

/**
 * 初始化所有 Hooks（默认 + Claude Code）
 */
export async function initializeAllHooks(projectDir?: string, sessionId?: string): Promise<void> {
  // 初始化默认 hooks
  initializeDefaultHooks()

  // 如果提供了项目目录，加载 Claude Code hooks
  if (projectDir && sessionId) {
    await initializeClaudeCodeHooks(projectDir, sessionId)
  }
}

/**
 * 获取 Hook 系统状态
 */
export interface HookGovernanceItem {
  id: string
  name: string
  event: string
  enabled: boolean
  priority: number
  executionCount: number
  errorCount: number
}

export interface HookGovernanceStatus {
  initialized: boolean
  stats: ReturnType<typeof hookManager.getStats>
  hooks: HookGovernanceItem[]
  recentExecutions: HookExecutionAuditRecord[]
}

export interface HookGovernanceUpdateItem {
  id: string
  enabled?: boolean
  priority?: number
}

export interface HookGovernanceUpdateInput {
  hooks: HookGovernanceUpdateItem[]
}

export interface HookGovernanceUpdateResult {
  success: boolean
  updated: string[]
  skipped: Array<{ id: string; reason: string }>
  status: HookGovernanceStatus
}

const HOOK_GOVERNANCE_SETTING_KEY = SETTING_KEYS.HOOK_GOVERNANCE_CONFIG

function normalizePriority(value: number): number {
  if (!Number.isFinite(value)) {
    return 100
  }
  return Math.max(1, Math.floor(value))
}

function normalizeHookGovernanceSnapshot(hooks: Array<{ id: string; enabled: boolean; priority: number }>) {
  const normalized = hooks.map(hook => ({
    id: hook.id,
    enabled: Boolean(hook.enabled),
    priority: normalizePriority(hook.priority)
  }))

  normalized.sort((a, b) => a.id.localeCompare(b.id))
  return normalized
}

function buildPersistableHookGovernanceConfig() {
  const hooks = hookManager.getAll().map(h => ({
    id: h.id,
    enabled: h.enabled ?? true,
    priority: h.priority ?? 100
  }))

  return {
    version: 1,
    hooks: normalizeHookGovernanceSnapshot(hooks)
  }
}

async function persistHookGovernanceConfig(): Promise<void> {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const payload = buildPersistableHookGovernanceConfig()
  await prisma.systemSetting.upsert({
    where: { key: HOOK_GOVERNANCE_SETTING_KEY },
    update: { value: JSON.stringify(payload) },
    create: { key: HOOK_GOVERNANCE_SETTING_KEY, value: JSON.stringify(payload) }
  })
}

async function loadPersistedHookGovernanceConfig(): Promise<
  | {
      hooks: Array<{ id: string; enabled?: boolean; priority?: number }>
    }
  | null
> {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const setting = await prisma.systemSetting.findUnique({
    where: { key: HOOK_GOVERNANCE_SETTING_KEY }
  })

  if (!setting?.value) {
    return null
  }

  try {
    const parsed = JSON.parse(setting.value) as {
      hooks?: Array<{ id: string; enabled?: boolean; priority?: number }>
    }

    if (!Array.isArray(parsed.hooks)) {
      return null
    }

    return {
      hooks: parsed.hooks.filter(hook => typeof hook?.id === 'string' && hook.id.length > 0)
    }
  } catch (error) {
    logger.warn('Failed to parse persisted hook governance config:', error)
    return null
  }
}

function applyHookGovernanceUpdateInMemory(
  input: HookGovernanceUpdateInput,
  allowUnknown = false
): { updated: string[]; skipped: Array<{ id: string; reason: string }> } {
  const updated: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []

  for (const item of input.hooks) {
    const hook = hookManager.get(item.id)
    if (!hook) {
      if (allowUnknown) {
        skipped.push({ id: item.id, reason: 'hook_not_found' })
      }
      continue
    }

    let changed = false

    if (typeof item.enabled === 'boolean') {
      if (item.enabled) {
        hookManager.enable(item.id)
      } else {
        hookManager.disable(item.id)
      }
      changed = true
    }

    if (typeof item.priority === 'number') {
      hook.priority = normalizePriority(item.priority)
      changed = true
    }

    if (changed) {
      updated.push(item.id)
    }
  }

  return { updated, skipped }
}

/**
 * 获取 Hook 系统状态
 */
export function getHookSystemStatus(): HookGovernanceStatus {
  const stats = hookManager.getStats()
  const hooks: HookGovernanceItem[] = hookManager.getAll().map(h => ({
    id: h.id,
    name: h.name,
    event: h.event,
    enabled: h.enabled ?? true,
    priority: h.priority ?? 100,
    executionCount: h.executionCount,
    errorCount: h.errorCount
  }))

  return {
    initialized: stats.total > 0,
    stats,
    hooks,
    recentExecutions: hookManager.getRecentExecutionAudits(50)
  }
}

/**
 * 应用并持久化 Hook 治理策略
 */
export async function updateHookGovernance(
  input: HookGovernanceUpdateInput
): Promise<HookGovernanceUpdateResult> {
  if (!Array.isArray(input.hooks) || input.hooks.length === 0) {
    return {
      success: false,
      updated: [],
      skipped: [],
      status: getHookSystemStatus()
    }
  }

  const { updated, skipped } = applyHookGovernanceUpdateInMemory(input, true)

  try {
    await persistHookGovernanceConfig()
    return {
      success: true,
      updated,
      skipped,
      status: getHookSystemStatus()
    }
  } catch (error) {
    logger.error('Failed to persist hook governance config:', error)
    return {
      success: false,
      updated: [],
      skipped,
      status: getHookSystemStatus()
    }
  }
}

/**
 * 启动时加载并应用持久化的 Hook 治理策略
 */
export async function restorePersistedHookGovernance(): Promise<void> {
  try {
    const persisted = await loadPersistedHookGovernanceConfig()
    if (!persisted || persisted.hooks.length === 0) {
      return
    }

    applyHookGovernanceUpdateInMemory(
      {
        hooks: persisted.hooks
      },
      false
    )
  } catch (error) {
    logger.warn('Failed to restore persisted hook governance config:', error)
  }
}

/**
 * Hook 生命周期框架
 *
 * 提供可扩展的 Hook 系统，支持：
 * - onToolStart: 工具执行开始前
 * - onToolEnd: 工具执行结束后
 * - onMessageCreate: 消息创建时
 * - onContextOverflow: 上下文窗口溢出时
 * - onEditError: 编辑工具错误时
 */

// 类型导出
export type {
  HookEventType,
  HookContext,
  ToolExecutionInput,
  ToolExecutionOutput,
  MessageInfo,
  ContextOverflowInfo,
  EditErrorInfo,
  OnToolStartCallback,
  OnToolEndCallback,
  OnMessageCreateCallback,
  OnContextOverflowCallback,
  OnEditErrorCallback,
  HookCallbackMap,
  HookConfig,
  RegisteredHook,
  HookFactoryInput,
  HookFactory,
  HookExecutionResult,
  EventEmitResult
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
import { createContextWindowMonitorHook } from './context-window-monitor'
import { createEditErrorRecoveryToolHook } from './edit-error-recovery'
import { createToolOutputTruncatorHook } from './tool-output-truncator'
import { createRulesInjectorHook } from './rules-injector.hook'
import { createTodoContinuationHooks } from './todo-continuation.hook'
import { createStopSignalHook } from './stop-signal.hook'
import { loadClaudeCodeHooks } from './claude-code'
import { logger } from '../../../shared/logger'

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
export function getHookSystemStatus(): {
  initialized: boolean
  stats: ReturnType<typeof hookManager.getStats>
  hooks: Array<{
    id: string
    name: string
    event: string
    enabled: boolean
    priority: number
    executionCount: number
    errorCount: number
  }>
} {
  const stats = hookManager.getStats()
  const hooks = hookManager.getAll().map(h => ({
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
    hooks
  }
}

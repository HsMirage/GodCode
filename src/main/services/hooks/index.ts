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

export type {
  HookGovernanceAuditRecord,
  HookGovernanceAuditSummary,
  HookGovernanceItem,
  HookGovernanceRuntimeSnapshot,
  HookGovernanceScope,
  HookGovernanceSource,
  HookGovernanceStats,
  HookGovernanceStatus,
  HookGovernanceUpdateInput,
  HookGovernanceUpdateItem,
  HookGovernanceUpdateResult,
  HookReliabilityPolicy,
  PersistedHookGovernanceConfig,
  PersistedHookGovernanceItem
} from '@/shared/hook-governance-contract'

// Hook 管理器
export { HookManager, hookManager } from './manager'

// Hook 治理
export {
  applyCachedHookGovernanceConfig,
  getHookSystemStatus,
  normalizeHookGovernanceUpdateInput,
  restorePersistedHookGovernance,
  updateHookGovernance
} from './governance'

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
import { applyCachedHookGovernanceConfig } from './governance'
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
  applyCachedHookGovernanceConfig()
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
      applyCachedHookGovernanceConfig()
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

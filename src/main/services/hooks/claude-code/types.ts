/**
 * Claude Code Hook 兼容层类型定义
 *
 * 支持 Claude Code 的 hook 配置格式，包括:
 * - PreToolUse / PostToolUse hooks
 * - SessionStart / SessionEnd hooks
 * - UserPromptSubmit / Stop hooks
 * - Notification hooks
 * - SubagentStart / SubagentStop hooks
 */

// ============= Claude Code Hook 事件类型 =============

export type ClaudeCodeHookEvent =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Stop'
  | 'TeammateIdle'
  | 'TaskCompleted'
  | 'PreCompact'
  | 'SessionEnd'

// ============= Hook 处理器类型 =============

export type ClaudeCodeHookType = 'command' | 'prompt' | 'agent'

/**
 * 命令类型 Hook 处理器
 */
export interface CommandHookHandler {
  type: 'command'
  command: string
  timeout?: number
  async?: boolean
  statusMessage?: string
  once?: boolean
}

/**
 * Prompt 类型 Hook 处理器
 */
export interface PromptHookHandler {
  type: 'prompt'
  prompt: string
  model?: string
  timeout?: number
  statusMessage?: string
  once?: boolean
}

/**
 * Agent 类型 Hook 处理器
 */
export interface AgentHookHandler {
  type: 'agent'
  prompt: string
  model?: string
  timeout?: number
  statusMessage?: string
  once?: boolean
}

export type ClaudeCodeHookHandler = CommandHookHandler | PromptHookHandler | AgentHookHandler

/**
 * Hook 匹配器组
 */
export interface ClaudeCodeMatcherGroup {
  matcher?: string
  hooks: ClaudeCodeHookHandler[]
}

/**
 * Claude Code Hook 配置
 */
export interface ClaudeCodeHooksConfig {
  hooks: Partial<Record<ClaudeCodeHookEvent, ClaudeCodeMatcherGroup[]>>
  disableAllHooks?: boolean
  description?: string
}

// ============= Hook 输入类型 =============

/**
 * 通用 Hook 输入字段
 */
export interface CommonHookInput {
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode: 'default' | 'plan' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions'
  hook_event_name: ClaudeCodeHookEvent
}

/**
 * SessionStart 输入
 */
export interface SessionStartInput extends CommonHookInput {
  hook_event_name: 'SessionStart'
  source: 'startup' | 'resume' | 'clear' | 'compact'
  model: string
  agent_type?: string
}

/**
 * UserPromptSubmit 输入
 */
export interface UserPromptSubmitInput extends CommonHookInput {
  hook_event_name: 'UserPromptSubmit'
  prompt: string
}

/**
 * PreToolUse 输入
 */
export interface PreToolUseInput extends CommonHookInput {
  hook_event_name: 'PreToolUse'
  tool_name: string
  tool_input: Record<string, unknown>
  tool_use_id: string
}

/**
 * PostToolUse 输入
 */
export interface PostToolUseInput extends CommonHookInput {
  hook_event_name: 'PostToolUse'
  tool_name: string
  tool_input: Record<string, unknown>
  tool_response: Record<string, unknown>
  tool_use_id: string
}

/**
 * PostToolUseFailure 输入
 */
export interface PostToolUseFailureInput extends CommonHookInput {
  hook_event_name: 'PostToolUseFailure'
  tool_name: string
  tool_input: Record<string, unknown>
  tool_use_id: string
  error: string
  is_interrupt?: boolean
}

/**
 * Stop 输入
 */
export interface StopInput extends CommonHookInput {
  hook_event_name: 'Stop'
  stop_hook_active: boolean
}

/**
 * SessionEnd 输入
 */
export interface SessionEndInput extends CommonHookInput {
  hook_event_name: 'SessionEnd'
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'bypass_permissions_disabled' | 'other'
}

export type ClaudeCodeHookInput =
  | SessionStartInput
  | UserPromptSubmitInput
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | StopInput
  | SessionEndInput

// ============= Hook 输出类型 =============

/**
 * 通用 Hook 输出字段
 */
export interface CommonHookOutput {
  continue?: boolean
  stopReason?: string
  suppressOutput?: boolean
  systemMessage?: string
}

/**
 * PreToolUse 决策控制
 */
export interface PreToolUseDecision {
  hookEventName: 'PreToolUse'
  permissionDecision?: 'allow' | 'deny' | 'ask'
  permissionDecisionReason?: string
  updatedInput?: Record<string, unknown>
  additionalContext?: string
}

/**
 * PostToolUse 决策控制
 */
export interface PostToolUseDecision {
  hookEventName: 'PostToolUse'
  additionalContext?: string
  updatedMCPToolOutput?: unknown
}

/**
 * 顶层决策（用于 UserPromptSubmit, PostToolUse, Stop 等）
 */
export interface TopLevelDecision extends CommonHookOutput {
  decision?: 'block'
  reason?: string
  hookSpecificOutput?: PreToolUseDecision | PostToolUseDecision | {
    hookEventName: ClaudeCodeHookEvent
    additionalContext?: string
  }
}

export type ClaudeCodeHookOutput = TopLevelDecision

// ============= 事件映射到 CodeAll =============

/**
 * Claude Code 事件到 CodeAll 事件的映射
 */
export const CLAUDE_TO_CODEALL_EVENT_MAP: Record<ClaudeCodeHookEvent, string> = {
  SessionStart: 'onSessionStart',
  UserPromptSubmit: 'onUserPromptSubmit',
  PreToolUse: 'onToolStart',
  PermissionRequest: 'onPermissionRequest',
  PostToolUse: 'onToolEnd',
  PostToolUseFailure: 'onToolError',
  Notification: 'onNotification',
  SubagentStart: 'onSubagentStart',
  SubagentStop: 'onSubagentStop',
  Stop: 'onStop',
  TeammateIdle: 'onTeammateIdle',
  TaskCompleted: 'onTaskCompleted',
  PreCompact: 'onPreCompact',
  SessionEnd: 'onSessionEnd'
}

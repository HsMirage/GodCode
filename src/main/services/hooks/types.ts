/**
 * Hook 生命周期框架类型定义
 *
 * 支持的事件类型:
 * - onToolStart: 工具执行开始前
 * - onToolEnd: 工具执行结束后
 * - onMessageCreate: 消息创建时
 * - onContextOverflow: 上下文窗口溢出时
 * - onEditError: 编辑工具错误时
 */

// ============= 事件类型 =============

export type HookEventType =
  | 'onToolStart'
  | 'onToolEnd'
  | 'onMessageCreate'
  | 'onContextOverflow'
  | 'onEditError'

// ============= 上下文类型 =============

/**
 * Hook 执行上下文
 */
export interface HookContext {
  sessionId: string
  workspaceDir: string
  userId?: string
}

/**
 * 工具执行输入参数
 */
export interface ToolExecutionInput {
  tool: string
  callId: string
  params: Record<string, unknown>
}

/**
 * 工具执行输出结果
 */
export interface ToolExecutionOutput {
  title: string
  output: string
  metadata?: Record<string, unknown>
  success: boolean
  error?: string
}

/**
 * 消息信息
 */
export interface MessageInfo {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens?: {
    input: number
    output: number
    reasoning?: number
    cache?: { read: number; write: number }
  }
}

/**
 * 上下文溢出信息
 */
export interface ContextOverflowInfo {
  currentTokens: number
  maxTokens: number
  usagePercentage: number
}

/**
 * 编辑错误信息
 */
export interface EditErrorInfo {
  filePath: string
  errorType: 'not_found' | 'multiple_matches' | 'same_content' | 'unknown'
  errorMessage: string
  oldString?: string
  newString?: string
}

// ============= 回调签名 =============

/**
 * 工具开始回调
 */
export type OnToolStartCallback = (
  context: HookContext,
  input: ToolExecutionInput
) => Promise<void | { modified?: Partial<ToolExecutionInput>; skip?: boolean }>

/**
 * 工具结束回调
 */
export type OnToolEndCallback = (
  context: HookContext,
  input: ToolExecutionInput,
  output: ToolExecutionOutput
) => Promise<void | { modifiedOutput?: Partial<ToolExecutionOutput> }>

/**
 * 消息创建回调
 */
export type OnMessageCreateCallback = (
  context: HookContext,
  message: MessageInfo
) => Promise<void | { modifiedContent?: string; inject?: string }>

/**
 * 上下文溢出回调
 */
export type OnContextOverflowCallback = (
  context: HookContext,
  info: ContextOverflowInfo
) => Promise<void | { action?: 'compact' | 'warn' | 'ignore'; injection?: string }>

/**
 * 编辑错误回调
 */
export type OnEditErrorCallback = (
  context: HookContext,
  error: EditErrorInfo
) => Promise<void | { recovery?: string; injection?: string }>

// ============= Hook 配置 =============

/**
 * Hook 回调类型映射
 */
export interface HookCallbackMap {
  onToolStart: OnToolStartCallback
  onToolEnd: OnToolEndCallback
  onMessageCreate: OnMessageCreateCallback
  onContextOverflow: OnContextOverflowCallback
  onEditError: OnEditErrorCallback
}

/**
 * Hook 配置
 */
export interface HookConfig<T extends HookEventType = HookEventType> {
  /** Hook 唯一标识 */
  id: string
  /** Hook 名称 */
  name: string
  /** 监听的事件类型 */
  event: T
  /** 回调函数 */
  callback: HookCallbackMap[T]
  /** 优先级（数值越小越先执行） */
  priority?: number
  /** 是否启用 */
  enabled?: boolean
  /** Hook 描述 */
  description?: string
}

/**
 * 已注册的 Hook
 */
export interface RegisteredHook<T extends HookEventType = HookEventType> extends HookConfig<T> {
  /** 注册时间 */
  registeredAt: Date
  /** 执行次数 */
  executionCount: number
  /** 最后执行时间 */
  lastExecutedAt?: Date
  /** 执行错误次数 */
  errorCount: number
}

// ============= Hook 工厂类型 =============

/**
 * Hook 工厂函数输入
 */
export interface HookFactoryInput {
  sessionId: string
  workspaceDir: string
  config?: Record<string, unknown>
}

/**
 * Hook 工厂函数
 */
export type HookFactory = (input: HookFactoryInput) => HookConfig | HookConfig[]

// ============= 事件发射结果 =============

/**
 * Hook 执行结果
 */
export interface HookExecutionResult {
  hookId: string
  success: boolean
  duration: number
  error?: string
  returnValue?: unknown
}

/**
 * 事件发射结果
 */
export interface EventEmitResult {
  event: HookEventType
  hookResults: HookExecutionResult[]
  aggregatedReturn?: unknown
}

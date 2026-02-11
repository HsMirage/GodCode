/**
 * Hook 管理器
 *
 * 负责 Hook 的注册、移除和触发
 */

import type {
  HookEventType,
  HookConfig,
  RegisteredHook,
  HookCallbackMap,
  HookContext,
  ToolExecutionInput,
  ToolExecutionOutput,
  MessageInfo,
  ContextOverflowInfo,
  EditErrorInfo,
  HookExecutionResult,
  EventEmitResult
} from './types'

export class HookManager {
  private static instance: HookManager | null = null
  private hooks: Map<string, RegisteredHook> = new Map()
  private eventHooks: Map<HookEventType, Set<string>> = new Map()

  private constructor() {
    // 初始化事件映射
    const events: HookEventType[] = [
      'onToolStart',
      'onToolEnd',
      'onMessageCreate',
      'onContextOverflow',
      'onEditError'
    ]
    for (const event of events) {
      this.eventHooks.set(event, new Set())
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager()
    }
    return HookManager.instance
  }

  /**
   * 重置实例（用于测试）
   */
  static resetInstance(): void {
    HookManager.instance = null
  }

  /**
   * 注册 Hook
   */
  register<T extends HookEventType>(config: HookConfig<T>): void {
    if (this.hooks.has(config.id)) {
      throw new Error(`Hook with id "${config.id}" already exists`)
    }

    const registeredHook: RegisteredHook<T> = {
      ...config,
      enabled: config.enabled ?? true,
      priority: config.priority ?? 100,
      registeredAt: new Date(),
      executionCount: 0,
      errorCount: 0
    }

    this.hooks.set(config.id, registeredHook as RegisteredHook)
    this.eventHooks.get(config.event)?.add(config.id)
  }

  /**
   * 批量注册 Hooks
   */
  registerMany(configs: HookConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  /**
   * 移除 Hook
   */
  unregister(hookId: string): boolean {
    const hook = this.hooks.get(hookId)
    if (!hook) {
      return false
    }

    this.eventHooks.get(hook.event)?.delete(hookId)
    this.hooks.delete(hookId)
    return true
  }

  /**
   * 启用 Hook
   */
  enable(hookId: string): boolean {
    const hook = this.hooks.get(hookId)
    if (!hook) {
      return false
    }
    hook.enabled = true
    return true
  }

  /**
   * 禁用 Hook
   */
  disable(hookId: string): boolean {
    const hook = this.hooks.get(hookId)
    if (!hook) {
      return false
    }
    hook.enabled = false
    return true
  }

  /**
   * 获取 Hook
   */
  get(hookId: string): RegisteredHook | undefined {
    return this.hooks.get(hookId)
  }

  /**
   * 获取所有 Hooks
   */
  getAll(): RegisteredHook[] {
    return Array.from(this.hooks.values())
  }

  /**
   * 获取指定事件的所有 Hooks（按优先级排序）
   */
  getByEvent(event: HookEventType): RegisteredHook[] {
    const hookIds = this.eventHooks.get(event) ?? new Set()
    const hooks: RegisteredHook[] = []

    for (const id of hookIds) {
      const hook = this.hooks.get(id)
      if (hook && hook.enabled) {
        hooks.push(hook)
      }
    }

    return hooks.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
  }

  /**
   * 触发 onToolStart 事件
   */
  async emitToolStart(
    context: HookContext,
    input: ToolExecutionInput
  ): Promise<EventEmitResult & { shouldSkip?: boolean; modifiedInput?: ToolExecutionInput }> {
    const hooks = this.getByEvent('onToolStart')
    const results: HookExecutionResult[] = []
    let shouldSkip = false
    let modifiedInput = { ...input }

    for (const hook of hooks) {
      const startTime = Date.now()
      try {
        const callback = hook.callback as HookCallbackMap['onToolStart']
        const result = await callback(context, modifiedInput)

        hook.executionCount++
        hook.lastExecutedAt = new Date()

        if (result?.skip) {
          shouldSkip = true
        }
        if (result?.modified) {
          modifiedInput = { ...modifiedInput, ...result.modified }
        }

        results.push({
          hookId: hook.id,
          success: true,
          duration: Date.now() - startTime,
          returnValue: result
        })
      } catch (error) {
        hook.errorCount++
        results.push({
          hookId: hook.id,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { event: 'onToolStart', hookResults: results, shouldSkip, modifiedInput }
  }

  /**
   * 触发 onToolEnd 事件
   */
  async emitToolEnd(
    context: HookContext,
    input: ToolExecutionInput,
    output: ToolExecutionOutput
  ): Promise<EventEmitResult & { modifiedOutput?: ToolExecutionOutput }> {
    const hooks = this.getByEvent('onToolEnd')
    const results: HookExecutionResult[] = []
    let modifiedOutput = { ...output }

    for (const hook of hooks) {
      const startTime = Date.now()
      try {
        const callback = hook.callback as HookCallbackMap['onToolEnd']
        const result = await callback(context, input, modifiedOutput)

        hook.executionCount++
        hook.lastExecutedAt = new Date()

        if (result?.modifiedOutput) {
          modifiedOutput = { ...modifiedOutput, ...result.modifiedOutput }
        }

        results.push({
          hookId: hook.id,
          success: true,
          duration: Date.now() - startTime,
          returnValue: result
        })
      } catch (error) {
        hook.errorCount++
        results.push({
          hookId: hook.id,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { event: 'onToolEnd', hookResults: results, modifiedOutput }
  }

  /**
   * 触发 onMessageCreate 事件
   */
  async emitMessageCreate(
    context: HookContext,
    message: MessageInfo
  ): Promise<EventEmitResult & { modifiedContent?: string; injections?: string[] }> {
    const hooks = this.getByEvent('onMessageCreate')
    const results: HookExecutionResult[] = []
    let modifiedContent = message.content
    const injections: string[] = []

    for (const hook of hooks) {
      const startTime = Date.now()
      try {
        const callback = hook.callback as HookCallbackMap['onMessageCreate']
        const result = await callback(context, { ...message, content: modifiedContent })

        hook.executionCount++
        hook.lastExecutedAt = new Date()

        if (result?.modifiedContent) {
          modifiedContent = result.modifiedContent
        }
        if (result?.inject) {
          injections.push(result.inject)
        }

        results.push({
          hookId: hook.id,
          success: true,
          duration: Date.now() - startTime,
          returnValue: result
        })
      } catch (error) {
        hook.errorCount++
        results.push({
          hookId: hook.id,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { event: 'onMessageCreate', hookResults: results, modifiedContent, injections }
  }

  /**
   * 触发 onContextOverflow 事件
   */
  async emitContextOverflow(
    context: HookContext,
    info: ContextOverflowInfo
  ): Promise<EventEmitResult & { action?: 'compact' | 'warn' | 'ignore'; injections?: string[] }> {
    const hooks = this.getByEvent('onContextOverflow')
    const results: HookExecutionResult[] = []
    let action: 'compact' | 'warn' | 'ignore' | undefined
    const injections: string[] = []

    for (const hook of hooks) {
      const startTime = Date.now()
      try {
        const callback = hook.callback as HookCallbackMap['onContextOverflow']
        const result = await callback(context, info)

        hook.executionCount++
        hook.lastExecutedAt = new Date()

        if (result?.action) {
          action = result.action
        }
        if (result?.injection) {
          injections.push(result.injection)
        }

        results.push({
          hookId: hook.id,
          success: true,
          duration: Date.now() - startTime,
          returnValue: result
        })
      } catch (error) {
        hook.errorCount++
        results.push({
          hookId: hook.id,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { event: 'onContextOverflow', hookResults: results, action, injections }
  }

  /**
   * 触发 onEditError 事件
   */
  async emitEditError(
    context: HookContext,
    error: EditErrorInfo
  ): Promise<EventEmitResult & { recovery?: string; injections?: string[] }> {
    const hooks = this.getByEvent('onEditError')
    const results: HookExecutionResult[] = []
    let recovery: string | undefined
    const injections: string[] = []

    for (const hook of hooks) {
      const startTime = Date.now()
      try {
        const callback = hook.callback as HookCallbackMap['onEditError']
        const result = await callback(context, error)

        hook.executionCount++
        hook.lastExecutedAt = new Date()

        if (result?.recovery) {
          recovery = result.recovery
        }
        if (result?.injection) {
          injections.push(result.injection)
        }

        results.push({
          hookId: hook.id,
          success: true,
          duration: Date.now() - startTime,
          returnValue: result
        })
      } catch (error) {
        hook.errorCount++
        results.push({
          hookId: hook.id,
          success: false,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return { event: 'onEditError', hookResults: results, recovery, injections }
  }

  /**
   * 获取 Hook 统计信息
   */
  getStats(): {
    total: number
    enabled: number
    disabled: number
    byEvent: Record<HookEventType, number>
    totalExecutions: number
    totalErrors: number
  } {
    const hooks = this.getAll()
    const byEvent: Record<HookEventType, number> = {
      onToolStart: 0,
      onToolEnd: 0,
      onMessageCreate: 0,
      onContextOverflow: 0,
      onEditError: 0
    }

    let enabled = 0
    let disabled = 0
    let totalExecutions = 0
    let totalErrors = 0

    for (const hook of hooks) {
      if (hook.enabled) {
        enabled++
      } else {
        disabled++
      }
      byEvent[hook.event]++
      totalExecutions += hook.executionCount
      totalErrors += hook.errorCount
    }

    return {
      total: hooks.length,
      enabled,
      disabled,
      byEvent,
      totalExecutions,
      totalErrors
    }
  }

  /**
   * 清空所有 Hooks
   */
  clear(): void {
    this.hooks.clear()
    for (const set of this.eventHooks.values()) {
      set.clear()
    }
  }
}

// 导出单例实例
export const hookManager = HookManager.getInstance()

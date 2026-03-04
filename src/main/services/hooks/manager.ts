/**
 * Hook 管理器
 *
 * 负责 Hook 的注册、移除和触发
 */

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { logger } from '../../../shared/logger'
import { AuditLogService } from '../audit-log.service'
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
  TaskLifecycleInfo,
  HookExecutionResult,
  EventEmitResult,
  HookExecutionAuditRecord,
  HookExecutionStrategySnapshot,
  HookExecutionContextSnapshot,
  HookExecutionOutcome,
  HookExecutionStatus,
  MessageInjectionResult
} from './types'

class HookTimeoutError extends Error {
  constructor(
    public readonly hookId: string,
    public readonly timeoutMs: number
  ) {
    super(`Hook "${hookId}" timed out after ${timeoutMs}ms`)
    this.name = 'HookTimeoutError'
  }
}

interface HookRuntimeState {
  consecutiveFailures: number
  circuitOpenUntil?: number
}

export class HookManager {
  private static instance: HookManager | null = null
  private readonly eventEmitter = new EventEmitter()
  private hooks: Map<string, RegisteredHook> = new Map()
  private eventHooks: Map<HookEventType, Set<string>> = new Map()
  private readonly maxExecutionAudits = 200
  private executionAudits: HookExecutionAuditRecord[] = []
  private readonly hookTimeoutMs = 2000
  private readonly circuitBreakerFailureThreshold = 3
  private readonly circuitBreakerCooldownMs = 30_000
  private runtimeStates: Map<string, HookRuntimeState> = new Map()

  private constructor() {
    // 初始化事件映射
    const events: HookEventType[] = [
      'onToolStart',
      'onToolEnd',
      'onMessageCreate',
      'onContextOverflow',
      'onEditError',
      'onTaskLifecycle'
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
    this.runtimeStates.delete(hookId)
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

  private getRuntimeState(hookId: string): HookRuntimeState {
    const existing = this.runtimeStates.get(hookId)
    if (existing) {
      return existing
    }

    const initial: HookRuntimeState = { consecutiveFailures: 0 }
    this.runtimeStates.set(hookId, initial)
    return initial
  }

  private isCircuitOpen(hook: RegisteredHook, now = Date.now()): { open: boolean; openUntil?: number } {
    const state = this.getRuntimeState(hook.id)
    if (!state.circuitOpenUntil) {
      return { open: false }
    }

    if (state.circuitOpenUntil <= now) {
      state.circuitOpenUntil = undefined
      return { open: false }
    }

    return { open: true, openUntil: state.circuitOpenUntil }
  }

  private markHookSuccess(hook: RegisteredHook): void {
    const state = this.getRuntimeState(hook.id)
    state.consecutiveFailures = 0
    state.circuitOpenUntil = undefined
  }

  private markHookFailure(hook: RegisteredHook): Date | undefined {
    const state = this.getRuntimeState(hook.id)
    state.consecutiveFailures += 1

    if (state.consecutiveFailures >= this.circuitBreakerFailureThreshold) {
      state.circuitOpenUntil = Date.now() + this.circuitBreakerCooldownMs
      state.consecutiveFailures = 0
      return new Date(state.circuitOpenUntil)
    }

    return undefined
  }

  private withTimeout<T>(promise: Promise<T>, hookId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new HookTimeoutError(hookId, this.hookTimeoutMs))
      }, this.hookTimeoutMs)

      promise
        .then(value => {
          clearTimeout(timer)
          resolve(value)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof HookTimeoutError) {
      return error.message
    }

    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }

  private resolveExecutionStatus(error?: unknown): HookExecutionStatus {
    if (!error) {
      return 'success'
    }

    if (error instanceof HookTimeoutError) {
      return 'timeout'
    }

    return 'error'
  }

  private createReturnValuePreview(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined
    }

    try {
      const serialized = JSON.stringify(value)
      if (serialized.length <= 500) {
        return serialized
      }
      return `${serialized.slice(0, 500)}...`
    } catch {
      return '[Unserializable return value]'
    }
  }

  private buildStrategySnapshot(hook: RegisteredHook): HookExecutionStrategySnapshot {
    return {
      hookId: hook.id,
      hookName: hook.name,
      event: hook.event,
      priority: hook.priority ?? 100,
      enabled: hook.enabled ?? true
    }
  }

  private async persistExecutionAudit(record: HookExecutionAuditRecord): Promise<void> {
    try {
      await AuditLogService.getInstance().log({
        action: 'hook:execution',
        entityType: 'hook',
        entityId: record.strategy.hookId,
        sessionId: record.execution.sessionId,
        success: record.result.success,
        errorMsg: record.result.error,
        metadata: {
          timestamp: record.timestamp.toISOString(),
          strategy: record.strategy,
          execution: record.execution,
          result: record.result
        }
      })
    } catch (error) {
      logger.warn('Failed to persist hook execution audit log:', error)
    }
  }

  private pushExecutionAudit(
    hook: RegisteredHook,
    execution: HookExecutionContextSnapshot,
    result: HookExecutionOutcome
  ): void {
    const record: HookExecutionAuditRecord = {
      id: randomUUID(),
      timestamp: new Date(),
      strategy: this.buildStrategySnapshot(hook),
      execution,
      result
    }

    this.executionAudits.unshift(record)

    if (this.executionAudits.length > this.maxExecutionAudits) {
      this.executionAudits.length = this.maxExecutionAudits
    }

    this.eventEmitter.emit('execution-audit-appended', record)
    void this.persistExecutionAudit(record)
  }

  onExecutionAuditAppended(listener: (record: HookExecutionAuditRecord) => void): () => void {
    this.eventEmitter.on('execution-audit-appended', listener)
    return () => {
      this.eventEmitter.off('execution-audit-appended', listener)
    }
  }

  getRecentExecutionAudits(limit = 50): HookExecutionAuditRecord[] {
    if (!Number.isFinite(limit) || limit <= 0) {
      return []
    }

    return this.executionAudits.slice(0, Math.floor(limit))
  }

  private async emitEvent<TPayload, TExtra extends object = Record<string, never>>(
    event: HookEventType,
    payload: TPayload,
    callbackFactory: (hook: RegisteredHook) => (payload: TPayload) => Promise<unknown>,
    executionFactory: (payload: TPayload) => HookExecutionContextSnapshot,
    onResult?: (result: unknown, state: TExtra) => void,
    initialExtra?: TExtra
  ): Promise<EventEmitResult & TExtra> {
    const hooks = this.getByEvent(event)
    const hookResults: HookExecutionResult[] = []
    const extra = (initialExtra ?? ({} as TExtra)) as TExtra

    for (const hook of hooks) {
      const circuit = this.isCircuitOpen(hook)
      if (circuit.open) {
        const circuitOpenUntil = circuit.openUntil ? new Date(circuit.openUntil) : undefined
        const errorMessage = circuitOpenUntil
          ? `Hook "${hook.id}" skipped because circuit is open until ${circuitOpenUntil.toISOString()}`
          : `Hook "${hook.id}" skipped because circuit is open`

        hookResults.push({
          hookId: hook.id,
          success: false,
          duration: 0,
          status: 'circuit_open',
          degraded: true,
          error: errorMessage,
          circuitOpenUntil
        })

        this.pushExecutionAudit(hook, executionFactory(payload), {
          success: false,
          duration: 0,
          status: 'circuit_open',
          degraded: true,
          error: errorMessage,
          circuitOpenUntil
        })
        continue
      }

      const startTime = Date.now()
      try {
        const callback = callbackFactory(hook)
        const result = await this.withTimeout(callback(payload), hook.id)

        hook.executionCount++
        hook.lastExecutedAt = new Date()
        this.markHookSuccess(hook)

        if (onResult) {
          onResult(result, extra)
        }

        const duration = Date.now() - startTime
        hookResults.push({
          hookId: hook.id,
          success: true,
          duration,
          status: 'success',
          degraded: false,
          returnValue: result
        })

        this.pushExecutionAudit(hook, executionFactory(payload), {
          success: true,
          duration,
          status: 'success',
          degraded: false,
          returnValuePreview: this.createReturnValuePreview(result)
        })
      } catch (error) {
        hook.errorCount++
        const duration = Date.now() - startTime
        const status = this.resolveExecutionStatus(error)
        const errorMessage = this.toErrorMessage(error)
        const circuitOpenUntil = this.markHookFailure(hook)

        hookResults.push({
          hookId: hook.id,
          success: false,
          duration,
          status,
          degraded: true,
          error: errorMessage,
          circuitOpenUntil
        })

        this.pushExecutionAudit(hook, executionFactory(payload), {
          success: false,
          duration,
          status,
          degraded: true,
          error: errorMessage,
          circuitOpenUntil
        })
      }
    }


    return {
      event,
      hookResults,
      ...extra
    }
  }

  /**
   * 触发 onToolStart 事件
   */
  async emitToolStart(
    context: HookContext,
    input: ToolExecutionInput
  ): Promise<EventEmitResult & { shouldSkip?: boolean; modifiedInput?: ToolExecutionInput }> {
    const payload = { input: { ...input } }

    return this.emitEvent(
      'onToolStart',
      payload,
      hook => async current => {
        const callback = hook.callback as HookCallbackMap['onToolStart']
        return callback(context, current.input)
      },
      current => ({
        sessionId: context.sessionId,
        workspaceDir: context.workspaceDir,
        userId: context.userId,
        tool: current.input.tool,
        callId: current.input.callId
      }),
      (result, state) => {
        const typed = result as { skip?: boolean; modified?: Partial<ToolExecutionInput> } | undefined
        if (typed?.skip) {
          state.shouldSkip = true
        }
        if (typed?.modified) {
          state.modifiedInput = { ...(state.modifiedInput || input), ...typed.modified }
          payload.input = state.modifiedInput
        }
      },
      {
        shouldSkip: false,
        modifiedInput: { ...input }
      }
    )
  }

  /**
   * 触发 onToolEnd 事件
   */
  async emitToolEnd(
    context: HookContext,
    input: ToolExecutionInput,
    output: ToolExecutionOutput
  ): Promise<EventEmitResult & { modifiedOutput?: ToolExecutionOutput }> {
    const payload = {
      input,
      output: { ...output }
    }

    return this.emitEvent(
      'onToolEnd',
      payload,
      hook => async current => {
        const callback = hook.callback as HookCallbackMap['onToolEnd']
        return callback(context, current.input, current.output)
      },
      current => ({
        sessionId: context.sessionId,
        workspaceDir: context.workspaceDir,
        userId: context.userId,
        tool: current.input.tool,
        callId: current.input.callId
      }),
      (result, state) => {
        const typed = result as { modifiedOutput?: Partial<ToolExecutionOutput> } | undefined
        if (typed?.modifiedOutput) {
          state.modifiedOutput = { ...(state.modifiedOutput || output), ...typed.modifiedOutput }
          payload.output = state.modifiedOutput
        }
      },
      {
        modifiedOutput: { ...output }
      }
    )
  }

  /**
   * 触发 onMessageCreate 事件
   */
  async emitMessageCreate(
    context: HookContext,
    message: MessageInfo
  ): Promise<EventEmitResult & { modifiedContent?: string; injections?: MessageInjectionResult[] }> {
    const payload = {
      message: { ...message, content: message.content }
    }

    return this.emitEvent(
      'onMessageCreate',
      payload,
      hook => async current => {
        const callback = hook.callback as HookCallbackMap['onMessageCreate']
        return callback(context, current.message)
      },
      () => ({
        sessionId: context.sessionId,
        workspaceDir: context.workspaceDir,
        userId: context.userId,
        messageId: message.id,
        messageRole: message.role
      }),
      (result, state) => {
        const typed = result as
          | { modifiedContent?: string; inject?: string | MessageInjectionResult }
          | undefined
        if (typed?.modifiedContent) {
          state.modifiedContent = typed.modifiedContent
          payload.message.content = typed.modifiedContent
        }
        if (typed?.inject) {
          if (typeof typed.inject === 'string') {
            state.injections?.push({
              type: 'hook-injection',
              source: 'unknown',
              content: typed.inject
            })
          } else {
            state.injections?.push({
              type: typed.inject.type || 'hook-injection',
              source: typed.inject.source || 'unknown',
              priority: typed.inject.priority,
              content: typed.inject.content
            })
          }
        }
      },
      {
        modifiedContent: message.content,
        injections: [] as MessageInjectionResult[]
      }
    )
  }

  /**
   * 触发 onContextOverflow 事件
   */
  async emitContextOverflow(
    context: HookContext,
    info: ContextOverflowInfo
  ): Promise<EventEmitResult & { action?: 'compact' | 'warn' | 'ignore'; injections?: string[] }> {
    return this.emitEvent(
      'onContextOverflow',
      info,
      hook => async current => {
        const callback = hook.callback as HookCallbackMap['onContextOverflow']
        return callback(context, current)
      },
      current => ({
        sessionId: context.sessionId,
        workspaceDir: context.workspaceDir,
        userId: context.userId,
        currentTokens: current.currentTokens,
        maxTokens: current.maxTokens,
        usagePercentage: current.usagePercentage
      }),
      (result, state) => {
        const typed = result as { action?: 'compact' | 'warn' | 'ignore'; injection?: string } | undefined
        if (typed?.action) {
          state.action = typed.action
        }
        if (typed?.injection) {
          state.injections?.push(typed.injection)
        }
      },
      {
        action: undefined as 'compact' | 'warn' | 'ignore' | undefined,
        injections: [] as string[]
      }
    )
  }

  /**
   * 触发 onEditError 事件
   */
  async emitEditError(
    context: HookContext,
    editError: EditErrorInfo
  ): Promise<EventEmitResult & { recovery?: string; injections?: string[] }> {
    return this.emitEvent(
      'onEditError',
      editError,
      hook => async current => {
        const callback = hook.callback as HookCallbackMap['onEditError']
        return callback(context, current)
      },
      current => ({
        sessionId: context.sessionId,
        workspaceDir: context.workspaceDir,
        userId: context.userId,
        filePath: current.filePath,
        errorType: current.errorType
      }),
      (result, state) => {
        const typed = result as { recovery?: string; injection?: string } | undefined
        if (typed?.recovery) {
          state.recovery = typed.recovery
        }
        if (typed?.injection) {
          state.injections?.push(typed.injection)
        }
      },
      {
        recovery: undefined as string | undefined,
        injections: [] as string[]
      }
    )
  }

  /**
   * 触发 onTaskLifecycle 事件
   */
  async emitTaskLifecycle(context: HookContext, info: TaskLifecycleInfo): Promise<EventEmitResult> {
    return this.emitEvent(
      'onTaskLifecycle',
      info,
      hook => async current => {
        const callback = hook.callback as HookCallbackMap['onTaskLifecycle']
        return callback(context, current)
      },
      current => ({
        sessionId: context.sessionId,
        workspaceDir: context.workspaceDir,
        userId: context.userId,
        workflowId: current.workflowId,
        taskId: current.taskId,
        taskStatus: current.status
      })
    )
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
      onEditError: 0,
      onTaskLifecycle: 0
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
    this.executionAudits = []
    this.runtimeStates.clear()
    for (const set of this.eventHooks.values()) {
      set.clear()
    }
  }
}


// 导出单例实例
export const hookManager = HookManager.getInstance()

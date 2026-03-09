/**
 * Copyright (c) 2026 GodCode Team
 * SPDX-License-Identifier: MIT
 *
 * HookManager — 生命周期 Hook 管理器，基于 EventEmitter 实现事件驱动的钩子系统
 */

import { EventEmitter } from 'node:events'
import { LoggerService } from '../logger'

/**
 * Hook事件类型
 */
export enum HookEventType {
  // 用户交互
  USER_PROMPT_SUBMIT = 'user_prompt_submit',
  USER_MESSAGE_RECEIVED = 'user_message_received',

  // 工具执行
  PRE_TOOL_USE = 'pre_tool_use',
  POST_TOOL_USE = 'post_tool_use',
  TOOL_ERROR = 'tool_error',

  // 任务生命周期
  TASK_CREATED = 'task_created',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',

  // 工作流生命周期
  WORKFLOW_STARTED = 'workflow_started',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',

  // Agent生命周期
  AGENT_ACTIVATED = 'agent_activated',
  AGENT_DEACTIVATED = 'agent_deactivated',

  // 会话生命周期
  SESSION_START = 'session_start',
  SESSION_STOP = 'session_stop',
  SESSION_IDLE = 'session_idle',
  SESSION_RESUME = 'session_resume',

  // 总结与清理
  SUMMARIZE = 'summarize',
  CLEANUP = 'cleanup'
}

/**
 * Hook上下文
 */
export interface HookContext {
  sessionId: string
  taskId?: string
  workflowId?: string
  agentCode?: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

/**
 * Hook事件数据
 */
export interface HookEventData {
  type: HookEventType
  context: HookContext
  data?: Record<string, unknown>
}

/**
 * Hook处理器
 */
export type HookHandler = (event: HookEventData) => Promise<void> | void

/**
 * Hook配置
 */
export interface HookConfig {
  name: string
  priority: number // 优先级，数字越大越先执行
  enabled: boolean
  handler: HookHandler
}

/**
 * Hook管理器
 * 负责管理所有Hook的生命周期和执行顺序
 */
export class HookManager extends EventEmitter {
  private static instance: HookManager
  private logger = LoggerService.getInstance().getLogger()
  private hooks: Map<HookEventType, HookConfig[]> = new Map()
  private executionOrder: Map<HookEventType, string[]> = new Map()

  private constructor() {
    super()
    this.setMaxListeners(100) // 支持大量监听器
  }

  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager()
    }
    return HookManager.instance
  }

  /**
   * 注册Hook
   */
  registerHook(eventType: HookEventType, config: HookConfig): void {
    if (!this.hooks.has(eventType)) {
      this.hooks.set(eventType, [])
    }

    const hooks = this.hooks.get(eventType)!
    hooks.push(config)

    // 按优先级排序（降序）
    hooks.sort((a, b) => b.priority - a.priority)

    // 更新执行顺序
    this.executionOrder.set(
      eventType,
      hooks.map(h => h.name)
    )

    this.logger.info('Hook registered', {
      eventType,
      name: config.name,
      priority: config.priority,
      enabled: config.enabled
    })
  }

  /**
   * 批量注册Hook
   */
  registerHooks(hooks: Array<{ eventType: HookEventType; config: HookConfig }>): void {
    for (const { eventType, config } of hooks) {
      this.registerHook(eventType, config)
    }
  }

  /**
   * 注销Hook
   */
  unregisterHook(eventType: HookEventType, name: string): void {
    const hooks = this.hooks.get(eventType)
    if (!hooks) return

    const index = hooks.findIndex(h => h.name === name)
    if (index !== -1) {
      hooks.splice(index, 1)
      this.executionOrder.set(
        eventType,
        hooks.map(h => h.name)
      )
      this.logger.info('Hook unregistered', { eventType, name })
    }
  }

  /**
   * 启用/禁用Hook
   */
  setHookEnabled(eventType: HookEventType, name: string, enabled: boolean): void {
    const hooks = this.hooks.get(eventType)
    if (!hooks) return

    const hook = hooks.find(h => h.name === name)
    if (hook) {
      hook.enabled = enabled
      this.logger.info('Hook enabled status changed', {
        eventType,
        name,
        enabled
      })
    }
  }

  /**
   * 触发Hook
   */
  async triggerHook(eventType: HookEventType, context: HookContext, data?: Record<string, unknown>): Promise<void> {
    const hooks = this.hooks.get(eventType)
    if (!hooks || hooks.length === 0) {
      return
    }

    const event: HookEventData = {
      type: eventType,
      context,
      data
    }

    this.logger.debug('Triggering hooks', {
      eventType,
      hookCount: hooks.length,
      enabledCount: hooks.filter(h => h.enabled).length
    })

    // 按优先级顺序执行所有启用的Hook
    for (const hook of hooks) {
      if (!hook.enabled) continue

      try {
        this.logger.debug('Executing hook', {
          eventType,
          name: hook.name,
          priority: hook.priority
        })

        await hook.handler(event)

        this.logger.debug('Hook executed successfully', {
          eventType,
          name: hook.name
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error('Hook execution failed', {
          eventType,
          name: hook.name,
          error: errorMessage
        })

        // Hook执行失败不应中断整个流程
        // 但可以记录到审计日志
        this.emit('hook:error', {
          eventType,
          hookName: hook.name,
          error: errorMessage,
          context
        })
      }
    }

    // 发出事件通知
    this.emit(eventType, event)
  }

  /**
   * 获取Hook列表
   */
  getHooks(eventType?: HookEventType): Map<HookEventType, HookConfig[]> | HookConfig[] {
    if (eventType) {
      return this.hooks.get(eventType) || []
    }
    return this.hooks
  }

  /**
   * 获取Hook执行顺序
   */
  getExecutionOrder(eventType: HookEventType): string[] {
    return this.executionOrder.get(eventType) || []
  }

  /**
   * 清空所有Hook
   */
  clearAllHooks(): void {
    this.hooks.clear()
    this.executionOrder.clear()
    this.logger.info('All hooks cleared')
  }

  /**
   * 清空特定事件类型的Hook
   */
  clearHooks(eventType: HookEventType): void {
    this.hooks.delete(eventType)
    this.executionOrder.delete(eventType)
    this.logger.info('Hooks cleared for event type', { eventType })
  }
}

/**
 * Hook构建器
 * 提供便捷的Hook注册方法
 */
export class HookBuilder {
  private hooks: Array<{ eventType: HookEventType; config: HookConfig }> = []

  on(eventType: HookEventType, name: string, handler: HookHandler, priority: number = 0): HookBuilder {
    this.hooks.push({
      eventType,
      config: {
        name,
        priority,
        enabled: true,
        handler
      }
    })
    return this
  }

  build(manager: HookManager): void {
    manager.registerHooks(this.hooks)
  }
}
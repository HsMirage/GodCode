/**
 * 上下文窗口监控 Hook
 *
 * 监控 LLM 上下文窗口使用情况，当接近限制时注入提醒
 */

import type { HookConfig, HookContext, ContextOverflowInfo } from './types'

// 上下文窗口限制配置
const CONTEXT_LIMITS: Record<string, number> = {
  'claude-3-opus': 200_000,
  'claude-3-sonnet': 200_000,
  'claude-3-haiku': 200_000,
  'claude-3.5-sonnet': 200_000,
  'claude-3.5-haiku': 200_000,
  'gpt-4': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  default: 128_000
}

// 警告阈值（使用率百分比）
const WARNING_THRESHOLD = 0.7 // 70%
const CRITICAL_THRESHOLD = 0.85 // 85%

// 已提醒的 session 集合
const remindedSessions = new Set<string>()

/**
 * 上下文状态提醒消息
 */
const CONTEXT_REMINDER = `
[CONTEXT WINDOW STATUS]
You are approaching the context window limit. To ensure quality responses:
1. Be more concise in your explanations
2. Avoid repeating information already discussed
3. Focus on completing the current task efficiently
4. Consider suggesting conversation compaction if needed
`

/**
 * 创建上下文窗口监控 Hook
 */
export function createContextWindowMonitorHook(options?: {
  warningThreshold?: number
  criticalThreshold?: number
  customLimits?: Record<string, number>
}): HookConfig<'onContextOverflow'> {
  const warningThreshold = options?.warningThreshold ?? WARNING_THRESHOLD
  const criticalThreshold = options?.criticalThreshold ?? CRITICAL_THRESHOLD
  const limits = { ...CONTEXT_LIMITS, ...options?.customLimits }

  return {
    id: 'context-window-monitor',
    name: 'Context Window Monitor',
    event: 'onContextOverflow',
    description: 'Monitors context window usage and injects reminders when approaching limits',
    priority: 10,

    callback: async (
      context: HookContext,
      info: ContextOverflowInfo
    ): Promise<{ action?: 'compact' | 'warn' | 'ignore'; injection?: string }> => {
      const { sessionId } = context
      const { usagePercentage, currentTokens, maxTokens } = info

      // 如果已经提醒过，避免重复提醒
      if (remindedSessions.has(sessionId)) {
        return { action: 'ignore' }
      }

      // 低于警告阈值，不处理
      if (usagePercentage < warningThreshold) {
        return { action: 'ignore' }
      }

      // 标记已提醒
      remindedSessions.add(sessionId)

      // 构建状态信息
      const usedPct = (usagePercentage * 100).toFixed(1)
      const remainingPct = ((1 - usagePercentage) * 100).toFixed(1)
      const usedTokens = currentTokens.toLocaleString()
      const limitTokens = maxTokens.toLocaleString()

      const statusLine = `[Context: ${usedPct}% used (${usedTokens}/${limitTokens}), ${remainingPct}% remaining]`

      // 超过临界阈值，建议压缩
      if (usagePercentage >= criticalThreshold) {
        return {
          action: 'compact',
          injection: `${CONTEXT_REMINDER}\n${statusLine}\n[CRITICAL: Consider compacting the conversation]`
        }
      }

      // 超过警告阈值，发出警告
      return {
        action: 'warn',
        injection: `${CONTEXT_REMINDER}\n${statusLine}`
      }
    }
  }
}

/**
 * 获取模型的上下文限制
 */
export function getContextLimit(modelId: string): number {
  // 尝试精确匹配
  if (CONTEXT_LIMITS[modelId]) {
    return CONTEXT_LIMITS[modelId]
  }

  // 尝试前缀匹配
  for (const [prefix, limit] of Object.entries(CONTEXT_LIMITS)) {
    if (modelId.startsWith(prefix)) {
      return limit
    }
  }

  return CONTEXT_LIMITS.default
}

/**
 * 计算上下文使用情况
 */
export function calculateContextUsage(
  modelId: string,
  inputTokens: number,
  cacheReadTokens = 0
): ContextOverflowInfo {
  const maxTokens = getContextLimit(modelId)
  const currentTokens = inputTokens + cacheReadTokens
  const usagePercentage = currentTokens / maxTokens

  return {
    currentTokens,
    maxTokens,
    usagePercentage
  }
}

/**
 * 清除 session 的提醒状态
 */
export function clearSessionReminder(sessionId: string): void {
  remindedSessions.delete(sessionId)
}

/**
 * 重置所有 session 的提醒状态
 */
export function clearAllReminders(): void {
  remindedSessions.clear()
}

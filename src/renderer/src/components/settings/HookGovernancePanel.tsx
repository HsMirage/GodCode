import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AuditLogViewer } from './AuditLogViewer'
import type { HookGovernanceDraftItem } from '../../hooks/useHookGovernance'
import type { ContinuationConfigState } from '../../hooks/useContinuationConfig'
import type {
  HookExecutionStatus,
  HookGovernanceAuditRecord,
  HookGovernanceStatus
} from '@shared/hook-governance-contract'

const panelClass = [
  'rounded-2xl border border-[var(--border-primary)]',
  'bg-[var(--bg-secondary)] backdrop-blur',
  'shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_0_24px_rgba(15,23,42,0.35)]'
].join(' ')

const inputClassName =
  'w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40'

const secondaryButtonClassName =
  'inline-flex items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-60'

const primaryButtonClassName =
  'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60'

const HOOK_EVENT_LABEL: Record<string, string> = {
  onToolStart: '工具开始',
  onToolEnd: '工具结束',
  onMessageCreate: '消息创建',
  onContextOverflow: '上下文溢出',
  onEditError: '编辑错误',
  onTaskLifecycle: '任务生命周期'
}

const HOOK_SOURCE_LABEL: Record<string, string> = {
  builtin: '内置',
  'claude-code': 'Claude Code',
  custom: '自定义'
}

const HOOK_SCOPE_LABEL: Record<string, string> = {
  global: '全局',
  workspace: '工作区',
  session: '会话',
  tool: '工具链'
}

const HOOK_STATUS_LABEL: Record<HookExecutionStatus, string> = {
  success: '正常',
  error: '错误',
  timeout: '超时',
  circuit_open: '熔断中'
}

const continuationCards = [
  {
    key: 'countdownSeconds' as const,
    label: '倒计时（秒）',
    helper: '触发自动续跑前等待的秒数，最小为 1。'
  },
  {
    key: 'idleDedupWindowMs' as const,
    label: '去重窗口（毫秒）',
    helper: '短时间内重复触发自动续跑时的抑制窗口。'
  },
  {
    key: 'abortWindowMs' as const,
    label: '中止保护窗口（毫秒）',
    helper: '用户主动中止后，自动续跑保持抑制的时间。'
  }
]

function formatExecutionTimestamp(timestamp: string | Date) {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }
  return parsed.toLocaleString()
}

function summarizeExecutionContext(record: HookGovernanceAuditRecord) {
  if (record.execution.tool) {
    return `tool=${record.execution.tool}${record.execution.callId ? `, callId=${record.execution.callId}` : ''}`
  }
  if (record.execution.messageId) {
    return `message=${record.execution.messageRole ?? 'unknown'}:${record.execution.messageId}`
  }
  if (record.execution.filePath) {
    return `file=${record.execution.filePath}${record.execution.errorType ? `, errorType=${record.execution.errorType}` : ''}`
  }
  if (
    typeof record.execution.currentTokens === 'number' &&
    typeof record.execution.maxTokens === 'number' &&
    typeof record.execution.usagePercentage === 'number'
  ) {
    return `tokens=${record.execution.currentTokens}/${record.execution.maxTokens} (${record.execution.usagePercentage.toFixed(1)}%)`
  }
  return `session=${record.execution.sessionId}`
}

interface HookGovernancePanelProps {
  governance: HookGovernanceStatus | null
  draft: Record<string, HookGovernanceDraftItem>
  loading: boolean
  saving: boolean
  dirty: boolean
  onRefresh: () => void | Promise<void>
  onReset: () => void
  onSave: () => void | Promise<void>
  onDraftChange: (hookId: string, field: keyof HookGovernanceDraftItem, value: number | boolean) => void
  continuationDraft: ContinuationConfigState
  continuationLoading: boolean
  continuationSaving: boolean
  continuationDirty: boolean
  onResetContinuation: () => void
  onSaveContinuation: () => void | Promise<void>
  onContinuationInputChange: (key: keyof ContinuationConfigState, value: string) => void
  onContinuationInputBlur: (key: keyof ContinuationConfigState) => void
}

export function HookGovernancePanel({
  governance,
  draft,
  loading,
  saving,
  dirty,
  onRefresh,
  onReset,
  onSave,
  onDraftChange,
  continuationDraft,
  continuationLoading,
  continuationSaving,
  continuationDirty,
  onResetContinuation,
  onSaveContinuation,
  onContinuationInputChange,
  onContinuationInputBlur
}: HookGovernancePanelProps) {
  const [showHookAuditViewer, setShowHookAuditViewer] = useState(false)

  return (
    <div className={`${panelClass} p-6 space-y-4`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Hook Governance</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Hook 治理统计</h2>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading || continuationLoading || saving}
          className={secondaryButtonClassName}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading || continuationLoading ? 'animate-spin' : ''}`} />
          刷新统计
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">自动续跑策略</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">配置 task-continuation 的倒计时、去重和中止保护窗口。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onResetContinuation}
              disabled={!continuationDirty || continuationSaving}
            >
              重置
            </button>
            <button
              type="button"
              className={primaryButtonClassName}
              onClick={() => void onSaveContinuation()}
              disabled={!continuationDirty || continuationSaving}
            >
              {continuationSaving ? '保存中…' : '保存配置'}
            </button>
          </div>
        </div>

        {continuationLoading ? (
          <div className="rounded-lg border border-dashed border-[var(--border-primary)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            正在加载自动续跑配置…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {continuationCards.map(card => (
              <div
                key={card.key}
                className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-3"
              >
                <label className="text-xs text-[var(--text-secondary)]" htmlFor={`continuation-${card.key}`}>
                  {card.label}
                </label>
                <input
                  id={`continuation-${card.key}`}
                  type="number"
                  min={card.key === 'countdownSeconds' ? 1 : 0}
                  step={1}
                  value={continuationDraft[card.key]}
                  onChange={event => onContinuationInputChange(card.key, event.target.value)}
                  onBlur={() => onContinuationInputBlur(card.key)}
                  className={`${inputClassName} mt-1.5`}
                />
                <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{card.helper}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!governance ? (
        <div className="rounded-xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-8 text-sm text-[var(--text-muted)] text-center">
          {loading ? '正在加载 Hook 统计…' : '暂无 Hook 治理数据'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-muted)]">总 Hook</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{governance.stats.total}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-muted)]">启用</p>
              <p className="mt-1 text-lg font-semibold text-emerald-500">{governance.stats.enabled}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-muted)]">禁用</p>
              <p className="mt-1 text-lg font-semibold text-amber-500">{governance.stats.disabled}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-muted)]">总执行次数</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{governance.stats.totalExecutions}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-muted)]">总错误次数</p>
              <p className="mt-1 text-lg font-semibold text-rose-500">{governance.stats.totalErrors}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <p className="text-[11px] text-[var(--text-muted)]">初始化状态</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                {governance.initialized ? '已初始化' : '未初始化'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">按事件分布</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(governance.stats.byEvent).map(([event, count]) => (
                <div key={event} className="rounded-lg bg-[var(--bg-tertiary)] px-2.5 py-2">
                  <p className="text-[11px] text-[var(--text-muted)]">{HOOK_EVENT_LABEL[event] || event}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-2">
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)]">默认 Hook 与治理策略说明</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                内置 Hook 在应用启动时注册；Claude Code Hook 按工作区配置接入。当前面板支持统一治理开关、优先级、超时、熔断阈值与冷却窗口，并展示最近运行态与审计证据。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">来源: 内置 / Claude Code / 自定义</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">范围: 全局 / 工作区 / 会话 / 工具链</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">策略: timeout / failureThreshold / cooldown</span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">Hook 明细</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  onClick={onReset}
                  disabled={!dirty || saving}
                >
                  重置
                </button>
                <button
                  type="button"
                  className={primaryButtonClassName}
                  onClick={() => void onSave()}
                  disabled={!dirty || saving}
                >
                  {saving ? '保存中…' : '保存 Hook 策略'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {governance.hooks.map(hook => {
                const hookDraft = draft[hook.id] ?? {
                  enabled: hook.enabled,
                  priority: hook.priority,
                  timeoutMs: hook.strategy.timeoutMs,
                  failureThreshold: hook.strategy.failureThreshold,
                  cooldownMs: hook.strategy.cooldownMs
                }

                const runtimeStatus = hook.runtime.lastStatus
                  ? HOOK_STATUS_LABEL[hook.runtime.lastStatus] || hook.runtime.lastStatus
                  : '暂无执行'

                return (
                  <div
                    key={hook.id}
                    className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">{hook.name}</p>
                        {hook.description ? (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{hook.description}</p>
                        ) : null}
                      </div>
                      <span
                        className={`text-[11px] rounded px-2 py-0.5 ${hookDraft.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}
                      >
                        {hookDraft.enabled ? '启用' : '禁用'}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                      <label className="flex items-center justify-between rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                        <span>启用状态</span>
                        <input
                          type="checkbox"
                          checked={hookDraft.enabled}
                          onChange={event => onDraftChange(hook.id, 'enabled', event.target.checked)}
                          disabled={saving}
                        />
                      </label>

                      <label className="rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                        <span>优先级（越小越先执行）</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={hookDraft.priority}
                          onChange={event => {
                            const parsed = Number(event.target.value)
                            if (Number.isFinite(parsed)) {
                              onDraftChange(hook.id, 'priority', Math.max(1, Math.floor(parsed)))
                            }
                          }}
                          disabled={saving}
                          className={`${inputClassName} mt-1.5`}
                        />
                      </label>

                      <label className="rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                        <span>超时（ms）</span>
                        <input
                          type="number"
                          min={1}
                          step={100}
                          value={hookDraft.timeoutMs}
                          onChange={event => {
                            const parsed = Number(event.target.value)
                            if (Number.isFinite(parsed)) {
                              onDraftChange(hook.id, 'timeoutMs', Math.max(1, Math.floor(parsed)))
                            }
                          }}
                          disabled={saving}
                          className={`${inputClassName} mt-1.5`}
                        />
                      </label>

                      <label className="rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                        <span>熔断阈值</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={hookDraft.failureThreshold}
                          onChange={event => {
                            const parsed = Number(event.target.value)
                            if (Number.isFinite(parsed)) {
                              onDraftChange(hook.id, 'failureThreshold', Math.max(1, Math.floor(parsed)))
                            }
                          }}
                          disabled={saving}
                          className={`${inputClassName} mt-1.5`}
                        />
                      </label>

                      <label className="rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                        <span>冷却窗口（ms）</span>
                        <input
                          type="number"
                          min={1}
                          step={1000}
                          value={hookDraft.cooldownMs}
                          onChange={event => {
                            const parsed = Number(event.target.value)
                            if (Number.isFinite(parsed)) {
                              onDraftChange(hook.id, 'cooldownMs', Math.max(1, Math.floor(parsed)))
                            }
                          }}
                          disabled={saving}
                          className={`${inputClassName} mt-1.5`}
                        />
                      </label>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">来源: {HOOK_SOURCE_LABEL[hook.source] || hook.source}</span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">范围: {HOOK_SCOPE_LABEL[hook.scope] || hook.scope}</span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">最近状态: {runtimeStatus}</span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">连续失败: {hook.runtime.consecutiveFailures}</span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">执行次数: {hook.audit.executionCount}</span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">错误次数: {hook.audit.errorCount}</span>
                      {hook.runtime.lastDurationMs !== undefined ? (
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">最近耗时: {hook.runtime.lastDurationMs}ms</span>
                      ) : null}
                      {hook.runtime.lastExecutedAt ? (
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                          最近执行: {formatExecutionTimestamp(hook.runtime.lastExecutedAt)}
                        </span>
                      ) : null}
                      {hook.runtime.circuitState === 'open' ? (
                        <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
                          熔断中{hook.runtime.circuitOpenUntil ? `（至 ${formatExecutionTimestamp(hook.runtime.circuitOpenUntil)}）` : ''}
                        </span>
                      ) : null}
                    </div>
                    {hook.runtime.lastError ? (
                      <p className="mt-2 text-xs text-rose-400">最近错误: {hook.runtime.lastError}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Hook 审计</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">展示最近 Hook 执行证据，并支持切换到完整审计查询。</p>
              </div>
              <button
                type="button"
                className={secondaryButtonClassName}
                onClick={() => setShowHookAuditViewer(value => !value)}
              >
                {showHookAuditViewer ? '隐藏审计查询' : '显示审计查询'}
              </button>
            </div>

            {showHookAuditViewer ? (
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
                <AuditLogViewer defaultActionFilter="hook:execution" />
              </div>
            ) : null}

            {governance.recentExecutions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border-primary)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                暂无 Hook 审计记录
              </div>
            ) : (
              <div className="space-y-2">
                {governance.recentExecutions.slice(0, 12).map(record => (
                  <div
                    key={record.id}
                    className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <span>{formatExecutionTimestamp(record.timestamp)}</span>
                      <span>Hook: {record.strategy.hookName}</span>
                      <span>事件: {HOOK_EVENT_LABEL[record.strategy.event] || record.strategy.event}</span>
                      <span>策略: timeout={record.strategy.timeoutMs} / fail={record.strategy.failureThreshold}</span>
                    </div>

                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      <span className="font-medium">上下文：</span>
                      <span>{summarizeExecutionContext(record)}</span>
                    </div>

                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      <span className="font-medium">结果：</span>
                      <span className={record.result.success ? 'text-emerald-500' : 'text-rose-500'}>
                        {record.result.success ? '成功' : '失败'}
                      </span>
                      {record.result.status ? (
                        <span className="ml-2">
                          状态: {HOOK_STATUS_LABEL[record.result.status] || record.result.status}
                        </span>
                      ) : null}
                      {record.result.degraded ? <span className="ml-2 text-amber-500">已降级</span> : null}
                      <span className="ml-2">耗时 {record.result.duration}ms</span>
                      {record.result.circuitOpenUntil ? (
                        <span className="ml-2">
                          熔断至: {formatExecutionTimestamp(record.result.circuitOpenUntil)}
                        </span>
                      ) : null}
                      {record.result.error ? <span className="ml-2">错误: {record.result.error}</span> : null}
                      {!record.result.error && record.result.returnValuePreview ? (
                        <span className="ml-2">返回: {record.result.returnValuePreview}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

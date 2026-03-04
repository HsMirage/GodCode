import { useEffect, useState } from 'react'
import { ProviderModelPanel } from '../components/settings/ProviderModelPanel'
import { AgentBindingPanel } from '../components/settings/AgentBindingPanel'
import { useConfigStore } from '../store/config.store'
import { DataManagement } from '../components/settings/DataManagement'
import { AuditLogViewer } from '../components/settings/AuditLogViewer'
import { Key, Bot, Database, Check, AlertTriangle, Shield, RefreshCw } from 'lucide-react'

const panelClass = [
  'rounded-2xl border border-[var(--border-primary)]',
  'bg-[var(--bg-secondary)] backdrop-blur',
  'shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_0_24px_rgba(15,23,42,0.35)]'
].join(' ')

const TABS = [
  { id: 'provider', label: 'API服务商', icon: Key },
  { id: 'agent', label: '智能体', icon: Bot },
  { id: 'hook', label: 'Hook治理', icon: Shield },
  { id: 'data', label: '数据管理', icon: Database }
]

interface HookExecutionRecord {
  id: string
  timestamp: string | Date
  strategy: {
    hookId: string
    hookName: string
    event: string
    priority: number
    enabled: boolean
  }
  execution: {
    sessionId: string
    workspaceDir: string
    userId?: string
    tool?: string
    callId?: string
    messageId?: string
    messageRole?: 'user' | 'assistant' | 'system'
    currentTokens?: number
    maxTokens?: number
    usagePercentage?: number
    filePath?: string
    errorType?: 'not_found' | 'multiple_matches' | 'same_content' | 'unknown'
  }
  result: {
    success: boolean
    duration: number
    status?: 'success' | 'error' | 'timeout' | 'circuit_open'
    degraded?: boolean
    error?: string
    returnValuePreview?: string
    circuitOpenUntil?: string | Date
  }
}

interface HookGovernanceState {
  initialized: boolean
  stats: {
    total: number
    enabled: number
    disabled: number
    byEvent: Record<string, number>
    totalExecutions: number
    totalErrors: number
  }
  hooks: Array<{
    id: string
    name: string
    event: string
    enabled: boolean
    priority: number
    executionCount: number
    errorCount: number
  }>
  recentExecutions: HookExecutionRecord[]
}

interface TaskContinuationConfigState {
  countdownSeconds: number
  idleDedupWindowMs: number
  abortWindowMs: number
}

interface HookGovernanceDraftItem {
  enabled: boolean
  priority: number
}

const DEFAULT_TASK_CONTINUATION_CONFIG: TaskContinuationConfigState = {
  countdownSeconds: 2,
  idleDedupWindowMs: 500,
  abortWindowMs: 3000
}

const HOOK_EVENT_LABEL: Record<string, string> = {
  onToolStart: '工具开始',
  onToolEnd: '工具结束',
  onMessageCreate: '消息创建',
  onContextOverflow: '上下文溢出',
  onEditError: '编辑错误'
}


export function SettingsPage() {
  const { loadModels } = useConfigStore()
  const [activeTab, setActiveTab] = useState<'provider' | 'agent' | 'hook' | 'data'>('provider')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hookLoading, setHookLoading] = useState(false)
  const [hookGovernance, setHookGovernance] = useState<HookGovernanceState | null>(null)
  const [hookDraft, setHookDraft] = useState<Record<string, HookGovernanceDraftItem>>({})
  const [hookSaving, setHookSaving] = useState(false)
  const [showHookAuditViewer, setShowHookAuditViewer] = useState(false)
  const [continuationConfigLoading, setContinuationConfigLoading] = useState(false)
  const [continuationConfigSaving, setContinuationConfigSaving] = useState(false)
  const [continuationConfig, setContinuationConfig] =
    useState<TaskContinuationConfigState>(DEFAULT_TASK_CONTINUATION_CONFIG)
  const [continuationDraft, setContinuationDraft] =
    useState<TaskContinuationConfigState>(DEFAULT_TASK_CONTINUATION_CONFIG)

  const continuationConfigDirty =
    continuationDraft.countdownSeconds !== continuationConfig.countdownSeconds ||
    continuationDraft.idleDedupWindowMs !== continuationConfig.idleDedupWindowMs ||
    continuationDraft.abortWindowMs !== continuationConfig.abortWindowMs

  const normalizeNonNegativeInt = (value: number, fallback: number) => {
    if (!Number.isFinite(value)) {
      return fallback
    }
    return Math.max(0, Math.floor(value))
  }

  const normalizeContinuationConfig = (
    value: Partial<TaskContinuationConfigState> | null | undefined,
    fallback: TaskContinuationConfigState
  ): TaskContinuationConfigState => {
    const countdown = normalizeNonNegativeInt(value?.countdownSeconds ?? fallback.countdownSeconds, fallback.countdownSeconds)
    return {
      countdownSeconds: Math.max(1, countdown),
      idleDedupWindowMs: normalizeNonNegativeInt(
        value?.idleDedupWindowMs ?? fallback.idleDedupWindowMs,
        fallback.idleDedupWindowMs
      ),
      abortWindowMs: normalizeNonNegativeInt(value?.abortWindowMs ?? fallback.abortWindowMs, fallback.abortWindowMs)
    }
  }

  const loadHookGovernance = async () => {
    if (!window.codeall) {
      return
    }

    try {
      setHookLoading(true)
      const result = (await window.codeall.invoke('hook-governance:get')) as HookGovernanceState
      setHookGovernance(result)
      setHookDraft(
        result.hooks.reduce<Record<string, HookGovernanceDraftItem>>((acc, hook) => {
          acc[hook.id] = {
            enabled: hook.enabled,
            priority: hook.priority
          }
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Failed to load hook governance:', error)
      setToast({ type: 'error', text: '加载 Hook 治理统计失败' })
    } finally {
      setHookLoading(false)
    }
  }

  const loadContinuationConfig = async () => {
    if (!window.codeall) {
      return
    }

    try {
      setContinuationConfigLoading(true)
      const result = await window.codeall.invoke('task-continuation:get-config')
      const parsed = result as {
        success: boolean
        data?: Partial<TaskContinuationConfigState>
      }
      const normalized = normalizeContinuationConfig(
        parsed.success ? parsed.data : undefined,
        DEFAULT_TASK_CONTINUATION_CONFIG
      )
      setContinuationConfig(normalized)
      setContinuationDraft(normalized)
    } catch (error) {
      console.error('Failed to load continuation config:', error)
      setToast({ type: 'error', text: '加载自动续跑配置失败' })
    } finally {
      setContinuationConfigLoading(false)
    }
  }

  const saveContinuationConfig = async () => {
    if (!window.codeall) {
      return
    }

    try {
      setContinuationConfigSaving(true)
      const payload = normalizeContinuationConfig(continuationDraft, continuationConfig)
      const result = await window.codeall.invoke('task-continuation:set-config', payload)
      const parsed = result as {
        success: boolean
        data?: Partial<TaskContinuationConfigState>
      }
      const normalized = normalizeContinuationConfig(
        parsed.success ? parsed.data : payload,
        payload
      )
      setContinuationConfig(normalized)
      setContinuationDraft(normalized)
      setToast({ type: 'success', text: '自动续跑配置已保存' })
    } catch (error) {
      console.error('Failed to save continuation config:', error)
      setToast({ type: 'error', text: '保存自动续跑配置失败' })
    } finally {
      setContinuationConfigSaving(false)
    }
  }

  const resetContinuationDraft = () => {
    setContinuationDraft(continuationConfig)
  }

  const updateContinuationDraft = (key: keyof TaskContinuationConfigState, value: number) => {
    setContinuationDraft(prev => {
      const base = normalizeContinuationConfig(prev, continuationConfig)
      const nextValue = normalizeNonNegativeInt(value, base[key])
      return {
        ...base,
        [key]: key === 'countdownSeconds' ? Math.max(1, nextValue) : nextValue
      }
    })
  }

  const handleContinuationInputChange = (key: keyof TaskContinuationConfigState, raw: string) => {
    if (raw.trim() === '') {
      updateContinuationDraft(key, continuationConfig[key])
      return
    }

    const value = Number(raw)
    if (Number.isNaN(value)) {
      return
    }

    updateContinuationDraft(key, value)
  }

  const handleContinuationInputBlur = (key: keyof TaskContinuationConfigState) => {
    updateContinuationDraft(key, continuationDraft[key])
  }

  const inputClassName =
    'w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40'

  const secondaryButtonClassName =
    'inline-flex items-center gap-2 rounded-lg border border-[var(--border-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-60'

  const primaryButtonClassName =
    'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60'

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

  const formatExecutionTimestamp = (timestamp: string | Date) => {
    const parsed = new Date(timestamp)
    if (Number.isNaN(parsed.getTime())) {
      return '-'
    }
    return parsed.toLocaleString()
  }

  const appendRecentExecution = (record: HookExecutionRecord) => {
    setHookGovernance(prev => {
      if (!prev) {
        return prev
      }
      const next = [record, ...prev.recentExecutions.filter(item => item.id !== record.id)].slice(0, 50)
      return {
        ...prev,
        recentExecutions: next
      }
    })
  }

  const summarizeExecutionContext = (record: HookExecutionRecord) => {
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

  const hookGovernanceDirty =
    hookGovernance?.hooks.some(hook => {
      const draft = hookDraft[hook.id]
      if (!draft) {
        return false
      }

      return draft.enabled !== hook.enabled || draft.priority !== hook.priority
    }) ?? false

  const updateHookDraftEnabled = (hookId: string, enabled: boolean) => {
    setHookDraft(prev => {
      const current = prev[hookId]
      if (!current) {
        return prev
      }

      return {
        ...prev,
        [hookId]: {
          ...current,
          enabled
        }
      }
    })
  }

  const updateHookDraftPriority = (hookId: string, raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return
    }

    setHookDraft(prev => {
      const current = prev[hookId]
      if (!current) {
        return prev
      }

      return {
        ...prev,
        [hookId]: {
          ...current,
          priority: Math.max(1, Math.floor(parsed))
        }
      }
    })
  }

  const resetHookDraft = () => {
    if (!hookGovernance) {
      return
    }

    setHookDraft(
      hookGovernance.hooks.reduce<Record<string, HookGovernanceDraftItem>>((acc, hook) => {
        acc[hook.id] = {
          enabled: hook.enabled,
          priority: hook.priority
        }
        return acc
      }, {})
    )
  }

  const saveHookGovernance = async () => {
    if (!window.codeall || !hookGovernance) {
      return
    }

    const payload = {
      hooks: hookGovernance.hooks
        .map(hook => {
          const draft = hookDraft[hook.id]
          if (!draft) {
            return null
          }

          if (draft.enabled === hook.enabled && draft.priority === hook.priority) {
            return null
          }

          return {
            id: hook.id,
            enabled: draft.enabled,
            priority: draft.priority
          }
        })
        .filter(
          (item): item is { id: string; enabled: boolean; priority: number } => item !== null
        )
    }

    if (payload.hooks.length === 0) {
      return
    }

    try {
      setHookSaving(true)
      const result = await window.codeall.invoke('hook-governance:set', payload)
      const parsed = result as {
        success: boolean
        status: HookGovernanceState
      }

      if (!parsed.success) {
        setToast({ type: 'error', text: '保存 Hook 策略失败' })
        return
      }

      setHookGovernance(parsed.status)
      setHookDraft(
        parsed.status.hooks.reduce<Record<string, HookGovernanceDraftItem>>((acc, hook) => {
          acc[hook.id] = {
            enabled: hook.enabled,
            priority: hook.priority
          }
          return acc
        }, {})
      )
      setToast({ type: 'success', text: 'Hook 策略已保存' })
    } catch (error) {
      console.error('Failed to save hook governance:', error)
      setToast({ type: 'error', text: '保存 Hook 策略失败' })
    } finally {
      setHookSaving(false)
    }
  }

  const refreshingHookGovernance = async () => {
    await loadHookGovernance()
    await loadContinuationConfig()
  }

  const renderHookGovernancePanel = () => {
    const currentHookGovernance = hookGovernance

    return (
      <div className={`${panelClass} p-6 space-y-4`}>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Hook Governance</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Hook 治理统计</h2>
          </div>
          <button
            type="button"
            onClick={refreshingHookGovernance}
            disabled={hookLoading || continuationConfigLoading || hookSaving}
            className={secondaryButtonClassName}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${hookLoading || continuationConfigLoading ? 'animate-spin' : ''}`}
            />
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
                onClick={resetContinuationDraft}
                disabled={!continuationConfigDirty || continuationConfigSaving}
              >
                重置
              </button>
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={saveContinuationConfig}
                disabled={!continuationConfigDirty || continuationConfigSaving}
              >
                {continuationConfigSaving ? '保存中…' : '保存配置'}
              </button>
            </div>
          </div>

          {continuationConfigLoading ? (
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
                    onChange={event => handleContinuationInputChange(card.key, event.target.value)}
                    onBlur={() => handleContinuationInputBlur(card.key)}
                    className={`${inputClassName} mt-1.5`}
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{card.helper}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {!currentHookGovernance ? (
          <div className="rounded-xl border border-dashed border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-8 text-sm text-[var(--text-muted)] text-center">
            {hookLoading ? '正在加载 Hook 统计…' : '暂无 Hook 治理数据'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">总 Hook</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{currentHookGovernance.stats.total}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">启用</p>
                <p className="mt-1 text-lg font-semibold text-emerald-500">{currentHookGovernance.stats.enabled}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">禁用</p>
                <p className="mt-1 text-lg font-semibold text-amber-500">{currentHookGovernance.stats.disabled}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">总执行次数</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{currentHookGovernance.stats.totalExecutions}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">总错误次数</p>
                <p className="mt-1 text-lg font-semibold text-rose-500">{currentHookGovernance.stats.totalErrors}</p>
              </div>
              <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-[11px] text-[var(--text-muted)]">初始化状态</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {currentHookGovernance.initialized ? '已初始化' : '未初始化'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">按事件分布</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(currentHookGovernance.stats.byEvent).map(([event, count]) => (
                  <div key={event} className="rounded-lg bg-[var(--bg-tertiary)] px-2.5 py-2">
                    <p className="text-[11px] text-[var(--text-muted)]">{HOOK_EVENT_LABEL[event] || event}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Hook 明细</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={resetHookDraft}
                    disabled={!hookGovernanceDirty || hookSaving}
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    className={primaryButtonClassName}
                    onClick={saveHookGovernance}
                    disabled={!hookGovernanceDirty || hookSaving}
                  >
                    {hookSaving ? '保存中…' : '保存 Hook 策略'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {currentHookGovernance.hooks.map(hook => {
                  const draft = hookDraft[hook.id] ?? {
                    enabled: hook.enabled,
                    priority: hook.priority
                  }

                  return (
                    <div
                      key={hook.id}
                      className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-[var(--text-primary)] font-medium">{hook.name}</p>
                        <span
                          className={`text-[11px] rounded px-2 py-0.5 ${draft.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}
                        >
                          {draft.enabled ? '启用' : '禁用'}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="flex items-center justify-between rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                          <span>启用状态</span>
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={event => updateHookDraftEnabled(hook.id, event.target.checked)}
                            disabled={hookSaving}
                          />
                        </label>

                        <label className="rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                          <span>优先级（越小越先执行）</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draft.priority}
                            onChange={event => updateHookDraftPriority(hook.id, event.target.value)}
                            disabled={hookSaving}
                            className={`${inputClassName} mt-1.5`}
                          />
                        </label>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                          事件: {HOOK_EVENT_LABEL[hook.event] || hook.event}
                        </span>
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">执行: {hook.executionCount}</span>
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">错误: {hook.errorCount}</span>
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">ID: {hook.id}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">最近执行证据链</h3>
                  <span className="text-xs text-[var(--text-muted)]">策略 → 执行 → 结果（含实时追加）</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() => setShowHookAuditViewer(prev => !prev)}
                  >
                    {showHookAuditViewer ? '隐藏审计查询' : '显示审计查询'}
                  </button>
                </div>
              </div>

              {showHookAuditViewer ? (
                <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
                  <AuditLogViewer defaultActionFilter="hook:execution" />
                </div>
              ) : null}

              {currentHookGovernance.recentExecutions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border-primary)] px-3 py-4 text-xs text-[var(--text-muted)]">
                  暂无执行记录，请先触发一次 Hook 执行。
                </div>
              ) : (
                <div className="space-y-2">
                  {currentHookGovernance.recentExecutions.map(record => (
                    <div
                      key={record.id}
                      className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                          时间: {formatExecutionTimestamp(record.timestamp)}
                        </span>
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                          策略: {record.strategy.hookName} ({record.strategy.hookId})
                        </span>
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                          事件: {HOOK_EVENT_LABEL[record.strategy.event] || record.strategy.event}
                        </span>
                        <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">优先级: {record.strategy.priority}</span>
                      </div>

                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        <span className="font-medium">执行：</span>
                        <span>{summarizeExecutionContext(record)}</span>
                      </div>

                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        <span className="font-medium">结果：</span>
                        <span className={record.result.success ? 'text-emerald-500' : 'text-rose-500'}>
                          {record.result.success ? '成功' : '失败'}
                        </span>
                        {record.result.status ? <span className="ml-2">状态: {record.result.status}</span> : null}
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

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
    return
  }, [toast])

  useEffect(() => {
    if (!window.codeall) {
      return
    }

    const unsubscribe = window.codeall.on('hook-audit:appended', payload => {
      const data = payload as { record?: HookExecutionRecord }
      if (data.record) {
        appendRecentExecution({
          ...data.record,
          timestamp: new Date(data.record.timestamp)
        })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    async function fetchModels() {
      // Skip if not running in Electron environment
      if (!window.codeall) {
        console.warn('[SettingsPage] window.codeall not available')
        return
      }
      try {
        const data = (await window.codeall.invoke('model:list')) as any[]
        loadModels(data)
      } catch (error) {
        console.error('Failed to load models:', error)
      }
    }

    fetchModels()
    loadHookGovernance()
    loadContinuationConfig()
  }, [loadModels])

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">设置</h1>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={[
            'flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2',
            toast.type === 'success'
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400'
              : 'border border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-400'
          ].join(' ')}
        >
          {toast.type === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      )}

      <div className={`${panelClass} p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as 'provider' | 'agent' | 'hook' | 'data')}
                className={[
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  'border border-transparent',
                  tab.id === activeTab
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[0_10px_30px_rgba(0,0,0,0.10)] dark:shadow-[0_10px_30px_rgba(15,23,42,0.45)]'
                    : 'text-[var(--text-secondary)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                ].join(' ')}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'provider' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Provider & Models</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">API服务商</h2>
            </div>
            <div className="text-right text-xs text-[var(--text-muted)]">配置 OpenAI 兼容的服务商及模型</div>
          </div>
          <ProviderModelPanel />
        </div>
      ) : null}

      {activeTab === 'agent' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Agent Studio</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">智能体配置</h2>
          </div>
          <AgentBindingPanel />
        </div>
      ) : null}

      {activeTab === 'hook' ? renderHookGovernancePanel() : null}

      {activeTab === 'data' ? <DataManagement /> : null}
    </div>
  )
}

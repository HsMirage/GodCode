import { useCallback, useEffect, useState } from 'react'
import { Key, Bot, Database, Check, AlertTriangle, Shield } from 'lucide-react'
import { settingsApi } from '../api'
import { ProviderModelPanel } from '../components/settings/ProviderModelPanel'
import { AgentBindingPanel } from '../components/settings/AgentBindingPanel'
import { DataManagement } from '../components/settings/DataManagement'
import { HookGovernancePanel } from '../components/settings/HookGovernancePanel'
import { useContinuationConfig } from '../hooks/useContinuationConfig'
import { useHookGovernance } from '../hooks/useHookGovernance'
import { useConfigStore } from '../store/config.store'

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
] as const

type SettingsTab = (typeof TABS)[number]['id']

export function SettingsPage() {
  const { loadModels } = useConfigStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('provider')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const hookGovernance = useHookGovernance()
  const continuationConfig = useContinuationConfig()
  const {
    governance,
    draft,
    loading: hookGovernanceLoading,
    saving: hookGovernanceSaving,
    hookGovernanceDirty,
    load: loadHookGovernance,
    save: saveHookGovernanceDraft,
    resetDraft,
    updateDraft
  } = hookGovernance
  const {
    draft: continuationDraft,
    loading: continuationLoading,
    saving: continuationSaving,
    isDirty: continuationDirty,
    load: loadContinuationConfig,
    save: saveContinuationConfig,
    reset: resetContinuation,
    handleInputChange,
    handleInputBlur
  } = continuationConfig

  const loadModelsFromMain = useCallback(async () => {
    try {
      const data = await settingsApi.modelList()
      loadModels(data)
    } catch (error) {
      console.error('Failed to load models:', error)
      setToast({ type: 'error', text: '加载模型列表失败' })
    }
  }, [loadModels])

  const refreshHookSettings = useCallback(async () => {
    try {
      await Promise.all([loadHookGovernance(), loadContinuationConfig()])
    } catch (error) {
      console.error('Failed to refresh hook settings:', error)
      setToast({ type: 'error', text: '加载 Hook 治理统计失败' })
    }
  }, [loadContinuationConfig, loadHookGovernance])

  const saveHookGovernance = useCallback(async () => {
    try {
      await saveHookGovernanceDraft()
      setToast({ type: 'success', text: 'Hook 策略已保存' })
    } catch (error) {
      console.error('Failed to save hook governance:', error)
      setToast({ type: 'error', text: '保存 Hook 策略失败' })
    }
  }, [saveHookGovernanceDraft])

  const saveContinuation = useCallback(async () => {
    try {
      await saveContinuationConfig()
      setToast({ type: 'success', text: '自动续跑配置已保存' })
    } catch (error) {
      console.error('Failed to save continuation config:', error)
      setToast({ type: 'error', text: '保存自动续跑配置失败' })
    }
  }, [saveContinuationConfig])

  useEffect(() => {
    void loadModelsFromMain()
    void refreshHookSettings()
  }, [loadModelsFromMain, refreshHookSettings])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  return (
    <div className="px-6 py-4 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">设置</h1>
      </div>

      {toast ? (
        <div
          className={[
            'flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2',
            toast.type === 'success'
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400'
              : 'border border-rose-500/20 bg-rose-500/10 text-rose-800 dark:text-rose-400'
          ].join(' ')}
        >
          {toast.type === 'success' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.text}
        </div>
      ) : null}

      <div className={`${panelClass} p-2`}>
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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

      {activeTab === 'hook' ? (
        <HookGovernancePanel
          governance={governance}
          draft={draft}
          loading={hookGovernanceLoading}
          saving={hookGovernanceSaving}
          dirty={hookGovernanceDirty}
          onRefresh={refreshHookSettings}
          onReset={resetDraft}
          onSave={saveHookGovernance}
          onDraftChange={updateDraft}
          continuationDraft={continuationDraft}
          continuationLoading={continuationLoading}
          continuationSaving={continuationSaving}
          continuationDirty={continuationDirty}
          onResetContinuation={resetContinuation}
          onSaveContinuation={saveContinuation}
          onContinuationInputChange={handleInputChange}
          onContinuationInputBlur={handleInputBlur}
        />
      ) : null}

      {activeTab === 'data' ? <DataManagement /> : null}
    </div>
  )
}

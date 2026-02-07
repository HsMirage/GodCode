import { useEffect, useState } from 'react'
import { ProviderModelPanel } from '../components/settings/ProviderModelPanel'
import { AgentBindingPanel } from '../components/settings/AgentBindingPanel'
import { useConfigStore } from '../store/config.store'
import { DataManagement } from '../components/settings/DataManagement'
import { Key, Bot, Database, Check, AlertTriangle } from 'lucide-react'

const panelClass = [
  'rounded-2xl border border-slate-800/70',
  'bg-slate-950/70 backdrop-blur',
  'shadow-[0_0_24px_rgba(15,23,42,0.35)]'
].join(' ')

const TABS = [
  { id: 'provider', label: 'API服务商', icon: Key },
  { id: 'agent', label: '智能体', icon: Bot },
  { id: 'data', label: '数据管理', icon: Database }
]

export function SettingsPage() {
  const { loadModels } = useConfigStore()
  const [activeTab, setActiveTab] = useState<'provider' | 'agent' | 'data'>('provider')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
    return
  }, [toast])

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
  }, [loadModels])

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-white">设置</h1>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={[
            'flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2',
            toast.type === 'success'
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
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
                onClick={() => setActiveTab(tab.id as 'provider' | 'agent' | 'data')}
                className={[
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  'border border-transparent',
                  tab.id === activeTab
                    ? 'bg-slate-900/80 text-white shadow-[0_10px_30px_rgba(15,23,42,0.45)]'
                    : 'text-slate-300 hover:border-slate-700/70 hover:text-white'
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider & Models</p>
              <h2 className="mt-2 text-xl font-semibold text-white">API服务商</h2>
            </div>
            <div className="text-right text-xs text-slate-500">配置 OpenAI 兼容的服务商及模型</div>
          </div>
          <ProviderModelPanel />
        </div>
      ) : null}

      {activeTab === 'agent' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Agent Studio</p>
            <h2 className="mt-2 text-xl font-semibold text-white">智能体配置</h2>
          </div>
          <AgentBindingPanel />
        </div>
      ) : null}

      {activeTab === 'data' ? <DataManagement /> : null}
    </div>
  )
}

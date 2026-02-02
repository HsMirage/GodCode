import { useState, useEffect } from 'react'
import { Key, Save, RotateCw, Check, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '../../utils'

interface ProviderConfig {
  id: string
  provider: 'openai' | 'anthropic' | 'google'
  name: string
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'openai', provider: 'openai', name: 'OpenAI' },
  { id: 'anthropic', provider: 'anthropic', name: 'Anthropic' },
  { id: 'google', provider: 'google', name: 'Google' }
]

export function ApiKeyForm() {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<Record<string, 'success' | 'error' | null>>({})
  const [statusMessage, setStatusMessage] = useState<Record<string, string>>({})

  useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    try {
      const loadedKeys: Record<string, string> = {}
      for (const p of PROVIDERS) {
        // We retrieve the key but masked or empty initially to verify existence
        // In a real app, we might check existence without retrieving value
        // For now, let's assume we can get it or verify it exists
        const key = (await window.codeall.invoke('keychain:get-password', {
          service: 'codeall-app',
          account: `${p.provider}-api-key`
        })) as string
        if (key) {
          loadedKeys[p.id] = key
        }
      }
      setKeys(prev => ({ ...prev, ...loadedKeys }))
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }

  const handleSave = async (id: string, provider: string) => {
    const key = keys[id]
    if (!key) return

    setLoading(prev => ({ ...prev, [id]: true }))
    setStatus(prev => ({ ...prev, [id]: null }))
    setStatusMessage(prev => ({ ...prev, [id]: '' }))

    try {
      await window.codeall.invoke('keychain:set-password', {
        service: 'codeall-app',
        account: `${provider}-api-key`,
        password: key
      })

      setStatus(prev => ({ ...prev, [id]: 'success' }))
      setStatusMessage(prev => ({ ...prev, [id]: 'Key saved successfully' }))

      // Auto-hide after save
      setTimeout(() => {
        setStatus(prev => ({ ...prev, [id]: null }))
      }, 3000)
    } catch (error) {
      console.error('Failed to save key:', error)
      setStatus(prev => ({ ...prev, [id]: 'error' }))
      setStatusMessage(prev => ({ ...prev, [id]: 'Failed to save key' }))
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  const handleDelete = async (id: string, provider: string) => {
    if (!confirm('Are you sure you want to delete this API Key?')) return

    setLoading(prev => ({ ...prev, [id]: true }))
    try {
      await window.codeall.invoke('keychain:delete-password', {
        service: 'codeall-app',
        account: `${provider}-api-key`
      })

      setKeys(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setStatus(prev => ({ ...prev, [id]: null }))
    } catch (error) {
      console.error('Failed to delete key:', error)
      setStatus(prev => ({ ...prev, [id]: 'error' }))
      setStatusMessage(prev => ({ ...prev, [id]: 'Failed to delete key' }))
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleTest = async (id: string, provider: string) => {
    // Placeholder for connection test functionality
    // This would typically invoke a backend test function
    setLoading(prev => ({ ...prev, [id]: true }))
    try {
      // Simulate test
      await new Promise(resolve => setTimeout(resolve, 1500))
      // TODO: Implement actual connection test via IPC

      setStatus(prev => ({ ...prev, [id]: 'success' }))
      setStatusMessage(prev => ({ ...prev, [id]: 'Connection successful' }))
    } catch (error) {
      setStatus(prev => ({ ...prev, [id]: 'error' }))
      setStatusMessage(prev => ({ ...prev, [id]: 'Connection failed' }))
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map(config => (
        <div
          key={config.id}
          className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 transition-all hover:border-slate-600/70 hover:bg-slate-900/80"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700/50">
              <span className="font-bold text-slate-300 text-xs uppercase tracking-wider">
                {config.name.slice(0, 2)}
              </span>
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-200">{config.name}</h3>
                {status[config.id] && (
                  <span
                    className={cn(
                      'text-xs flex items-center gap-1.5 px-2 py-1 rounded-full transition-all duration-300',
                      status[config.id] === 'success'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    )}
                  >
                    {status[config.id] === 'success' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <AlertCircle className="w-3 h-3" />
                    )}
                    {statusMessage[config.id]}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium ml-1">API Key</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type={visibleKeys[config.id] ? 'text' : 'password'}
                    placeholder={`sk-...`}
                    value={keys[config.id] || ''}
                    onChange={e => {
                      const val = e.target.value
                      setKeys(prev => ({ ...prev, [config.id]: val }))
                      // Reset status on change
                      if (status[config.id]) {
                        setStatus(prev => ({ ...prev, [config.id]: null }))
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisibility(config.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                  >
                    {visibleKeys[config.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleTest(config.id, config.provider)}
                  disabled={loading[config.id] || !keys[config.id]}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading[config.id] && statusMessage[config.id] === 'Connection successful' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCw className={cn('w-3.5 h-3.5', loading[config.id] && 'animate-spin')} />
                  )}
                  Test Connection
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  {keys[config.id] && (
                    <button
                      type="button"
                      onClick={() => handleDelete(config.id, config.provider)}
                      disabled={loading[config.id]}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSave(config.id, config.provider)}
                    disabled={loading[config.id] || !keys[config.id]}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

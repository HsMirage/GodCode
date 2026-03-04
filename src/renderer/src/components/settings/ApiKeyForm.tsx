import { useState, useEffect, useCallback } from 'react'
import { Key, Save, Trash, Plus, Eye, EyeOff, Globe } from 'lucide-react'

interface ApiKeyEntry {
  id: string
  label: string | null
  baseURL: string
  apiKey: string
  provider: string
}

export function ApiKeyForm() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})

  const [editingId, setEditingId] = useState<string | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formBaseURL, setFormBaseURL] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [showForm, setShowForm] = useState(false)

  const loadKeys = useCallback(async () => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[ApiKeyForm] window.codeall not available')
      return
    }
    try {
      const loadedKeys = (await window.codeall.invoke('keychain:list')) as ApiKeyEntry[]
      setKeys(loadedKeys)
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }, [])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  const resetForm = () => {
    setEditingId(null)
    setFormLabel('')
    setFormBaseURL('')
    setFormApiKey('')
    setShowForm(false)
  }

  const startEdit = async (entry: ApiKeyEntry) => {
    if (!window.codeall) return

    try {
      const detail = (await window.codeall.invoke('keychain:get-with-models', entry.id)) as
        | {
            id: string
            provider: string
            label: string | null
            baseURL: string
            apiKey: string
          }
        | null

      setEditingId(entry.id)
      setFormLabel(entry.label || entry.provider || '')
      setFormBaseURL(entry.baseURL)
      setFormApiKey(detail?.apiKey || '')
      setShowForm(true)
    } catch (error) {
      console.error('Failed to load full API key for edit:', error)
    }
  }

  const handleSave = async () => {
    if (!formBaseURL || !formApiKey || !window.codeall) {
      return
    }

    const tempId = editingId || 'new'
    setLoading(prev => ({ ...prev, [tempId]: true }))

    try {
      await window.codeall.invoke('keychain:set-password', {
        id: editingId,
        label: formLabel,
        baseURL: formBaseURL,
        apiKey: formApiKey,
        provider: 'custom'
      })

      await loadKeys()
      resetForm()
    } catch (error) {
      console.error('Failed to save key:', error)
    } finally {
      setLoading(prev => ({ ...prev, [tempId]: false }))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API Key?')) return
    if (!window.codeall) return

    setLoading(prev => ({ ...prev, [id]: true }))
    try {
      await window.codeall.invoke('keychain:delete-password', {
        service: 'codeall-app',
        account: 'ignored',
        id
      })

      await loadKeys()
    } catch (error) {
      console.error('Failed to delete key:', error)
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-slate-300">已配置的密钥</h3>
        <button
          type="button"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          disabled={showForm}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          新增密钥
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/50 border border-indigo-500/30 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="key-label" className="text-xs text-slate-400 font-medium ml-1">
                Label (Optional)
              </label>
              <input
                id="key-label"
                type="text"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="My API Key"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="key-baseurl" className="text-xs text-indigo-400 font-medium ml-1">
                Base URL *
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <input
                  id="key-baseurl"
                  type="text"
                  value={formBaseURL}
                  onChange={e => setFormBaseURL(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="key-value" className="text-xs text-indigo-400 font-medium ml-1">
              API Key *
            </label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                id="key-value"
                type="text"
                value={formApiKey}
                onChange={e => setFormApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!formBaseURL || !formApiKey || loading[editingId || 'new']}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              Save Key
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {keys.length === 0 && !showForm && (
          <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
            No API keys configured yet.
          </div>
        )}

        {keys.map(entry => (
          <div
            key={entry.id}
            className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 transition-all hover:border-slate-700 hover:bg-slate-900/50 group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700/50 mt-1">
                  <span className="font-bold text-slate-400 text-xs uppercase tracking-wider">
                    {(entry.label || 'API').slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <h4 className="font-medium text-slate-200 truncate">
                    {entry.label || 'Unnamed Key'}
                  </h4>
                  <p className="text-xs text-slate-500 truncate font-mono mt-0.5">
                    {entry.baseURL}
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <div className="relative">
                      <input
                        type={visibleKeys[entry.id] ? 'text' : 'password'}
                        value={entry.apiKey}
                        readOnly
                        aria-label={`API key value for ${entry.label}`}
                        className="bg-transparent border-none p-0 text-xs text-slate-400 font-mono w-32 focus:ring-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleVisibility(entry.id)}
                      className="text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      {visibleKeys[entry.id] ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => void startEdit(entry)}
                  disabled={loading[entry.id]}
                  className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <span className="text-xs">Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  disabled={loading[entry.id]}
                  className="p-1.5 rounded-lg border border-red-900/30 text-red-400 hover:bg-red-950/50 transition-colors"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

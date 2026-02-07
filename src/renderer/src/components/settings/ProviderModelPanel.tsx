import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Edit2,
  Globe,
  Key,
  Bot,
  Save,
  X
} from 'lucide-react'
import { cn } from '../../utils'

// Types
interface ProviderWithModels {
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKeyMasked: string
  models: Array<{ id: string; modelName: string; provider: string }>
}

interface ProviderFormData {
  label: string
  baseURL: string
  apiKey: string
  initialModels: string[]
}

interface ModelFormData {
  modelName: string
}

export function ProviderModelPanel() {
  const [providers, setProviders] = useState<ProviderWithModels[]>([])
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Edit States
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [providerForm, setProviderForm] = useState<ProviderFormData>({
    label: '',
    baseURL: '',
    apiKey: '',
    initialModels: []
  })

  const [newModelInput, setNewModelInput] = useState('')

  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [addingModelToProviderId, setAddingModelToProviderId] = useState<string | null>(null)
  const [modelForm, setModelForm] = useState<ModelFormData>({
    modelName: ''
  })

  // Load Data
  const loadProviders = useCallback(async () => {
    if (!window.codeall) return
    try {
      const data = (await window.codeall.invoke('keychain:list-with-models')) as ProviderWithModels[]
      setProviders(data)
      setSelectedProviderId(prev => {
        if (prev && data.some(p => p.id === prev)) return prev
        return data[0]?.id ?? null
      })
    } catch (error) {
      console.error('Failed to load providers:', error)
      alert(`加载服务商失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  // Provider Actions
  const toggleExpand = (id: string) => {
    setExpandedProviders(prev => ({ ...prev, [id]: !prev[id] }))
    setSelectedProviderId(id)
  }

  const handleEditProvider = async (provider: ProviderWithModels) => {
    // When editing, we need the full API key, not masked
    try {
      const fullKey = await window.codeall.invoke('keychain:get-with-models', provider.id)

      setEditingProviderId(provider.id)
      setProviderForm({
        label: provider.label || '',
        baseURL: provider.baseURL,
        apiKey: fullKey?.apiKey || '',
        initialModels: []
      })
      setIsAddingProvider(false)
      setSelectedProviderId(provider.id)
      setExpandedProviders(prev => ({ ...prev, [provider.id]: true }))
    } catch (error) {
      console.error('Failed to fetch provider details:', error)
      alert(`加载服务商详情失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleAddProvider = () => {
    setEditingProviderId(null)
    setIsAddingProvider(true)
    setProviderForm({ label: '', baseURL: '', apiKey: '', initialModels: [] })
    setNewModelInput('')
    setSelectedProviderId(null)
  }

  const handleSaveProvider = async () => {
    if (!window.codeall) return
    setLoading(true)
    try {
      const result = (await window.codeall.invoke('keychain:set-password', {
        id: editingProviderId || undefined,
        label: providerForm.label,
        baseURL: providerForm.baseURL,
        apiKey: providerForm.apiKey,
        provider: 'custom'
      })) as { id: string } | undefined

      // If adding a new provider and initial models are specified, create the models
      if (!editingProviderId && providerForm.initialModels.length > 0 && result?.id) {
        for (const modelName of providerForm.initialModels) {
          await window.codeall.invoke('model:create', {
            provider: 'openai-compatible',
            modelName: modelName.trim(),
            apiKeyId: result.id,
            baseURL: providerForm.baseURL,
            config: {}
          })
        }
      }

      await loadProviders()
      setIsAddingProvider(false)
      setEditingProviderId(null)
      setNewModelInput('')
    } catch (error) {
      console.error('Failed to save provider:', error)
      alert(`保存服务商失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProvider = async (provider: ProviderWithModels) => {
    if (!window.codeall) return
    const count = provider.models.length
    const confirmed = await confirm(
      `确定删除服务商 "${provider.label || provider.provider}"？\n` +
        `这将级联删除其下的 ${count} 个模型配置。此操作无法撤销。`
    )

    if (confirmed) {
      setLoading(true)
      try {
        await window.codeall.invoke('keychain:delete-password', {
          service: 'codeall-app',
          account: 'ignored',
          id: provider.id
        })
        await loadProviders()
      } catch (error) {
        console.error('Failed to delete provider:', error)
        alert(`删除服务商失败: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setLoading(false)
      }
    }
  }

  // Model Actions
  const handleAddModel = (providerId: string) => {
    setAddingModelToProviderId(providerId)
    setEditingModelId(null)
    setModelForm({ modelName: '' })
    // Ensure provider is expanded
    setExpandedProviders(prev => ({ ...prev, [providerId]: true }))
    setSelectedProviderId(providerId)
  }

  const handleEditModel = (model: { id: string; modelName: string }) => {
    setEditingModelId(model.id)
    setAddingModelToProviderId(null)
    setModelForm({ modelName: model.modelName })
  }

  const handleSaveModel = async (providerId: string) => {
    if (!window.codeall) return
    setLoading(true)
    try {
      if (editingModelId) {
        await window.codeall.invoke('model:update', {
          id: editingModelId,
          data: {
            modelName: modelForm.modelName
            // We don't change provider/apiKey/baseURL here as they inherit from provider
          }
        })
      } else {
        const provider = providers.find(p => p.id === providerId)
        if (!provider) throw new Error('Provider not found')

        await window.codeall.invoke('model:create', {
          provider: 'openai-compatible',
          modelName: modelForm.modelName,
          apiKeyId: provider.id,
          baseURL: provider.baseURL,
          config: {}
        })
      }
      await loadProviders()
      setAddingModelToProviderId(null)
      setEditingModelId(null)
    } catch (error) {
      console.error('Failed to save model:', error)
      alert(`保存模型失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!confirm(`确定删除模型 "${modelName}"？`)) return
    if (!window.codeall) return
    setLoading(true)
    try {
      await window.codeall.invoke('model:delete', modelId)
      await loadProviders()
    } catch (error) {
      console.error('Failed to delete model:', error)
      alert(`删除模型失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  // --- Renders ---
  const renderProviderForm = () => (
    <div className="bg-slate-900/50 border border-indigo-500/30 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 mb-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="provider-label" className="text-xs text-slate-400 font-medium ml-1">
            Label (Optional)
          </label>
          <input
            id="provider-label"
            type="text"
            value={providerForm.label}
            onChange={e => setProviderForm({ ...providerForm, label: e.target.value })}
            placeholder="My Provider"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="provider-base-url" className="text-xs text-indigo-400 font-medium ml-1">
            Base URL *
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              id="provider-base-url"
              type="text"
              value={providerForm.baseURL}
              onChange={e => setProviderForm({ ...providerForm, baseURL: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="provider-api-key" className="text-xs text-indigo-400 font-medium ml-1">
          API Key *
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="provider-api-key"
            type="password"
            value={providerForm.apiKey}
            onChange={e => setProviderForm({ ...providerForm, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 font-mono"
          />
        </div>
      </div>
      {/* Initial Models - only show when adding new provider */}
      {isAddingProvider && !editingProviderId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-400 font-medium ml-1">
              添加模型
            </label>
          </div>
          {/* Added models list */}
          {providerForm.initialModels.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {providerForm.initialModels.map((model, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-1.5 border border-slate-700/50"
                >
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="flex-1 text-sm text-slate-300 font-mono">{model}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProviderForm({
                        ...providerForm,
                        initialModels: providerForm.initialModels.filter((_, i) => i !== index)
                      })
                    }}
                    className="p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add model input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={newModelInput}
                onChange={e => setNewModelInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newModelInput.trim()) {
                    e.preventDefault()
                    if (!providerForm.initialModels.includes(newModelInput.trim())) {
                      setProviderForm({
                        ...providerForm,
                        initialModels: [...providerForm.initialModels, newModelInput.trim()]
                      })
                    }
                    setNewModelInput('')
                  }
                }}
                placeholder="例如: gpt-4, claude-3-opus..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (newModelInput.trim() && !providerForm.initialModels.includes(newModelInput.trim())) {
                  setProviderForm({
                    ...providerForm,
                    initialModels: [...providerForm.initialModels, newModelInput.trim()]
                  })
                  setNewModelInput('')
                }
              }}
              disabled={!newModelInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              添加模型
            </button>
          </div>
          <p className="text-[10px] text-slate-500 ml-1">输入模型名称后点击"添加模型"按钮或按回车添加，可添加多个</p>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => {
            setIsAddingProvider(false)
            setEditingProviderId(null)
            setProviderForm({ label: '', baseURL: '', apiKey: '', initialModels: [] })
            setNewModelInput('')
          }}
          className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveProvider}
          disabled={!providerForm.baseURL || !providerForm.apiKey || loading}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          Save Provider
        </button>
      </div>
    </div>
  )

  const renderModelForm = (providerId: string) => (
    <div className="ml-8 mt-2 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 flex items-center gap-3 animate-in fade-in">
      <Bot className="w-4 h-4 text-indigo-400 shrink-0" />
      <input
        type="text"
        value={modelForm.modelName}
        onChange={e => setModelForm({ ...modelForm, modelName: e.target.value })}
        placeholder="Model Name (e.g. gpt-4)"
        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500/50 focus:outline-none"
        onKeyDown={e => {
          if (e.key === 'Enter') handleSaveModel(providerId)
          if (e.key === 'Escape') {
            setAddingModelToProviderId(null)
            setEditingModelId(null)
          }
        }}
      />
      <button
        type="button"
        onClick={() => handleSaveModel(providerId)}
        disabled={!modelForm.modelName}
        className="p-1 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          setAddingModelToProviderId(null)
          setEditingModelId(null)
        }}
        className="p-1 text-slate-500 hover:text-slate-400"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-slate-300">Model Providers</h3>
        <button
          type="button"
          onClick={handleAddProvider}
          disabled={isAddingProvider || !!editingProviderId}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Provider
        </button>
      </div>

      {isAddingProvider && renderProviderForm()}


      <div className="space-y-3">
        {providers.length === 0 && !isAddingProvider && (
          <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
            No providers configured. Add one to get started.
          </div>
        )}

        {providers.map(provider => {
          const isEditingThis = editingProviderId === provider.id
          if (isEditingThis) return <div key={provider.id}>{renderProviderForm()}</div>

          const isExpanded = expandedProviders[provider.id]
          const isSelected = selectedProviderId === provider.id

          return (
            <div
              key={provider.id}
              className={cn(
                'bg-slate-900/30 border border-slate-800 rounded-xl transition-all hover:border-slate-700 group',
                isSelected ? 'ring-1 ring-indigo-500/30 border-indigo-500/30' : null
              )}
            >
              {/* Provider Header */}
              <div className="p-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(provider.id)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700/50">
                  <span className="font-bold text-slate-400 text-xs uppercase tracking-wider">
                    {(provider.label || provider.provider || '??').slice(0, 2)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-slate-200 truncate text-sm">
                      {provider.label || 'Unnamed Provider'}
                    </h4>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700/50">
                      {provider.models.length} models
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span
                      className="text-xs text-slate-500 truncate font-mono max-w-[200px]"
                      title={provider.baseURL}
                    >
                      {provider.baseURL}
                    </span>
                    <span className="text-xs text-slate-600 font-mono">
                      {provider.apiKeyMasked}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditProvider(provider)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-white bg-slate-600 hover:bg-slate-500 border border-slate-400 rounded-lg transition-colors text-xs font-medium shadow-sm"
                    title="Edit Provider"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddModel(provider.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 rounded-lg transition-colors text-xs font-medium shadow-sm"
                    title="Add Model"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加模型
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProvider(provider)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-white bg-red-600 hover:bg-red-500 border border-red-400 rounded-lg transition-colors text-xs font-medium shadow-sm"
                    title="Delete Provider"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>

              {/* Models List */}
              {isExpanded && (
                <div className="border-t border-slate-800/50 bg-slate-950/20 px-3 pb-3 pt-1">
                  {provider.models.length === 0 && !addingModelToProviderId && (
                    <div className="pl-12 py-2 text-xs text-slate-600 italic">
                      No models linked to this provider.
                    </div>
                  )}

                  {provider.models.map(model => {
                    const isEditingModel = editingModelId === model.id
                    if (isEditingModel)
                      return <div key={model.id}>{renderModelForm(provider.id)}</div>

                    return (
                      <div
                        key={model.id}
                        className="flex items-center gap-3 pl-12 py-2 group/model hover:bg-slate-800/30 rounded-lg transition-colors -ml-2 px-2"
                      >
                        <Bot className="w-3.5 h-3.5 text-indigo-400/70" />
                        <span className="text-sm text-slate-300 font-mono flex-1">
                          {model.modelName}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditModel(model)}
                            className="flex items-center gap-1 px-2 py-1 text-white bg-slate-600 hover:bg-slate-500 border border-slate-400 rounded transition-colors text-xs"
                          >
                            <Edit2 className="w-3 h-3" />
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteModel(model.id, model.modelName)}
                            className="flex items-center gap-1 px-2 py-1 text-white bg-red-600 hover:bg-red-500 border border-red-400 rounded transition-colors text-xs"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {addingModelToProviderId === provider.id && renderModelForm(provider.id)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

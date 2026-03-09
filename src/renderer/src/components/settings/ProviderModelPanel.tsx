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
import { GODCODE_KEYCHAIN_SERVICE } from '@shared/brand-compat'
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
  contextSize: number
  thinkingMode: boolean
}

export function ProviderModelPanel() {
  const [providers, setProviders] = useState<ProviderWithModels[]>([])
  const [modelsById, setModelsById] = useState<Record<string, any>>({})
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
    modelName: '',
    contextSize: 32,
    thinkingMode: false
  })

  // Load Data
  const loadProviders = useCallback(async () => {
    if (!window.godcode) return
    try {
      const [providerData, modelData] = await Promise.all([
        window.godcode.invoke('keychain:list-with-models') as Promise<ProviderWithModels[]>,
        window.godcode.invoke('model:list') as Promise<any[]>
      ])

      setProviders(providerData)
      const map: Record<string, any> = {}
      for (const m of modelData) {
        if (m && m.id) map[m.id] = m
      }
      setModelsById(map)
      setSelectedProviderId(prev => {
        if (prev && providerData.some(p => p.id === prev)) return prev
        return providerData[0]?.id ?? null
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
      const fullKey = await window.godcode.invoke('keychain:get-with-models', provider.id)

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
    if (!window.godcode) return
    setLoading(true)
    try {
      const result = (await window.godcode.invoke('keychain:set-password', {
        id: editingProviderId || undefined,
        label: providerForm.label,
        baseURL: providerForm.baseURL,
        apiKey: providerForm.apiKey,
        provider: 'custom'
      })) as { id: string } | undefined

      // If adding a new provider and initial models are specified, create the models
      if (!editingProviderId && providerForm.initialModels.length > 0 && result?.id) {
        for (const modelName of providerForm.initialModels) {
          await window.godcode.invoke('model:create', {
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
    if (!window.godcode) return
    const count = provider.models.length
    const confirmed = await confirm(
      `确定删除服务商 "${provider.label || provider.provider}"？\n` +
        `这将级联删除其下的 ${count} 个模型配置。此操作无法撤销。`
    )

    if (confirmed) {
      setLoading(true)
      try {
        await window.godcode.invoke('keychain:delete-password', {
          service: GODCODE_KEYCHAIN_SERVICE,
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
    setModelForm({
      modelName: '',
      contextSize: 32,
      thinkingMode: false
    })
    // Ensure provider is expanded
    setExpandedProviders(prev => ({ ...prev, [providerId]: true }))
    setSelectedProviderId(providerId)
  }

  const handleEditModel = (model: { id: string; modelName: string }) => {
    const details = modelsById[model.id]
    setEditingModelId(model.id)
    setAddingModelToProviderId(null)

    setModelForm({
      modelName: model.modelName,
      contextSize: Number(details?.contextSize ?? 32),
      thinkingMode: Boolean(details?.config?.thinkingMode ?? false)
    })
  }

  const handleSaveModel = async (providerId: string) => {
    if (!window.godcode) return
    setLoading(true)
    try {
      if (editingModelId) {
        const existing = modelsById[editingModelId]
        const nextConfig = {
          ...(existing?.config && typeof existing.config === 'object' ? existing.config : {}),
          thinkingMode: modelForm.thinkingMode
        }
        delete (nextConfig as { apiProtocol?: unknown }).apiProtocol
        await window.godcode.invoke('model:update', {
          id: editingModelId,
          data: {
            modelName: modelForm.modelName,
            contextSize: modelForm.contextSize,
            config: nextConfig
            // We don't change provider/apiKey/baseURL here as they inherit from provider
          }
        })
      } else {
        const provider = providers.find(p => p.id === providerId)
        if (!provider) throw new Error('Provider not found')

        await window.godcode.invoke('model:create', {
          provider: 'openai-compatible',
          modelName: modelForm.modelName,
          apiKeyId: provider.id,
          baseURL: provider.baseURL,
          contextSize: modelForm.contextSize,
          config: {
            thinkingMode: modelForm.thinkingMode
          }
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
    if (!window.godcode) return
    setLoading(true)
    try {
      await window.godcode.invoke('model:delete', modelId)
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
    <div className="bg-[var(--bg-secondary)] border border-indigo-500/20 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 mb-4 shadow-[0_10px_30px_rgba(0,0,0,0.05)] dark:shadow-none">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label
            htmlFor="provider-label"
            className="text-xs text-[var(--text-secondary)] font-medium ml-1"
          >
            Label (Optional)
          </label>
          <input
            id="provider-label"
            type="text"
            value={providerForm.label}
            onChange={e => setProviderForm({ ...providerForm, label: e.target.value })}
            placeholder="My Provider"
            className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg py-2 px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="provider-base-url"
            className="text-xs text-indigo-600 dark:text-indigo-400 font-medium ml-1"
          >
            Base URL *
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              id="provider-base-url"
              type="text"
              value={providerForm.baseURL}
              onChange={e => setProviderForm({ ...providerForm, baseURL: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="provider-api-key"
          className="text-xs text-indigo-600 dark:text-indigo-400 font-medium ml-1"
        >
          API Key *
        </label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            id="provider-api-key"
            type="password"
            value={providerForm.apiKey}
            onChange={e => setProviderForm({ ...providerForm, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg py-2 pl-10 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 font-mono placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>
      {/* Initial Models - only show when adding new provider */}
      {isAddingProvider && !editingProviderId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)] font-medium ml-1">
              添加模型
            </label>
          </div>
          {/* Added models list */}
          {providerForm.initialModels.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {providerForm.initialModels.map((model, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-[var(--bg-primary)] rounded-lg px-3 py-1.5 border border-[var(--border-primary)]"
                >
                  <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="flex-1 text-sm text-[var(--text-primary)] font-mono">
                    {model}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setProviderForm({
                        ...providerForm,
                        initialModels: providerForm.initialModels.filter((_, i) => i !== index)
                      })
                    }}
                    className="p-0.5 text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400 transition-colors"
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
              <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
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
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg py-2 pl-10 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50 placeholder:text-[var(--text-muted)]"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (
                  newModelInput.trim() &&
                  !providerForm.initialModels.includes(newModelInput.trim())
                ) {
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
          <p className="text-[10px] text-[var(--text-muted)] ml-1">
            输入模型名称后点击&quot;添加模型&quot;按钮或按回车添加，可添加多个
          </p>
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
          className="px-3 py-1.5 rounded-lg border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
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
    <div className="ml-8 mt-2 p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] animate-in fade-in">
      <div className="flex items-start gap-3">
        <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-2" />

        <div className="flex-1 grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-5">
            <label className="block text-[10px] text-[var(--text-muted)] mb-1">模型名称</label>
            <input
              type="text"
              value={modelForm.modelName}
              onChange={e => setModelForm({ ...modelForm, modelName: e.target.value })}
              placeholder="例如: gpt-4o, claude-3-5-sonnet..."
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500/50 focus:outline-none placeholder:text-[var(--text-muted)]"
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveModel(providerId)
                if (e.key === 'Escape') {
                  setAddingModelToProviderId(null)
                  setEditingModelId(null)
                }
              }}
            />
          </div>

          <div className="col-span-12 md:col-span-2">
            <label className="block text-[10px] text-[var(--text-muted)] mb-1">
              最大上下文 (K tokens)
            </label>
            <input
              type="number"
              min={1}
              max={2000}
              step={1}
              value={modelForm.contextSize}
              onChange={e => {
                const n = Number(e.target.value)
                setModelForm({ ...modelForm, contextSize: Number.isFinite(n) ? n : 32 })
              }}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500/50 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">范围 1-2000</p>
          </div>

          <div className="col-span-12 md:col-span-3">
            <label className="block text-[10px] text-[var(--text-muted)] mb-1">思考模式</label>
            <button
              type="button"
              onClick={() => setModelForm(v => ({ ...v, thinkingMode: !v.thinkingMode }))}
              className={cn(
                'w-full border rounded px-2 py-1.5 text-xs font-medium transition-colors',
                modelForm.thinkingMode
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]'
              )}
              title={modelForm.thinkingMode ? '已启用' : '已禁用'}
            >
              {modelForm.thinkingMode ? '启用' : '禁用'}
            </button>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Claude 可启用 extended thinking；OpenAI 协议会自动适配
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 pt-6">
          <button
            type="button"
            onClick={() => handleSaveModel(providerId)}
            disabled={!modelForm.modelName}
            className="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 disabled:opacity-50"
            title="Save"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingModelToProviderId(null)
              setEditingModelId(null)
            }}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Model Providers</h3>
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
          <div className="text-center py-8 text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-primary)] rounded-xl bg-[var(--bg-primary)]">
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
                'bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl transition-all hover:border-[var(--border-secondary)] group',
                isSelected ? 'ring-1 ring-indigo-500/20 border-indigo-500/30' : null
              )}
            >
              {/* Provider Header */}
              <div className="p-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(provider.id)}
                  className="p-1 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0 border border-[var(--border-primary)]">
                  <span className="font-bold text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                    {(provider.label || provider.provider || '??').slice(0, 2)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-[var(--text-primary)] truncate text-sm">
                      {provider.label || 'Unnamed Provider'}
                    </h4>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-primary)]">
                      {provider.models.length} models
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span
                      className="text-xs text-[var(--text-muted)] truncate font-mono max-w-[200px]"
                      title={provider.baseURL}
                    >
                      {provider.baseURL}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] font-mono">
                      {provider.apiKeyMasked}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditProvider(provider)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg transition-colors text-xs font-medium shadow-sm"
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
                <div className="border-t ui-border bg-[var(--bg-primary)] px-3 pb-3 pt-1">
                  {provider.models.length === 0 && !addingModelToProviderId && (
                    <div className="pl-12 py-2 text-xs text-[var(--text-muted)] italic">
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
                        className="flex items-center gap-3 pl-12 py-2 group/model hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors -ml-2 px-2"
                      >
                        <Bot className="w-3.5 h-3.5 text-indigo-600/70 dark:text-indigo-400/70" />
                        <span className="text-sm text-[var(--text-primary)] font-mono flex-1">
                          {model.modelName}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditModel(model)}
                            className="flex items-center gap-1 px-2 py-1 text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded transition-colors text-xs"
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

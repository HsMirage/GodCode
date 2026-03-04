/**
 * 智能体绑定管理页面
 * 包含主要智能体、辅助智能体、任务类别三个子 Tab
 */

import { useState, useEffect, useCallback } from 'react'
import { Bot, Users, Layers, Settings, ChevronDown } from 'lucide-react'
import { AgentCard } from './AgentCard'
import { CategoryCard } from './CategoryCard'
import { AGENT_DEFINITIONS, CATEGORY_DEFINITIONS } from '@shared/agent-definitions'
import type {
  AgentBindingData,
  CategoryBindingData,
  UpdateAgentBindingInput,
  UpdateCategoryBindingInput
} from '@renderer/types/binding'
import type { Model } from '@renderer/types/domain'
import { useDataStore } from '../../store/data.store'

type SubTab = 'primary' | 'subagent' | 'category'

type ProviderWithModels = {
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKeyMasked: string
  models: Array<{ id: string; modelName: string; provider: string }>
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

type SettingSchemaDescriptor = {
  key: string
  type: 'string' | 'number' | 'boolean' | 'json'
  scope: 'global' | 'space'
  defaultValue?: string | number | boolean | JsonValue | null
  nullable?: boolean
  description?: string
  validation?: {
    min?: number
    max?: number
    integer?: boolean
    minLength?: number
    maxLength?: number
    pattern?: string
    enum?: Array<string | number | boolean>
  }
  defaultValueSerialized: string | null
}

type SettingResolvedResult = {
  key: string
  value: string | number | boolean | JsonValue | null
  source: 'stored' | 'default' | 'null'
  schema: SettingSchemaDescriptor
  scopeSource?: {
    scope: 'global' | 'space'
    source: 'stored' | 'default' | 'null'
  }
}

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'primary', label: '主要智能体', icon: <Bot className="w-4 h-4" /> },
  { id: 'subagent', label: '辅助智能体', icon: <Users className="w-4 h-4" /> },
  { id: 'category', label: '任务类别', icon: <Layers className="w-4 h-4" /> }
]

const MANAGED_SETTING_KEYS = [
  'defaultModelId',
  'maxToolIterations',
  'workforceMaxConcurrent'
] as const

type ManagedSettingKey = (typeof MANAGED_SETTING_KEYS)[number]

type ManagedSettingState = {
  key: ManagedSettingKey
  schema: SettingSchemaDescriptor
  resolved: SettingResolvedResult
  inputNumberValue?: number
}

function parseIntInRange(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function parseMaybeInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return null
  return Math.trunc(parsed)
}

export function AgentBindingPanel() {
  const [activeTab, setActiveTab] = useState<SubTab>('primary')
  const [agents, setAgents] = useState<AgentBindingData[]>([])
  const [categories, setCategories] = useState<CategoryBindingData[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [providerNameByModelId, setProviderNameByModelId] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [isDefaultModelDropdownOpen, setIsDefaultModelDropdownOpen] = useState(false)
  const [managedSettings, setManagedSettings] = useState<Partial<Record<ManagedSettingKey, ManagedSettingState>>>(
    {}
  )

  const currentSpaceId = useDataStore(state => state.currentSpaceId)

  const loadData = useCallback(async () => {
    const baseAgents: AgentBindingData[] = AGENT_DEFINITIONS.map(def => ({
      id: def.code,
      agentCode: def.code,
      agentName: def.name,
      agentType: def.type,
      description: def.description,
      modelId: null,
      modelName: null,
      temperature: def.defaultTemperature,
      tools: def.tools,
      systemPrompt: null,
      enabled: true
    }))

    const baseCategories: CategoryBindingData[] = CATEGORY_DEFINITIONS.map(def => ({
      id: def.code,
      categoryCode: def.code,
      categoryName: def.name,
      description: def.description,
      modelId: null,
      modelName: null,
      temperature: def.defaultTemperature,
      systemPrompt: null,
      enabled: true
    }))

    setAgents(baseAgents)
    setCategories(baseCategories)

    if (!window.codeall) {
      console.warn('[AgentBindingPanel] window.codeall not available')
      setLoading(false)
      return
    }

    try {
      const [agentResult, categoryResult, modelResult, providerResult, schemaResult] =
        await Promise.allSettled([
          window.codeall.invoke('agent-binding:list') as Promise<AgentBindingData[]>,
          window.codeall.invoke('category-binding:list') as Promise<CategoryBindingData[]>,
          window.codeall.invoke('model:list') as Promise<Model[]>,
          window.codeall.invoke('keychain:list-with-models') as Promise<ProviderWithModels[]>,
          window.codeall.invoke('setting:schema-list') as Promise<SettingSchemaDescriptor[]>
        ])

      const agentList = agentResult.status === 'fulfilled' ? agentResult.value : []
      const categoryList = categoryResult.status === 'fulfilled' ? categoryResult.value : []
      const modelList = modelResult.status === 'fulfilled' ? modelResult.value : []
      const providerList = providerResult.status === 'fulfilled' ? providerResult.value : []
      const schemaList = schemaResult.status === 'fulfilled' ? schemaResult.value : []

      if (agentResult.status === 'rejected') {
        console.error('Failed to load agent bindings:', agentResult.reason)
      }
      if (categoryResult.status === 'rejected') {
        console.error('Failed to load category bindings:', categoryResult.reason)
      }
      if (modelResult.status === 'rejected') {
        console.error('Failed to load models:', modelResult.reason)
      }
      if (providerResult.status === 'rejected') {
        console.error('Failed to load providers:', providerResult.reason)
      }
      if (schemaResult.status === 'rejected') {
        console.error('Failed to load setting schemas:', schemaResult.reason)
      }

      const mergedAgents = AGENT_DEFINITIONS.map((def): AgentBindingData => {
        const binding = agentList.find(b => b.agentCode === def.code)
        return {
          id: binding?.id ?? def.code,
          agentCode: def.code,
          agentName: def.name,
          agentType: def.type,
          description: def.description,
          modelId: binding?.modelId ?? null,
          modelName: binding?.modelName ?? null,
          temperature: binding?.temperature ?? def.defaultTemperature,
          tools: binding?.tools ?? def.tools,
          systemPrompt: binding?.systemPrompt ?? null,
          enabled: binding?.enabled ?? true
        }
      })

      const mergedCategories = CATEGORY_DEFINITIONS.map((def): CategoryBindingData => {
        const binding = categoryList.find(b => b.categoryCode === def.code)
        return {
          id: binding?.id ?? def.code,
          categoryCode: def.code,
          categoryName: def.name,
          description: def.description,
          modelId: binding?.modelId ?? null,
          modelName: binding?.modelName ?? null,
          temperature: binding?.temperature ?? def.defaultTemperature,
          systemPrompt: binding?.systemPrompt ?? null,
          enabled: binding?.enabled ?? true
        }
      })

      setAgents(mergedAgents)
      setCategories(mergedCategories)
      setModels(modelList)

      const map: Record<string, string> = {}
      for (const p of providerList) {
        const providerName = p.label?.trim() ? p.label.trim() : p.provider
        for (const m of p.models || []) {
          map[m.id] = providerName
        }
      }
      setProviderNameByModelId(map)

      const schemaByKey = schemaList.reduce((acc, schema) => {
        acc[schema.key] = schema
        return acc
      }, {} as Record<string, SettingSchemaDescriptor>)

      const resolvedEntries = await Promise.all(
        MANAGED_SETTING_KEYS.map(async key => {
          const schema = schemaByKey[key]
          if (!schema) return null

          const scopeInput = schema.scope === 'space' && currentSpaceId ? { spaceId: currentSpaceId } : {}
          const resolved = (await window.codeall.invoke('setting:get-resolved', {
            key,
            ...scopeInput
          })) as SettingResolvedResult

          const state: ManagedSettingState = {
            key,
            schema,
            resolved
          }

          if (key === 'maxToolIterations') {
            state.inputNumberValue = parseIntInRange(resolved.value, 1, 1000, 100)
          }

          if (key === 'workforceMaxConcurrent') {
            const parsed = parseMaybeInt(resolved.value)
            state.inputNumberValue = parsed ?? 3
          }

          return state
        })
      )

      const nextManagedSettings: Partial<Record<ManagedSettingKey, ManagedSettingState>> = {}
      for (const entry of resolvedEntries) {
        if (entry) {
          nextManagedSettings[entry.key] = entry
        }
      }
      setManagedSettings(nextManagedSettings)
    } catch (error) {
      console.error('Failed to load binding data:', error)
    } finally {
      setLoading(false)
    }
  }, [currentSpaceId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleUpdateAgent = async (agentCode: string, data: UpdateAgentBindingInput) => {
    if (!window.codeall) return

    try {
      await window.codeall.invoke('agent-binding:update', { agentCode, data })
      await loadData()
    } catch (error) {
      console.error('Failed to update agent binding:', error)
    }
  }

  const handleResetAgent = async (agentCode: string) => {
    if (!window.codeall) return

    try {
      await window.codeall.invoke('agent-binding:reset', agentCode)
      await loadData()
    } catch (error) {
      console.error('Failed to reset agent binding:', error)
    }
  }

  const handleUpdateCategory = async (categoryCode: string, data: UpdateCategoryBindingInput) => {
    if (!window.codeall) return

    try {
      await window.codeall.invoke('category-binding:update', { categoryCode, data })
      await loadData()
    } catch (error) {
      console.error('Failed to update category binding:', error)
    }
  }

  const handleResetCategory = async (categoryCode: string) => {
    if (!window.codeall) return

    try {
      await window.codeall.invoke('category-binding:reset', categoryCode)
      await loadData()
    } catch (error) {
      console.error('Failed to reset category binding:', error)
    }
  }

  const handleUpdateSetting = async (params: {
    key: ManagedSettingKey
    value: unknown
    scope: 'global' | 'space'
  }) => {
    if (!window.codeall) return

    const { key, value, scope } = params
    const payload: { key: ManagedSettingKey; value: unknown; spaceId?: string } = { key, value }
    if (scope === 'space' && currentSpaceId) {
      payload.spaceId = currentSpaceId
    }

    try {
      await window.codeall.invoke('setting:set', payload)
      await loadData()
      if (key === 'defaultModelId') {
        setIsDefaultModelDropdownOpen(false)
      }
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
    }
  }

  const defaultModelSetting = managedSettings.defaultModelId
  const maxToolIterationsSetting = managedSettings.maxToolIterations
  const workforceMaxConcurrentSetting = managedSettings.workforceMaxConcurrent

  const defaultModelId =
    typeof defaultModelSetting?.resolved.value === 'string' ? defaultModelSetting.resolved.value : null

  const defaultModel = models.find(m => m.id === defaultModelId)
  const defaultModelProvider = defaultModel
    ? providerNameByModelId[defaultModel.id] ?? defaultModel.provider
    : null

  const maxToolIterationsValue = maxToolIterationsSetting?.inputNumberValue ?? 100
  const workforceMaxConcurrentValue = workforceMaxConcurrentSetting?.inputNumberValue ?? 3

  const primaryAgents = agents.filter(a => a.agentType === 'primary')
  const subagents = agents.filter(a => a.agentType === 'subagent')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-muted)] text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/15">
                <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-[var(--text-primary)]">默认模型</h4>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {defaultModelSetting?.schema.description ||
                    '未单独配置模型的智能体和任务类别将使用此模型'}
                </p>
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDefaultModelDropdownOpen(!isDefaultModelDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors min-w-[200px] justify-between"
              >
                <span className={defaultModel ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
                  {defaultModel ? `${defaultModel.modelName} (${defaultModelProvider})` : '请选择默认模型'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${isDefaultModelDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isDefaultModelDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateSetting({
                        key: 'defaultModelId',
                        value: null,
                        scope: defaultModelSetting?.schema.scope || 'global'
                      })
                    }
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--bg-tertiary)] transition-colors ${!defaultModelId ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'text-[var(--text-secondary)]'}`}
                  >
                    无（使用各智能体默认配置）
                  </button>
                  {models.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() =>
                        handleUpdateSetting({
                          key: 'defaultModelId',
                          value: model.id,
                          scope: defaultModelSetting?.schema.scope || 'global'
                        })
                      }
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--bg-tertiary)] transition-colors ${model.id === defaultModelId ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'text-[var(--text-primary)]'}`}
                    >
                      <span className="font-mono">{model.modelName}</span>
                      {model.provider && (
                        <span className="text-[var(--text-muted)] text-xs ml-2">
                          ({providerNameByModelId[model.id] ?? model.provider})
                        </span>
                      )}
                    </button>
                  ))}
                  {models.length === 0 && (
                    <div className="px-4 py-3 text-sm text-[var(--text-muted)] text-center">
                      暂无可用模型，请先在 API服务商 中添加
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 pt-3 border-t border-[var(--border-primary)]">
            <div>
              <h4 className="text-sm font-medium text-[var(--text-primary)]">工具调用上限</h4>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {maxToolIterationsSetting?.schema.description ||
                  '控制单次消息中工具循环的最大轮次，默认 100，可按需调整'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={1000}
                step={1}
                value={maxToolIterationsValue}
                onChange={e => {
                  const n = parseIntInRange(e.target.value, 1, 1000, 100)
                  setManagedSettings(prev => {
                    const current = prev.maxToolIterations
                    if (!current) return prev
                    return {
                      ...prev,
                      maxToolIterations: {
                        ...current,
                        inputNumberValue: n
                      }
                    }
                  })
                }}
                className="w-28 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50"
              />
              <button
                type="button"
                onClick={() =>
                  handleUpdateSetting({
                    key: 'maxToolIterations',
                    value: maxToolIterationsValue,
                    scope: maxToolIterationsSetting?.schema.scope || 'global'
                  })
                }
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                保存
              </button>
            </div>
          </div>

          {workforceMaxConcurrentSetting && (
            <div className="flex items-start justify-between gap-4 pt-3 border-t border-[var(--border-primary)]">
              <div>
                <h4 className="text-sm font-medium text-[var(--text-primary)]">Workforce 并发上限</h4>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {workforceMaxConcurrentSetting.schema.description ||
                    '为当前空间设置 workforce 并发上限；清空表示使用全局默认值'}
                </p>
                {workforceMaxConcurrentSetting.schema.scope === 'space' && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    当前作用域：{currentSpaceId ? '空间级覆盖' : '全局默认（未选中空间）'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={128}
                  step={1}
                  value={workforceMaxConcurrentValue}
                  onChange={e => {
                    const parsed = parseIntInRange(e.target.value, 1, 128, 3)
                    setManagedSettings(prev => {
                      const current = prev.workforceMaxConcurrent
                      if (!current) return prev
                      return {
                        ...prev,
                        workforceMaxConcurrent: {
                          ...current,
                          inputNumberValue: parsed
                        }
                      }
                    })
                  }}
                  className="w-28 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateSetting({
                      key: 'workforceMaxConcurrent',
                      value: workforceMaxConcurrentValue,
                      scope: workforceMaxConcurrentSetting.schema.scope
                    })
                  }
                  className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors"
                >
                  保存
                </button>
                {workforceMaxConcurrentSetting.schema.nullable && (
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateSetting({
                        key: 'workforceMaxConcurrent',
                        value: null,
                        scope: workforceMaxConcurrentSetting.schema.scope
                      })
                    }
                    className="px-3 py-2 rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    重置
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex items-center gap-2 border-b ui-border pb-3">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            ].join(' ')}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-3">
        {activeTab === 'primary' && (
          <>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              主要智能体负责核心任务编排和执行，可以调用其他智能体协同工作
            </p>
            {primaryAgents.map(agent => (
              <AgentCard
                key={agent.agentCode}
                agent={agent}
                models={models}
                providerNameByModelId={providerNameByModelId}
                onUpdate={handleUpdateAgent}
                onReset={handleResetAgent}
              />
            ))}
            {primaryAgents.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-primary)] rounded-xl">
                暂无主要智能体配置
              </div>
            )}
          </>
        )}

        {activeTab === 'subagent' && (
          <>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              辅助智能体专注于特定任务，如代码探索、文档查找、架构咨询等
            </p>
            {subagents.map(agent => (
              <AgentCard
                key={agent.agentCode}
                agent={agent}
                models={models}
                providerNameByModelId={providerNameByModelId}
                onUpdate={handleUpdateAgent}
                onReset={handleResetAgent}
              />
            ))}
            {subagents.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-primary)] rounded-xl">
                暂无辅助智能体配置
              </div>
            )}
          </>
        )}

        {activeTab === 'category' && (
          <>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              任务类别定义了不同类型任务的默认处理方式和模型配置
            </p>
            {categories.map(category => (
              <CategoryCard
                key={category.categoryCode}
                category={category}
                models={models}
                providerNameByModelId={providerNameByModelId}
                onUpdate={handleUpdateCategory}
                onReset={handleResetCategory}
              />
            ))}
            {categories.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-primary)] rounded-xl">
                暂无任务类别配置
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

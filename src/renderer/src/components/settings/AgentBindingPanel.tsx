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

type SubTab = 'primary' | 'subagent' | 'category'

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'primary', label: '主要智能体', icon: <Bot className="w-4 h-4" /> },
  { id: 'subagent', label: '辅助智能体', icon: <Users className="w-4 h-4" /> },
  { id: 'category', label: '任务类别', icon: <Layers className="w-4 h-4" /> }
]

export function AgentBindingPanel() {
  const [activeTab, setActiveTab] = useState<SubTab>('primary')
  const [agents, setAgents] = useState<AgentBindingData[]>([])
  const [categories, setCategories] = useState<CategoryBindingData[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null)
  const [isDefaultModelDropdownOpen, setIsDefaultModelDropdownOpen] = useState(false)

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
      const [agentResult, categoryResult, modelResult, defaultModelResult] = await Promise.allSettled([
        window.codeall.invoke('agent-binding:list') as Promise<AgentBindingData[]>,
        window.codeall.invoke('category-binding:list') as Promise<CategoryBindingData[]>,
        window.codeall.invoke('model:list') as Promise<Model[]>,
        window.codeall.invoke('setting:get', 'defaultModelId') as Promise<string | null>
      ])

      const agentList = agentResult.status === 'fulfilled' ? agentResult.value : []
      const categoryList = categoryResult.status === 'fulfilled' ? categoryResult.value : []
      const modelList = modelResult.status === 'fulfilled' ? modelResult.value : []
      const defaultModel = defaultModelResult.status === 'fulfilled' ? defaultModelResult.value : null

      if (agentResult.status === 'rejected') {
        console.error('Failed to load agent bindings:', agentResult.reason)
      }
      if (categoryResult.status === 'rejected') {
        console.error('Failed to load category bindings:', categoryResult.reason)
      }
      if (modelResult.status === 'rejected') {
        console.error('Failed to load models:', modelResult.reason)
      }
      if (defaultModelResult.status === 'rejected') {
        console.error('Failed to load default model setting:', defaultModelResult.reason)
      }

      // Merge DB bindings with static definitions for Agents
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

      // Merge DB bindings with static definitions for Categories
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
      setDefaultModelId(defaultModel)
    } catch (error) {
      console.error('Failed to load binding data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

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

  const handleUpdateDefaultModel = async (modelId: string | null) => {
    if (!window.codeall) return

    try {
      await window.codeall.invoke('setting:set', { key: 'defaultModelId', value: modelId })
      setDefaultModelId(modelId)
      setIsDefaultModelDropdownOpen(false)
    } catch (error) {
      console.error('Failed to update default model:', error)
    }
  }

  const defaultModel = models.find(m => m.id === defaultModelId)

  const primaryAgents = agents.filter(a => a.agentType === 'primary')
  const subagents = agents.filter(a => a.agentType === 'subagent')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500 text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Default Model Setting */}
      <div className="bg-slate-900/50 border border-slate-800/70 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-200">默认模型</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                未单独配置模型的智能体和任务类别将使用此模型
              </p>
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDefaultModelDropdownOpen(!isDefaultModelDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 hover:bg-slate-700 transition-colors min-w-[200px] justify-between"
            >
              <span className={defaultModel ? 'text-slate-200' : 'text-slate-500'}>
                {defaultModel?.modelName ?? '请选择默认模型'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDefaultModelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDefaultModelDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleUpdateDefaultModel(null)}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-700 transition-colors ${!defaultModelId ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400'}`}
                >
                  无（使用各智能体默认配置）
                </button>
                {models.map(model => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleUpdateDefaultModel(model.id)}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-700 transition-colors ${model.id === defaultModelId ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-200'}`}
                  >
                    <span className="font-mono">{model.modelName}</span>
                    {model.provider && (
                      <span className="text-slate-500 text-xs ml-2">({model.provider})</span>
                    )}
                  </button>
                ))}
                {models.length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-500 text-center">
                    暂无可用模型，请先在 API服务商 中添加
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/50 pb-3">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-slate-800/80 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
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
            <p className="text-xs text-slate-500 mb-4">
              主要智能体负责核心任务编排和执行，可以调用其他智能体协同工作
            </p>
            {primaryAgents.map(agent => (
              <AgentCard
                key={agent.agentCode}
                agent={agent}
                models={models}
                onUpdate={handleUpdateAgent}
                onReset={handleResetAgent}
              />
            ))}
            {primaryAgents.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                暂无主要智能体配置
              </div>
            )}
          </>
        )}

        {activeTab === 'subagent' && (
          <>
            <p className="text-xs text-slate-500 mb-4">
              辅助智能体专注于特定任务，如代码探索、文档查找、架构咨询等
            </p>
            {subagents.map(agent => (
              <AgentCard
                key={agent.agentCode}
                agent={agent}
                models={models}
                onUpdate={handleUpdateAgent}
                onReset={handleResetAgent}
              />
            ))}
            {subagents.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                暂无辅助智能体配置
              </div>
            )}
          </>
        )}

        {activeTab === 'category' && (
          <>
            <p className="text-xs text-slate-500 mb-4">
              任务类别定义了不同类型任务的默认处理方式和模型配置
            </p>
            {categories.map(category => (
              <CategoryCard
                key={category.categoryCode}
                category={category}
                models={models}
                onUpdate={handleUpdateCategory}
                onReset={handleResetCategory}
              />
            ))}
            {categories.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                暂无任务类别配置
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

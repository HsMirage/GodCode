/**
 * 智能体绑定管理页面
 * 包含主要智能体、辅助智能体、任务类别三个子 Tab
 */

import { useState, useEffect, useCallback } from 'react'
import { Bot, Users, Layers } from 'lucide-react'
import { AgentCard } from './AgentCard'
import { CategoryCard } from './CategoryCard'
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

  const loadData = useCallback(async () => {
    if (!window.codeall) {
      console.warn('[AgentBindingPanel] window.codeall not available')
      setLoading(false)
      return
    }

    try {
      const [agentList, categoryList, modelList] = await Promise.all([
        window.codeall.invoke('agent-binding:list') as Promise<AgentBindingData[]>,
        window.codeall.invoke('category-binding:list') as Promise<CategoryBindingData[]>,
        window.codeall.invoke('model:list') as Promise<Model[]>
      ])

      setAgents(agentList)
      setCategories(categoryList)
      setModels(modelList)
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

  const primaryAgents = agents.filter((a) => a.agentType === 'primary')
  const subagents = agents.filter((a) => a.agentType === 'subagent')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500 text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sub tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/50 pb-3">
        {SUB_TABS.map((tab) => (
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
            {primaryAgents.map((agent) => (
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
            {subagents.map((agent) => (
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
            {categories.map((category) => (
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

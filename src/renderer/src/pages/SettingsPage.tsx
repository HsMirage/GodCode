import { useEffect, useState } from 'react'
import { ApiKeyForm } from '../components/settings/ApiKeyForm'
import { useConfigStore } from '../store/config.store'
import { ModelConfigForm, ModelConfigFormValues } from '../components/ModelConfigForm'
import { DataManagement } from '../components/settings/DataManagement'
import type { Model } from '@renderer/types/domain'
import { ArrowLeft, Check, AlertTriangle } from 'lucide-react'

type Strategy = 'delegate' | 'workforce' | 'direct'

interface RoutingRule {
  pattern: RegExp
  strategy: Strategy
  category?: string
  subagent?: string
  model?: string
}

interface RuleDraft {
  pattern: string
  strategy: Strategy
  category: string
  subagent: string
  model: string
}

const DEFAULT_RULES: RoutingRule[] = [
  {
    pattern: /前端|UI|页面|组件/i,
    strategy: 'delegate',
    category: 'visual-engineering'
  },
  {
    pattern: /后端|API|数据库/i,
    strategy: 'delegate',
    category: 'quick'
  },
  {
    pattern: /架构|设计/i,
    strategy: 'delegate',
    subagent: 'oracle'
  },
  {
    pattern: /创建|开发|实现/i,
    strategy: 'workforce'
  },
  {
    pattern: /.*/i,
    strategy: 'delegate',
    category: 'quick'
  }
]

const panelClass = [
  'rounded-2xl border border-slate-800/70',
  'bg-slate-950/70 backdrop-blur',
  'shadow-[0_0_24px_rgba(15,23,42,0.35)]'
].join(' ')

const TABS = [
  { id: 'llm', label: 'LLM配置' },
  { id: 'keys', label: 'API密钥' },
  { id: 'rules', label: '路由规则' },
  { id: 'data', label: '数据管理' }
]

export function SettingsPage() {
  const { models, loadModels } = useConfigStore()
  const [activeTab, setActiveTab] = useState<'llm' | 'keys' | 'rules' | 'data'>('llm')
  const [rules, setRules] = useState<RoutingRule[]>(DEFAULT_RULES)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Auto-clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
    return
  }, [toast])

  const [draft, setDraft] = useState<RuleDraft>({
    pattern: '.*',
    strategy: 'delegate',
    category: 'quick',
    subagent: 'oracle',
    model: ''
  })

  useEffect(() => {
    async function fetchModels() {
      try {
        const data = (await window.codeall.invoke('model:list')) as Model[]
        loadModels(data)
      } catch (error) {
        console.error('Failed to load models:', error)
      }
    }
    fetchModels()
  }, [loadModels])

  useEffect(() => {
    async function fetchRules() {
      try {
        const data = await window.codeall.invoke('router:get-rules')
        const converted = data.map(r => ({
          ...r,
          pattern: new RegExp(r.pattern, 'i')
        }))
        setRules(converted)
      } catch (error) {
        console.error('Failed to load routing rules:', error)
      }
    }
    fetchRules()
  }, [])

  const handleAdd = async (values: ModelConfigFormValues) => {
    try {
      await window.codeall.invoke('model:create', values)
      const data = (await window.codeall.invoke('model:list')) as Model[]
      loadModels(data)
      setToast({ type: 'success', text: '模型添加成功' })
    } catch (error) {
      console.error('Failed to create model:', error)
      setToast({ type: 'error', text: '添加失败: ' + (error as Error).message })
    }
  }

  const handleSave = async (values: ModelConfigFormValues) => {
    try {
      const model = models[0]
      if (model) {
        await window.codeall.invoke('model:update', { id: model.id, data: values })
        const data = (await window.codeall.invoke('model:list')) as Model[]
        loadModels(data)
        setToast({ type: 'success', text: '模型配置已保存' })
      } else {
        // No model exists, create one instead
        await handleAdd(values)
      }
    } catch (error) {
      console.error('Failed to update model:', error)
      setToast({ type: 'error', text: '保存失败: ' + (error as Error).message })
    }
  }

  const handleDelete = async () => {
    try {
      const model = models[0]
      if (model) {
        await window.codeall.invoke('model:delete', model.id)
        const data = (await window.codeall.invoke('model:list')) as Model[]
        loadModels(data)
        setToast({ type: 'success', text: '模型已删除' })
      }
    } catch (error) {
      console.error('Failed to delete model:', error)
      setToast({ type: 'error', text: '删除失败: ' + (error as Error).message })
    }
  }

  const resetDraft = (rule?: RoutingRule) => {
    setFormError(null)
    if (rule) {
      setDraft({
        pattern: rule.pattern.source,
        strategy: rule.strategy,
        category: rule.category ?? 'quick',
        subagent: rule.subagent ?? 'oracle',
        model: rule.model ?? ''
      })
      return
    }

    setDraft({
      pattern: '.*',
      strategy: 'delegate',
      category: 'quick',
      subagent: 'oracle',
      model: ''
    })
  }

  const startAddRule = () => {
    setEditingIndex(null)
    resetDraft()
  }

  const startEditRule = (index: number) => {
    setEditingIndex(index)
    resetDraft(rules[index])
  }

  const handleRuleDelete = async (index: number) => {
    const updatedRules = rules.filter((_, ruleIndex) => ruleIndex !== index)
    setRules(updatedRules)
    await saveRulesToBackend(updatedRules)
    if (editingIndex === index) {
      setEditingIndex(null)
      resetDraft()
    }
  }

  const handleRuleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    let compiled: RegExp
    try {
      compiled = new RegExp(draft.pattern, 'i')
    } catch (error) {
      setFormError('Pattern 无法解析为正则表达式')
      return
    }

    const nextRule: RoutingRule = {
      pattern: compiled,
      strategy: draft.strategy,
      model: draft.model || undefined,
      category: draft.strategy === 'delegate' ? draft.category : undefined,
      subagent: draft.strategy === 'delegate' ? draft.subagent : undefined
    }

    let updatedRules: RoutingRule[]
    if (editingIndex === null) {
      updatedRules = [...rules, nextRule]
    } else {
      updatedRules = rules.map((rule, index) => (index === editingIndex ? nextRule : rule))
    }

    setRules(updatedRules)
    await saveRulesToBackend(updatedRules)
    setEditingIndex(null)
    resetDraft()
  }

  const saveRulesToBackend = async (updatedRules: RoutingRule[]) => {
    try {
      const serialized = updatedRules.map(r => ({
        pattern: r.pattern.source,
        strategy: r.strategy,
        category: r.category,
        subagent: r.subagent,
        model: r.model
      }))
      await window.codeall.invoke('router:save-rules', serialized)
    } catch (error) {
      console.error('Failed to save routing rules:', error)
    }
  }

  const handleRuleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }
    const next = [...rules]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, moved)
    setRules(next)
    await saveRulesToBackend(next)
    setDragIndex(null)
  }

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
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as 'llm' | 'keys' | 'rules')}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold transition',
                'border border-transparent',
                tab.id === activeTab
                  ? 'bg-slate-900/80 text-white shadow-[0_10px_30px_rgba(15,23,42,0.45)]'
                  : 'text-slate-300 hover:border-slate-700/70 hover:text-white'
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'llm' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Model Studio</p>
              <h2 className="mt-2 text-xl font-semibold text-white">LLM配置</h2>
            </div>
            <div className="text-right text-xs text-slate-500">
              按需创建模型配置并绑定提示词模板
            </div>
          </div>
          <ModelConfigForm onAdd={handleAdd} onSave={handleSave} onDelete={handleDelete} />
        </div>
      ) : null}

      {activeTab === 'keys' ? (
        <div className={`${panelClass} p-6`}>
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Secure Access</p>
            <h2 className="mt-2 text-xl font-semibold text-white">API密钥</h2>
          </div>
          <ApiKeyForm />
        </div>
      ) : null}

      {activeTab === 'rules' ? (
        <div className="space-y-6">
          <div className={`${panelClass} p-6`}>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Routing Matrix</p>
                <h2 className="mt-2 text-xl font-semibold text-white">路由规则</h2>
                <p className="mt-2 text-sm text-slate-400">
                  拖拽调整规则优先级，越靠前匹配越先执行
                </p>
              </div>
              <button
                type="button"
                onClick={startAddRule}
                className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500/80 hover:bg-slate-900"
              >
                + 新建规则
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-[28px_1.4fr_0.8fr_1fr_1fr_140px] gap-3 px-3 text-xs uppercase tracking-[0.3em] text-slate-500">
                <span></span>
                <span>Pattern</span>
                <span>Strategy</span>
                <span>Category</span>
                <span>Agent</span>
                <span className="text-right">Actions</span>
              </div>
              <ul className="space-y-3">
                {rules.map((rule, index) => (
                  <li
                    key={`${rule.pattern.source}-${index}`}
                    aria-label={`拖拽排序规则 ${index + 1}`}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={event => event.preventDefault()}
                    onDragEnd={() => setDragIndex(null)}
                    onDrop={() => handleRuleDrop(index)}
                    className={[
                      'grid grid-cols-[28px_1.4fr_0.8fr_1fr_1fr_140px] items-center gap-3',
                      'rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-3 text-sm text-slate-200',
                      dragIndex === index ? 'ring-2 ring-slate-600/70' : ''
                    ].join(' ')}
                  >
                    <div className="text-slate-500 cursor-grab hover:text-slate-300 transition-colors duration-200">
                      ↕
                    </div>
                    <div className="font-mono text-xs text-slate-100">
                      /{rule.pattern.source}/{rule.pattern.flags}
                    </div>
                    <div className="text-slate-300">{rule.strategy}</div>
                    <div className="text-slate-300">{rule.category ?? '—'}</div>
                    <div className="text-slate-300">{rule.subagent ?? '—'}</div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEditRule(index)}
                        className="rounded-lg border border-slate-700/70 px-2 py-1 text-xs text-slate-200 transition hover:border-slate-500/70"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRuleDelete(index)}
                        className="rounded-lg border border-rose-400/40 px-2 py-1 text-xs text-rose-200 transition hover:border-rose-300/70"
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={`${panelClass} p-6`}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Rule Composer</p>
                <h3 className="mt-2 text-lg font-semibold text-white">新增 / 编辑规则</h3>
              </div>
              {editingIndex !== null ? (
                <span className="rounded-full border border-slate-700/70 px-3 py-1 text-xs text-slate-300">
                  正在编辑第 {editingIndex + 1} 条
                </span>
              ) : null}
            </div>

            <form onSubmit={handleRuleSave} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Pattern</span>
                  <input
                    value={draft.pattern}
                    onChange={event =>
                      setDraft(current => ({ ...current, pattern: event.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-slate-500/80 focus:outline-none"
                    placeholder="输入正则表达式"
                  />
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span>Strategy</span>
                  <select
                    value={draft.strategy}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        strategy: event.target.value as Strategy
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-slate-500/80 focus:outline-none"
                  >
                    <option value="delegate">delegate</option>
                    <option value="workforce">workforce</option>
                    <option value="direct">direct</option>
                  </select>
                </label>
              </div>

              {draft.strategy === 'delegate' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Category</span>
                    <select
                      value={draft.category}
                      onChange={event =>
                        setDraft(current => ({ ...current, category: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-slate-500/80 focus:outline-none"
                    >
                      {[
                        'quick',
                        'visual-engineering',
                        'ultrabrain',
                        'artistry',
                        'writing',
                        'unspecified-low',
                        'unspecified-high'
                      ].map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Agent</span>
                    <select
                      value={draft.subagent}
                      onChange={event =>
                        setDraft(current => ({ ...current, subagent: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-slate-500/80 focus:outline-none"
                    >
                      {['oracle', 'explore', 'librarian'].map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <label className="space-y-2 text-sm text-slate-300">
                <span>Model</span>
                <input
                  value={draft.model}
                  onChange={event =>
                    setDraft(current => ({ ...current, model: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-slate-500/80 focus:outline-none"
                  placeholder="可选，用于覆盖模型"
                />
              </label>

              {formError ? (
                <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="rounded-xl border border-sky-500/30 bg-sky-500/20 px-5 py-2 text-sm font-semibold text-sky-300 transition-all duration-200 hover:border-sky-500/50 hover:bg-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                >
                  {editingIndex === null ? '添加规则' : '保存修改'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingIndex(null)
                    resetDraft()
                  }}
                  className="rounded-xl border border-slate-800/70 px-5 py-2 text-sm text-slate-300 transition hover:border-slate-600/80"
                >
                  清空
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeTab === 'data' ? <DataManagement /> : null}
    </div>
  )
}

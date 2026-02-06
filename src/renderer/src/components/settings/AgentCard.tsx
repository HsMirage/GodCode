/**
 * 智能体卡片组件
 * 用于显示和编辑单个 Agent 的绑定配置
 */

import { useState } from 'react'
import { Bot, ChevronDown, ChevronUp, RotateCcw, Power, PowerOff } from 'lucide-react'
import type { AgentBindingData, UpdateAgentBindingInput } from '@renderer/types/binding'
import type { Model } from '@renderer/types/domain'

interface AgentCardProps {
  agent: AgentBindingData
  models: Model[]
  onUpdate: (agentCode: string, data: UpdateAgentBindingInput) => Promise<void>
  onReset: (agentCode: string) => Promise<void>
}

export function AgentCard({ agent, models, onUpdate, onReset }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [localTemp, setLocalTemp] = useState(agent.temperature)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt || '')

  const handleModelChange = async (modelId: string) => {
    setLoading(true)
    try {
      await onUpdate(agent.agentCode, {
        modelId: modelId === '' ? null : modelId
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTemperatureChange = async () => {
    if (localTemp !== agent.temperature) {
      setLoading(true)
      try {
        await onUpdate(agent.agentCode, { temperature: localTemp })
      } finally {
        setLoading(false)
      }
    }
  }

  const handleToggleEnabled = async () => {
    setLoading(true)
    try {
      await onUpdate(agent.agentCode, { enabled: !agent.enabled })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSystemPrompt = async () => {
    setLoading(true)
    try {
      await onUpdate(agent.agentCode, {
        systemPrompt: systemPrompt || null
      })
      setShowSystemPrompt(false)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('确定要重置此智能体的配置吗？')) return
    setLoading(true)
    try {
      await onReset(agent.agentCode)
      setLocalTemp(agent.temperature)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={[
        'rounded-xl border transition-all',
        agent.enabled
          ? 'border-slate-800/70 bg-slate-950/40 hover:border-slate-700/70'
          : 'border-slate-800/40 bg-slate-950/20 opacity-60'
      ].join(' ')}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={[
              'w-10 h-10 rounded-lg flex items-center justify-center',
              agent.agentType === 'primary'
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-emerald-500/20 text-emerald-400'
            ].join(' ')}
          >
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-slate-200">{agent.agentName}</h3>
            <p className="text-xs text-slate-500">{agent.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Model badge */}
          <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
            {agent.modelName || '默认模型'}
          </span>

          {/* Enable toggle */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              handleToggleEnabled()
            }}
            disabled={loading}
            className={[
              'p-1.5 rounded-lg transition-colors',
              agent.enabled
                ? 'text-emerald-400 hover:bg-emerald-500/20'
                : 'text-slate-500 hover:bg-slate-800'
            ].join(' ')}
            title={agent.enabled ? '已启用' : '已禁用'}
          >
            {agent.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </button>

          {/* Expand toggle */}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-800/50 space-y-4">
          {/* Model selector */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">绑定模型</label>
            <select
              value={agent.modelId || ''}
              onChange={e => handleModelChange(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-slate-500/80 focus:outline-none"
            >
              <option value="">使用默认模型</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.modelName} ({model.provider})
                </option>
              ))}
            </select>
          </div>

          {/* Temperature slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-medium">温度</label>
              <span className="text-xs text-slate-500">{localTemp.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={localTemp}
              onChange={e => setLocalTemp(parseFloat(e.target.value))}
              onMouseUp={handleTemperatureChange}
              onTouchEnd={handleTemperatureChange}
              disabled={loading}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Tools display */}
          {agent.tools.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">可用工具</label>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map(tool => (
                  <span
                    key={tool}
                    className="text-xs bg-slate-800/50 text-slate-400 px-2 py-0.5 rounded"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* System Prompt Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-medium">
                系统提示词 (System Prompt)
              </label>
              <button
                type="button"
                onClick={() => {
                  setSystemPrompt(agent.systemPrompt || '')
                  setShowSystemPrompt(!showSystemPrompt)
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showSystemPrompt ? '收起' : agent.systemPrompt ? '编辑' : '添加'}
              </button>
            </div>

            {showSystemPrompt ? (
              <div className="space-y-2">
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="输入系统提示词..."
                  disabled={loading}
                  rows={6}
                  className="w-full rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500/50 focus:outline-none resize-none font-mono"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSystemPrompt(false)}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSystemPrompt}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors text-xs font-medium"
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              agent.systemPrompt && (
                <div
                  className="p-3 rounded-lg bg-slate-950/20 border border-slate-800/40 text-xs text-slate-400 font-mono line-clamp-3 cursor-pointer hover:border-slate-700/50 transition-colors"
                  onClick={() => {
                    setSystemPrompt(agent.systemPrompt || '')
                    setShowSystemPrompt(true)
                  }}
                >
                  {agent.systemPrompt}
                </div>
              )
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800/70 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置默认
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

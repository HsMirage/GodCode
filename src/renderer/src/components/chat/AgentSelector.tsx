import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Bot } from 'lucide-react'
import { cn } from '../../utils'

export interface AgentOption {
  code: string
  name: string
  chineseName: string
  description: string
}

// 四个主要 Agent 定义
const PRIMARY_AGENTS: AgentOption[] = [
  {
    code: 'fuxi',
    name: '伏羲(FuXi)',
    chineseName: '伏羲',
    description: '战略规划器，负责需求澄清与计划交接'
  },
  {
    code: 'haotian',
    name: '昊天(HaoTian)',
    chineseName: '昊天',
    description: '主编排器，负责分解/委派/检查点/集成'
  },
  {
    code: 'kuafu',
    name: '夸父(KuaFu)',
    chineseName: '夸父',
    description: '执行器，按计划执行并输出结构化证据回执'
  },
  {
    code: 'luban',
    name: '鲁班(LuBan)',
    chineseName: '鲁班',
    description: '自主深度工作者，深入研究后果断行动'
  }
]

export interface AgentSelectorProps {
  selectedAgent: string
  onAgentChange: (agentCode: string) => void
  disabled?: boolean
}

export function AgentSelector({ selectedAgent, onAgentChange, disabled }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedAgentInfo = PRIMARY_AGENTS.find(a => a.code === selectedAgent) || PRIMARY_AGENTS[0]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'h-9 flex items-center gap-1.5 px-2.5 rounded-lg border transition-colors',
          isOpen
            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200'
            : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
          disabled && 'cursor-not-allowed text-[var(--text-muted)] hover:bg-transparent'
        )}
        title={`当前智能体: ${selectedAgentInfo.chineseName}`}
      >
        <Bot className="h-4 w-4" />
        <span className="text-xs">{selectedAgentInfo.chineseName}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] backdrop-blur shadow-xl z-50">
          <div className="p-2">
            <div className="text-xs text-[var(--text-muted)] px-2 py-1 mb-1">选择智能体</div>
            {PRIMARY_AGENTS.map(agent => (
              <button
                key={agent.code}
                type="button"
                onClick={() => {
                  onAgentChange(agent.code)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left transition-colors',
                  selectedAgent === agent.code
                    ? 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-200'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-sm font-medium">{agent.chineseName}</span>
                  <span className="text-xs text-[var(--text-muted)]">({agent.code})</span>
                </div>
                <span className="text-xs text-[var(--text-muted)] ml-6">{agent.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

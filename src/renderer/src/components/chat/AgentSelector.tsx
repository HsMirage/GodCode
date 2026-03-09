import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Bot } from 'lucide-react'
import { cn } from '../../utils'
import { AGENT_DEFINITIONS, AGENT_PRESET_DEFINITIONS } from '@shared/agent-definitions'
import { UI_TEXT } from '../../constants/i18n'

interface PresetOption {
  id: string
  label: string
  description: string
  mappedAgentCode: string
  mappedAgentName: string
}

const AGENT_NAME_MAP = new Map(AGENT_DEFINITIONS.map(agent => [agent.code, agent.chineseName]))

const PRESET_OPTIONS: PresetOption[] = AGENT_PRESET_DEFINITIONS.map(preset => ({
  id: preset.id,
  label: preset.label,
  description: preset.description,
  mappedAgentCode: preset.mappedAgentCode,
  mappedAgentName: AGENT_NAME_MAP.get(preset.mappedAgentCode) ?? preset.mappedAgentCode
}))

const DROPDOWN_ESTIMATED_HEIGHT = 320

export interface AgentSelectorProps {
  selectedAgent: string
  onAgentChange: (agentCode: string) => void
  disabled?: boolean
}

export function AgentSelector({ selectedAgent, onAgentChange, disabled }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('up')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedPreset = PRESET_OPTIONS.find(option => option.mappedAgentCode === selectedAgent)
  const selectedAgentName = AGENT_NAME_MAP.get(selectedAgent) ?? selectedAgent

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) {
      return
    }

    const rect = dropdownRef.current.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom

    setMenuPlacement(
      spaceAbove >= DROPDOWN_ESTIMATED_HEIGHT || spaceAbove >= spaceBelow ? 'up' : 'down'
    )
  }, [isOpen])

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
        title={UI_TEXT.agentSelector.currentAgentTitle(selectedAgentName)}
      >
        <Bot className="h-4 w-4" />
        <span className="text-xs">{selectedPreset?.label ?? selectedAgentName}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 w-72 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] backdrop-blur shadow-xl z-50',
            menuPlacement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <div className="p-2">
            <div className="text-xs text-[var(--text-muted)] px-2 py-1 mb-1">
              {UI_TEXT.agentSelector.choosePreset}
            </div>
            {PRESET_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onAgentChange(option.mappedAgentCode)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-left transition-colors',
                  selectedPreset?.id === option.id
                    ? 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-200'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-[var(--text-muted)]">→ {option.mappedAgentName}</span>
                </div>
                <span className="text-xs text-[var(--text-muted)] ml-6">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

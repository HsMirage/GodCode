import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Trash2,
  ChevronDown,
  Terminal,
  Brain,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react'
import { useAgentStore, WorkLogEntry } from '../../store/agent.store'
import { cn } from '../../utils'

interface AgentWorkViewerProps {
  agentId: string
  className?: string
}

export function AgentWorkViewer({ agentId, className }: AgentWorkViewerProps) {
  const { agents, workLogs } = useAgentStore()
  const agent = agents.find(a => a.id === agentId)
  const logs = workLogs[agentId] || []

  const [autoScroll, setAutoScroll] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [elapsedTime, setElapsedTime] = useState('00:00')

  useEffect(() => {
    if (!agent || agent.status !== 'working') return

    const start = new Date()
    const interval = setInterval(() => {
      const now = new Date()
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000)
      const minutes = Math.floor(diff / 60)
        .toString()
        .padStart(2, '0')
      const seconds = (diff % 60).toString().padStart(2, '0')
      setElapsedTime(`${minutes}:${seconds}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [agent])

  useEffect(() => {
    if (autoScroll && !isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length, autoScroll, isPaused])

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Select an agent to view their work
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-slate-900 rounded-lg border border-slate-700 overflow-hidden',
        className
      )}
    >
      <div className="p-3 border-b border-slate-700 bg-slate-900 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            {agent.name}
          </h3>
          <div className="text-xs text-slate-400 flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3" />
              {agent.currentTask || 'Idle'}
            </span>
            {agent.status === 'working' && (
              <span className="flex items-center gap-1 text-indigo-400">
                <Clock className="w-3 h-3" />
                {elapsedTime}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'p-1.5 rounded hover:bg-slate-800 transition-colors',
              autoScroll ? 'text-indigo-400' : 'text-slate-500'
            )}
            title="Auto-scroll"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              /* Clear logs handler */
            }}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm bg-slate-950"
      >
        {logs.map(log => (
          <LogEntry key={log.id} entry={log} />
        ))}

        {agent.status === 'working' && logs.length > 0 && (
          <div className="flex items-center gap-2 text-indigo-500 animate-pulse text-xs mt-2 ml-1">
            <Zap className="w-3 h-3" />
            <span>Agent is working...</span>
          </div>
        )}
      </div>
    </div>
  )
}

function LogEntry({ entry }: { entry: WorkLogEntry }) {
  const getIcon = () => {
    switch (entry.type) {
      case 'thinking':
        return <Brain className="w-3.5 h-3.5 text-slate-400" />
      case 'action':
        return <Cpu className="w-3.5 h-3.5 text-blue-400" />
      case 'result':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
      case 'tool_call':
        return <Terminal className="w-3.5 h-3.5 text-purple-400" />
      case 'tool_result':
        return <Terminal className="w-3.5 h-3.5 text-cyan-400" />
      case 'streaming':
        return <Zap className="w-3.5 h-3.5 text-yellow-400" />
      default:
        return <div className="w-3.5 h-3.5" />
    }
  }

  const getColors = () => {
    switch (entry.type) {
      case 'thinking':
        return 'text-slate-400 border-l-2 border-slate-700 pl-3'
      case 'action':
        return 'text-blue-300'
      case 'result':
        return 'text-green-300 bg-green-950/20 p-2 rounded border border-green-900/50'
      case 'error':
        return 'text-red-300 bg-red-950/20 p-2 rounded border border-red-900/50'
      case 'tool_call':
        return 'text-purple-300 bg-purple-950/10 p-2 rounded'
      case 'tool_result':
        return 'text-cyan-300 bg-cyan-950/10 p-2 rounded'
      case 'streaming':
        return 'text-yellow-200/80 italic'
      default:
        return 'text-slate-300'
    }
  }

  return (
    <div className={cn('text-xs leading-relaxed break-words', getColors())}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 opacity-70">{getIcon()}</span>
        <div className="flex-1">
          <span className="opacity-50 text-[10px] mr-2 select-none">
            {new Date(entry.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </span>
          {entry.type === 'tool_call' ? (
            <span>
              Executing <span className="font-bold text-purple-200">{entry.message}</span>
              {entry.metadata && (
                <span className="opacity-70 ml-2">{JSON.stringify(entry.metadata)}</span>
              )}
            </span>
          ) : (
            <span>{entry.message}</span>
          )}
        </div>
      </div>
    </div>
  )
}

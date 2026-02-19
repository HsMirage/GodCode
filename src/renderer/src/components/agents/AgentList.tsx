import { Bot, Activity, Clock, Cpu, MoreVertical } from 'lucide-react'
import { useAgentStore, Agent } from '../../store/agent.store'
import { cn } from '../../utils'

export function AgentList() {
  const { agents, selectAgent, selectedAgentId } = useAgentStore()

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map(agent => (
        <AgentCard
          key={agent.id}
          agent={agent}
          isSelected={selectedAgentId === agent.id}
          onClick={() => selectAgent(agent.id)}
        />
      ))}
    </div>
  )
}

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}

function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  const statusColors = {
    idle: 'bg-slate-800 text-slate-400 border-slate-700',
    working: 'bg-indigo-950/30 text-indigo-300 border-indigo-500/50',
    error: 'bg-red-950/30 text-red-300 border-red-500/50',
    completed: 'bg-green-950/30 text-green-300 border-green-500/50'
  }

  const statusBadgeColors = {
    idle: 'bg-slate-700 text-slate-300',
    working: 'bg-indigo-500 text-white animate-pulse',
    error: 'bg-red-500 text-white',
    completed: 'bg-green-500 text-white'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left relative group p-4 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500',
        statusColors[agent.status],
        isSelected ? 'ring-2 ring-indigo-500 shadow-indigo-500/10' : 'hover:border-slate-600'
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              agent.status === 'working'
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-slate-700/50 text-slate-400'
            )}
          >
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-100">{agent.name}</h3>
            <p className="text-xs text-slate-400">{agent.role}</p>
          </div>
        </div>

        <span
          className={cn(
            'px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider',
            statusBadgeColors[agent.status]
          )}
        >
          {agent.status}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity className="w-3.5 h-3.5" />
          <span className="truncate flex-1">{agent.currentTask || 'Waiting for tasks...'}</span>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5" title="Tasks Completed">
            <Clock className="w-3 h-3" />
            <span>{agent.tasksCompleted} tasks</span>
          </div>
          <div className="flex items-center gap-1.5" title="Tokens Used">
            <Cpu className="w-3 h-3" />
            <span>{(agent.tokensUsed / 1000).toFixed(1)}k tok</span>
          </div>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 truncate" title={agent.model || '未识别'}>
          model: {agent.model || '未识别'}
        </div>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white">
          <MoreVertical className="w-4 h-4" />
        </div>
      </div>
    </button>
  )
}

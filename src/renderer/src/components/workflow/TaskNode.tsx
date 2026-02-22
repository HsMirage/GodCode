import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { Task } from '@/types/domain'
import { useTraceNavigationStore } from '../../store/trace-navigation.store'

export interface TaskNodeData extends Record<string, unknown> {
  task: Task
  duration?: number
  highlighted?: boolean
  onSelectTask?: (task: Task) => void
}

const statusColors = {
  pending: 'border-slate-600 bg-slate-900/50',
  running: 'border-sky-500 bg-sky-950/50 shadow-[0_0_12px_rgba(14,165,233,0.3)]',
  completed: 'border-emerald-500 bg-emerald-950/50',
  failed: 'border-rose-500 bg-rose-950/50',
  cancelled: 'border-amber-500 bg-amber-950/50'
}

const statusTextColors = {
  pending: 'text-slate-400',
  running: 'text-sky-300',
  completed: 'text-emerald-300',
  failed: 'text-rose-300',
  cancelled: 'text-amber-300'
}

export const TaskNode = memo((props: NodeProps) => {
  const data = props.data as TaskNodeData
  const { task, duration, highlighted = false, onSelectTask } = data
  const requestNavigate = useTraceNavigationStore(state => state.requestNavigate)
  const colorClass = statusColors[task.status]
  const textColorClass = statusTextColors[task.status]

  // Add animation class for completed tasks
  const animationClass =
    task.status === 'completed'
      ? 'shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-500'
      : ''

  const highlightClass = highlighted
    ? 'ring-2 ring-sky-400 shadow-[0_0_18px_rgba(14,165,233,0.45)]'
    : ''

  const handleOpenLinkedContext = () => {
    const metadata = (task.metadata || {}) as Record<string, unknown>
    const runId = typeof metadata.runId === 'string' ? metadata.runId : undefined
    requestNavigate({
      source: 'workflow-node',
      taskId: task.id,
      runId,
      agentId: task.assignedAgent || undefined,
      preferredView: runId ? 'agent' : 'workflow'
    })
  }

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-slate-600" />

      <button
        type="button"
        onClick={() => onSelectTask?.(task)}
        className={`min-w-[200px] max-w-[280px] rounded-xl border backdrop-blur transition-all text-left ${colorClass} ${animationClass} ${highlightClass}`}
      >
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-xs font-medium uppercase tracking-wide ${textColorClass}`}>
              {task.status}
            </span>
            {duration !== undefined && (
              <span className="text-xs text-slate-400">{duration.toFixed(1)}s</span>
            )}
          </div>

          <p className="mb-2 text-sm leading-relaxed text-slate-200">{task.input}</p>

          <div className="flex flex-col gap-1 text-xs text-slate-400">
            {task.assignedModel && (
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Model:</span>
                <span className="font-mono">{task.assignedModel}</span>
              </div>
            )}
            {task.assignedAgent && (
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Agent:</span>
                <span>{task.assignedAgent}</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                handleOpenLinkedContext()
              }}
              className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              View linked logs
            </button>
          </div>
        </div>
      </button>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-600" />
    </div>
  )
})

TaskNode.displayName = 'TaskNode'

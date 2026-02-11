import { Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react'
import { cn } from '../../utils'
import type { StreamingToolCall } from '../../store/streaming.store'

interface ToolCallDisplayProps {
  toolCalls: StreamingToolCall[]
  className?: string
}

/**
 * Component to display tool call status during streaming
 */
export function ToolCallDisplay({ toolCalls, className }: ToolCallDisplayProps) {
  if (toolCalls.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-2 my-2', className)}>
      {toolCalls.map((tc) => (
        <div
          key={tc.id}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
            'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
            tc.status === 'running' && 'border-amber-500/50',
            tc.status === 'completed' && 'border-emerald-500/50',
            tc.status === 'failed' && 'border-red-500/50'
          )}
        >
          <ToolStatusIcon status={tc.status} />
          <span className="font-medium text-[var(--text-secondary)]">{tc.name}</span>
          <ToolStatusText status={tc.status} startedAt={tc.startedAt} completedAt={tc.completedAt} />
        </div>
      ))}
    </div>
  )
}

function ToolStatusIcon({ status }: { status: StreamingToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <Wrench className="w-3.5 h-3.5 text-[var(--text-muted)]" />
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-500" />
  }
}

function ToolStatusText({
  status,
  startedAt,
  completedAt
}: {
  status: StreamingToolCall['status']
  startedAt?: number
  completedAt?: number
}) {
  const duration = startedAt && completedAt ? Math.round((completedAt - startedAt) / 1000) : null

  return (
    <span className="text-[var(--text-muted)] ml-auto">
      {status === 'pending' && 'Waiting...'}
      {status === 'running' && 'Running...'}
      {status === 'completed' && (duration !== null ? `Done (${duration}s)` : 'Done')}
      {status === 'failed' && 'Failed'}
    </span>
  )
}

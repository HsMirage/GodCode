import { Loader2, CheckCircle2, XCircle, Wrench, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { cn } from '../../utils'
import type { StreamingToolCall, ToolPermissionPreview } from '../../store/streaming.store'

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
          {tc.permissionPreview && <ToolPermissionPreviewBadge preview={tc.permissionPreview} />}
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

function ToolPermissionPreviewBadge({ preview }: { preview: ToolPermissionPreview }) {
  const denied = !preview.allowedByPolicy || preview.permission === 'deny'
  const requiresConfirm = !denied && (preview.requiresConfirmation || preview.permission === 'confirm')
  const autoAllowed = !denied && !requiresConfirm && (preview.allowedWithoutConfirmation || preview.permission === 'auto')

  const label = denied ? 'Denied' : requiresConfirm ? 'Confirm' : autoAllowed ? 'Auto' : 'Policy'
  const Icon = denied ? ShieldX : requiresConfirm ? ShieldAlert : ShieldCheck
  const reason = preview.confirmReason || preview.reason
  const title = [
    `Permission: ${label}`,
    `Template: ${preview.template}`,
    `Policy permission: ${preview.permission}`,
    `Policy decision: ${preview.allowedByPolicy ? 'allow' : 'deny'}`,
    `Requires confirmation: ${preview.requiresConfirmation ? 'yes' : 'no'}`,
    `High risk: ${preview.highRisk ? 'yes' : 'no'}`,
    reason ? `Reason: ${reason}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        denied
          ? 'border-red-500/40 text-red-500'
          : requiresConfirm
            ? 'border-amber-500/40 text-amber-500'
            : 'border-emerald-500/40 text-emerald-500'
      )}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      <span className="opacity-80">· {preview.template}</span>
      <span className="opacity-80">· {preview.permission}</span>
      {preview.highRisk && <span className="opacity-80">· high-risk</span>}
      {preview.requiresConfirmation && <span className="opacity-80">· confirm</span>}
    </span>
  )
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

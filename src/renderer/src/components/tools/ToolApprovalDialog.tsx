import type { ToolApprovalRequest } from '@shared/tool-approval-contract'

interface ToolApprovalDialogProps {
  request: ToolApprovalRequest | null
  busy?: boolean
  onApprove?: () => void | Promise<void>
  onReject?: () => void | Promise<void>
}

const riskClassMap = {
  low: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  high: 'border-rose-500/30 bg-rose-500/10 text-rose-200'
} as const

function formatArguments(argumentsValue: Record<string, unknown>): string {
  try {
    return JSON.stringify(argumentsValue, null, 2)
  } catch {
    return String(argumentsValue)
  }
}

export function ToolApprovalDialog({ request, busy = false, onApprove, onReject }: ToolApprovalDialogProps) {
  if (!request) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] shadow-2xl">
        <div className="border-b border-[var(--border-primary)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">工具执行审批</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">当前执行已暂停，等待确认后继续。</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${riskClassMap[request.riskLevel]}`}>
              {request.riskLevel === 'high' ? '高风险' : request.riskLevel === 'medium' ? '中风险' : '低风险'}
            </span>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <div className="text-xs text-[var(--text-muted)]">工具</div>
              <div className="mt-1 font-mono text-[var(--text-primary)]">{request.toolName}</div>
            </div>
            <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
              <div className="text-xs text-[var(--text-muted)]">任务 ID</div>
              <div className="mt-1 break-all font-mono text-[var(--text-primary)]">{request.taskId || '—'}</div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
            <div className="text-xs text-[var(--text-muted)]">审批原因</div>
            <div className="mt-1 text-[var(--text-primary)]">{request.reason}</div>
          </div>

          <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
            <div className="text-xs text-[var(--text-muted)]">参数</div>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 text-xs text-[var(--text-primary)]">
              {formatArguments(request.arguments)}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-primary)] px-5 py-4">
          <button
            type="button"
            onClick={() => void onReject?.()}
            disabled={busy}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            拒绝并终止
          </button>
          <button
            type="button"
            onClick={() => void onApprove?.()}
            disabled={busy}
            className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? '处理中…' : '批准并继续'}
          </button>
        </div>
      </div>
    </div>
  )
}


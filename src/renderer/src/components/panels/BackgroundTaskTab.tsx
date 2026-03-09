import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Terminal,
  XCircle
} from 'lucide-react'
import { TaskPanelSectionBoundary } from './TaskPanelSectionBoundary'
import {
  formatBytes,
  type BackgroundTaskInfo,
  type BackgroundTaskOutputState
} from './task-panel-shared'

interface BackgroundTaskTabProps {
  loading: boolean
  error: string | null
  backgroundTasks: BackgroundTaskInfo[]
  backgroundRunning: BackgroundTaskInfo[]
  backgroundFinished: BackgroundTaskInfo[]
  expandedTaskIds: Record<string, boolean>
  outputByTaskId: Record<string, BackgroundTaskOutputState>
  onRetry: () => void
  onCancelTask: (taskId: string) => void
  onToggleTaskExpanded: (taskId: string) => void
}

function BackgroundTaskCard({
  task,
  expanded,
  outputState,
  onToggle,
  onCancel
}: {
  task: BackgroundTaskInfo
  expanded: boolean
  outputState?: BackgroundTaskOutputState
  onToggle: () => void
  onCancel?: () => void
}) {
  const output = outputState?.chunks || []
  const outputMeta = outputState?.outputMeta
  const failed = task.status === 'error' || task.status === 'interrupt' || task.status === 'timeout'
  const isRunning = task.status === 'running' || task.status === 'pending'

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]" />
          )}
          {isRunning ? (
            <Terminal className="h-4 w-4 flex-shrink-0 text-sky-400" />
          ) : failed ? (
            <XCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
          ) : task.status === 'cancelled' ? (
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          )}
          <span className="truncate font-mono text-xs text-[var(--text-primary)]">
            {task.input || task.description || task.command}
          </span>
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
          >
            <Ban className="mr-1 inline h-3.5 w-3.5" />
            取消
          </button>
        ) : (
          <span className="text-[10px] uppercase text-[var(--text-muted)]">{task.status}</span>
        )}
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 ui-border">
          <div className="mb-2 break-all font-mono text-[11px] text-[var(--text-muted)]">
            {task.input || task.command}
          </div>
          {outputMeta && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                总输出: {formatBytes(outputMeta.total)}
              </span>
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                stdout: {formatBytes(outputMeta.stdout)}
              </span>
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                stderr: {formatBytes(outputMeta.stderr)}
              </span>
              {outputMeta.truncated && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  输出已截断
                </span>
              )}
            </div>
          )}
          <pre className="max-h-56 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded bg-[var(--bg-tertiary)] p-2 text-[11px] leading-5 text-[var(--text-primary)]">
            {output.length === 0
              ? isRunning
                ? '等待输出...'
                : '无输出'
              : output.map(chunk => chunk.data).join('')}
          </pre>
        </div>
      )}
    </div>
  )
}

export function BackgroundTaskTab({
  loading,
  error,
  backgroundTasks,
  backgroundRunning,
  backgroundFinished,
  expandedTaskIds,
  outputByTaskId,
  onRetry,
  onCancelTask,
  onToggleTaskExpanded
}: BackgroundTaskTabProps) {
  return (
    <TaskPanelSectionBoundary
      title="后台终端任务"
      resetKey={`background-${backgroundTasks.length}-${loading ? 'loading' : 'ready'}`}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">终端任务加载失败</p>
                <p className="mt-1 text-rose-200/80">{error}</p>
              </div>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] hover:bg-rose-500/20"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : backgroundTasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            No background terminal tasks
          </div>
        ) : (
          <div className="space-y-2">
            {backgroundRunning.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  运行中 ({backgroundRunning.length})
                </h3>
                {backgroundRunning.map(task => (
                  <BackgroundTaskCard
                    key={task.id}
                    task={task}
                    expanded={expandedTaskIds[task.id] ?? false}
                    outputState={outputByTaskId[task.id]}
                    onToggle={() => onToggleTaskExpanded(task.id)}
                    onCancel={() => onCancelTask(task.id)}
                  />
                ))}
              </div>
            )}

            {backgroundFinished.length > 0 && (
              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                  已完成 ({backgroundFinished.length})
                </h3>
                {backgroundFinished.slice(0, 20).map(task => (
                  <BackgroundTaskCard
                    key={task.id}
                    task={task}
                    expanded={expandedTaskIds[task.id] ?? false}
                    outputState={outputByTaskId[task.id]}
                    onToggle={() => onToggleTaskExpanded(task.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </TaskPanelSectionBoundary>
  )
}

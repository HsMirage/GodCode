import { useMemo } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Link2,
  Loader2,
  ShieldAlert,
  Stethoscope,
  Terminal,
  XCircle
} from 'lucide-react'
import type { Task } from '@renderer/types/domain'
import {
  getFallbackReasonLabel,
  getModelSelectionReasonLabel,
  getModelSelectionSourceLabel
} from '@shared/model-selection-contract'
import { sanitizeDisplayOutput } from '../../utils/output-sanitizer'
import type { TaskDetailTab } from './task-panel-detail'
import { TaskPanelSectionBoundary } from './TaskPanelSectionBoundary'
import type { TaskDiagnosticSummary } from './task-panel-diagnostics'
import {
  buildFallbackAttemptText,
  diagnosticBadgeConfig,
  resolveTaskBindingSnapshot,
  type TaskBindingSnapshot,
  type TaskFilterStatus,
  type TaskSortMode
} from './task-panel-shared'

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-slate-400',
    bg: 'bg-slate-500/20',
    label: '等待中'
  },
  running: {
    icon: Loader2,
    color: 'text-sky-400',
    bg: 'bg-sky-500/20',
    label: '运行中'
  },
  pending_approval: {
    icon: ShieldAlert,
    color: 'text-violet-300',
    bg: 'bg-violet-500/20',
    label: '等待审批'
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    label: '已完成'
  },
  failed: {
    icon: XCircle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/20',
    label: '失败'
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    label: '已取消'
  }
} as const

interface TaskListTabProps {
  loading: boolean
  error: string | null
  tasks: Task[]
  filteredTasks: Task[]
  runningTasks: Task[]
  pendingTasks: Task[]
  completedTasks: Task[]
  taskSearch: string
  taskStatusFilter: TaskFilterStatus
  taskSortMode: TaskSortMode
  completedTaskLimit: number
  hasTaskFilters: boolean
  bindingSnapshots: Record<string, TaskBindingSnapshot>
  taskDiagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
  highlightedTaskId: string | null
  onTaskSearchChange: (value: string) => void
  onTaskStatusFilterChange: (value: TaskFilterStatus) => void
  onTaskSortModeChange: (value: TaskSortMode) => void
  onCompletedTaskLimitChange: (value: number | ((prev: number) => number)) => void
  onResetFilters: () => void
  onRetry: () => void
  onTaskLinkage: (task: Task) => void
  onTaskDetail: (task: Task, defaultTab?: TaskDetailTab) => void
  onTaskOutput: (task: Task) => void
}

interface TaskCardProps {
  task: Task
  bindingSnapshot?: TaskBindingSnapshot
  diagnostic?: TaskDiagnosticSummary
  onLinkClick: (task: Task) => void
  onDetailClick: (task: Task, defaultTab?: TaskDetailTab) => void
  onOpenOutput: (task: Task) => void
}

function TaskCard({
  task,
  bindingSnapshot,
  diagnostic,
  onLinkClick,
  onDetailClick,
  onOpenOutput
}: TaskCardProps) {
  const config = statusConfig[task.status]
  const Icon = config.icon
  const isRunning = task.status === 'running'
  const resolvedBindingSnapshot = resolveTaskBindingSnapshot(task, bindingSnapshot)
  const modelSourceLabel = resolvedBindingSnapshot.modelSelectionSource
    ? getModelSelectionSourceLabel(resolvedBindingSnapshot.modelSelectionSource)
    : resolvedBindingSnapshot.modelSource
      ? getModelSelectionSourceLabel(resolvedBindingSnapshot.modelSource)
      : null
  const modelReasonLabel = resolvedBindingSnapshot.modelSelectionReason
    ? getModelSelectionReasonLabel(resolvedBindingSnapshot.modelSelectionReason)
    : null
  const fallbackReasonLabel = resolvedBindingSnapshot.fallbackReason
    ? getFallbackReasonLabel(resolvedBindingSnapshot.fallbackReason)
    : null
  const fallbackAttemptText = buildFallbackAttemptText(
    resolvedBindingSnapshot.fallbackAttemptSummary
  )
  const displayOutput = task.output ? sanitizeDisplayOutput(task.output) : ''

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 transition-colors hover:border-[var(--border-secondary)]">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-1.5 ${config.bg}`}>
          <Icon className={`h-4 w-4 ${config.color} ${isRunning ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-[var(--text-primary)]">{task.input}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs ${config.color}`}>{config.label}</span>
            {task.assignedAgent && (
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                {task.assignedAgent}
              </span>
            )}
            {task.assignedModel && (
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {task.assignedModel}
              </span>
            )}
            {modelSourceLabel && (
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                来源: {modelSourceLabel}
              </span>
            )}
            {modelReasonLabel && (
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                命中: {modelReasonLabel}
              </span>
            )}
            {resolvedBindingSnapshot.concurrencyKey && (
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                并发键: {resolvedBindingSnapshot.concurrencyKey}
              </span>
            )}
            {diagnostic && (
              <button
                type="button"
                onClick={() => onDetailClick(task, 'diagnostic')}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] hover:opacity-90 ${diagnosticBadgeConfig[diagnostic.category]}`}
                title={diagnostic.reason}
              >
                <Stethoscope className="h-3 w-3" />
                {diagnostic.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onLinkClick(task)}
              className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-300 hover:bg-sky-500/20"
            >
              <Link2 className="h-3 w-3" />
              关联追踪
            </button>
            <button
              type="button"
              onClick={() => onDetailClick(task)}
              className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-300 hover:bg-violet-500/20"
            >
              <Eye className="h-3 w-3" />
              详情
            </button>
            {task.output && (
              <button
                type="button"
                onClick={() => onOpenOutput(task)}
                className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
              >
                <Terminal className="h-3 w-3" />
                输出
              </button>
            )}
          </div>
        </div>
      </div>

      {resolvedBindingSnapshot.modelSelectionSummary && (
        <div className="mt-2 rounded border border-sky-500/20 bg-sky-500/10 px-2 py-1">
          <p className="text-[11px] text-sky-200">
            模型选择: {resolvedBindingSnapshot.modelSelectionSummary}
          </p>
        </div>
      )}

      {(fallbackReasonLabel || fallbackAttemptText) && (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
          <p className="text-[11px] text-amber-300">
            选择回退: {fallbackReasonLabel || '已记录'}
            {fallbackAttemptText ? ` · ${fallbackAttemptText}` : ''}
          </p>
        </div>
      )}

      {resolvedBindingSnapshot.fallbackTrail &&
        resolvedBindingSnapshot.fallbackTrail.length > 0 && (
          <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
            <p className="text-[11px] text-amber-300">
              执行回退链路: {resolvedBindingSnapshot.fallbackTrail.join(' → ')}
            </p>
          </div>
        )}

      {resolvedBindingSnapshot.workflowId && (
        <div className="mt-2 rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1">
          <p className="font-mono text-[11px] text-[var(--text-muted)]">
            Workflow: {resolvedBindingSnapshot.workflowId}
          </p>
        </div>
      )}

      {displayOutput && task.status === 'completed' && (
        <div className="mt-2 border-t pt-2 ui-border">
          <p className="line-clamp-3 text-xs text-[var(--text-secondary)]">{displayOutput}</p>
        </div>
      )}

      {displayOutput && task.status === 'failed' && (
        <div className="mt-2 border-t border-rose-800/30 pt-2">
          <p className="line-clamp-2 text-xs text-rose-400">{displayOutput}</p>
        </div>
      )}
    </div>
  )
}

function TaskGroup({
  title,
  tasks,
  highlightedTaskId,
  bindingSnapshots,
  taskDiagnosticsByTaskId,
  onTaskLinkage,
  onTaskDetail,
  onTaskOutput
}: {
  title: string
  tasks: Task[]
  highlightedTaskId: string | null
  bindingSnapshots: Record<string, TaskBindingSnapshot>
  taskDiagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
  onTaskLinkage: (task: Task) => void
  onTaskDetail: (task: Task, defaultTab?: TaskDetailTab) => void
  onTaskOutput: (task: Task) => void
}) {
  if (tasks.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {title} ({tasks.length})
      </h3>
      {tasks.map(task => (
        <div key={task.id} className="space-y-1">
          <TaskCard
            task={task}
            bindingSnapshot={bindingSnapshots[task.id]}
            diagnostic={taskDiagnosticsByTaskId[task.id]}
            onLinkClick={onTaskLinkage}
            onDetailClick={onTaskDetail}
            onOpenOutput={onTaskOutput}
          />
          {highlightedTaskId === task.id && (
            <div className="flex items-center gap-1 px-1 text-[11px] text-sky-300">
              <Link2 className="h-3 w-3" />
              已定位关联任务
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function TaskListTab({
  loading,
  error,
  tasks,
  filteredTasks,
  runningTasks,
  pendingTasks,
  completedTasks,
  taskSearch,
  taskStatusFilter,
  taskSortMode,
  completedTaskLimit,
  hasTaskFilters,
  bindingSnapshots,
  taskDiagnosticsByTaskId,
  highlightedTaskId,
  onTaskSearchChange,
  onTaskStatusFilterChange,
  onTaskSortModeChange,
  onCompletedTaskLimitChange,
  onResetFilters,
  onRetry,
  onTaskLinkage,
  onTaskDetail,
  onTaskOutput
}: TaskListTabProps) {
  const canReset = useMemo(
    () => hasTaskFilters || completedTaskLimit !== 20,
    [completedTaskLimit, hasTaskFilters]
  )

  return (
    <TaskPanelSectionBoundary
      title="任务列表"
      resetKey={`tasks-${tasks.length}-${loading ? 'loading' : 'ready'}`}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">任务列表加载失败</p>
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
        ) : tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">暂无任务</div>
        ) : (
          <>
            <div className="space-y-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2.5">
              <input
                type="text"
                value={taskSearch}
                onChange={event => onTaskSearchChange(event.target.value)}
                placeholder="搜索任务输入/输出/代理/模型"
                className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-sky-500/50"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={taskStatusFilter}
                  onChange={event =>
                    onTaskStatusFilterChange(event.target.value as TaskFilterStatus)
                  }
                  className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="all">全部状态</option>
                  <option value="running">运行中</option>
                  <option value="pending">等待中</option>
                  <option value="pending_approval">等待审批</option>
                  <option value="completed">已完成</option>
                  <option value="failed">失败</option>
                  <option value="cancelled">已取消</option>
                </select>
                <select
                  value={taskSortMode}
                  onChange={event => onTaskSortModeChange(event.target.value as TaskSortMode)}
                  className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                >
                  <option value="newest">最新优先</option>
                  <option value="oldest">最早优先</option>
                </select>
                <button
                  type="button"
                  onClick={onResetFilters}
                  disabled={!canReset}
                  className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  重置筛选
                </button>
              </div>
            </div>

            {filteredTasks.length === 0 && (
              <div className="py-3 text-center text-xs text-[var(--text-muted)]">
                当前筛选条件下无任务
              </div>
            )}

            {filteredTasks.length > 0 && (
              <>
                <TaskGroup
                  title="运行中"
                  tasks={runningTasks}
                  highlightedTaskId={highlightedTaskId}
                  bindingSnapshots={bindingSnapshots}
                  taskDiagnosticsByTaskId={taskDiagnosticsByTaskId}
                  onTaskLinkage={onTaskLinkage}
                  onTaskDetail={onTaskDetail}
                  onTaskOutput={onTaskOutput}
                />

                <TaskGroup
                  title="等待中"
                  tasks={pendingTasks}
                  highlightedTaskId={highlightedTaskId}
                  bindingSnapshots={bindingSnapshots}
                  taskDiagnosticsByTaskId={taskDiagnosticsByTaskId}
                  onTaskLinkage={onTaskLinkage}
                  onTaskDetail={onTaskDetail}
                  onTaskOutput={onTaskOutput}
                />

                {completedTasks.length > 0 && (
                  <div className="space-y-2">
                    <TaskGroup
                      title="已完成"
                      tasks={completedTasks.slice(0, completedTaskLimit)}
                      highlightedTaskId={highlightedTaskId}
                      bindingSnapshots={bindingSnapshots}
                      taskDiagnosticsByTaskId={taskDiagnosticsByTaskId}
                      onTaskLinkage={onTaskLinkage}
                      onTaskDetail={onTaskDetail}
                      onTaskOutput={onTaskOutput}
                    />
                    {completedTasks.length > completedTaskLimit && (
                      <div className="space-y-2">
                        <p className="text-center text-xs text-[var(--text-muted)]">
                          还有 {completedTasks.length - completedTaskLimit} 个已完成任务
                        </p>
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => onCompletedTaskLimitChange(limit => Number(limit) + 20)}
                            className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          >
                            加载更多
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </TaskPanelSectionBoundary>
  )
}

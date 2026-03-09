import { Brain, Check, Copy, Loader2, Stethoscope, Terminal, X } from 'lucide-react'
import {
  getFallbackReasonLabel,
  getModelSelectionReasonLabel,
  getModelSelectionSourceLabel
} from '@shared/model-selection-contract'
import {
  getAgentCapabilityBoundary,
  getCategoryCapabilityBoundary
} from '@shared/agent-capability-matrix'
import { sanitizeDisplayOutput } from '../../utils/output-sanitizer'
import { TaskPanelSectionBoundary } from './TaskPanelSectionBoundary'
import {
  formatTaskPanelDateTime,
  resolveTaskTraceId,
  TASK_DIAGNOSTIC_SOURCE_LABELS,
  type TaskDetailState,
  type TaskDetailTab
} from './task-panel-detail'
import {
  diagnosticBadgeConfig,
  safeStringify,
  type TaskBindingSnapshot
} from './task-panel-shared'
import type { TaskDiagnosticSummary } from './task-panel-diagnostics'

interface TaskDetailDrawerProps {
  taskDetailState: TaskDetailState | null
  taskDetailTab: TaskDetailTab
  diagnosticCopyState: 'idle' | 'success' | 'error'
  taskDetailDiagnostic?: TaskDiagnosticSummary
  taskDetailBindingSnapshot?: TaskBindingSnapshot
  onClose: () => void
  onTabChange: (tab: TaskDetailTab) => void
  onCopyDiagnosticPackage: () => void | Promise<void>
}

export function TaskDetailDrawer({
  taskDetailState,
  taskDetailTab,
  diagnosticCopyState,
  taskDetailDiagnostic,
  taskDetailBindingSnapshot,
  onClose,
  onTabChange,
  onCopyDiagnosticPackage
}: TaskDetailDrawerProps) {
  if (!taskDetailState) {
    return null
  }

  const taskDetailTraceId = resolveTaskTraceId(taskDetailState.task, taskDetailState.runLogs)
  const taskBrief =
    taskDetailState.task.metadata?.taskBrief && typeof taskDetailState.task.metadata.taskBrief === 'object'
      ? (taskDetailState.task.metadata.taskBrief as Record<string, unknown>)
      : null
  const capabilityBoundary = taskDetailState.task.assignedAgent
    ? getAgentCapabilityBoundary(taskDetailState.task.assignedAgent)
    : typeof taskDetailState.task.metadata?.assignedCategory === 'string'
      ? getCategoryCapabilityBoundary(String(taskDetailState.task.metadata?.assignedCategory || ''))
      : null
  const executionEvents = Array.isArray(taskDetailState.task.metadata?.executionEvents)
    ? (taskDetailState.task.metadata?.executionEvents as Array<Record<string, unknown>>)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="ui-bg-panel max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--border-primary)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 ui-border">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">任务详情</p>
            <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">
              {taskDetailState.task.input}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            title="关闭详情"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <TaskPanelSectionBoundary title="任务详情抽屉" resetKey={taskDetailState.task.id}>
          <div className="max-h-[calc(86vh-64px)] space-y-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">任务ID：</span>
                <span className="break-all font-mono text-[var(--text-primary)]">
                  {taskDetailState.task.id}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">状态：</span>
                <span className="text-[var(--text-primary)]">{taskDetailState.task.status}</span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">开始时间：</span>
                <span className="text-[var(--text-primary)]">
                  {formatTaskPanelDateTime(taskDetailState.task.startedAt)}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">完成时间：</span>
                <span className="text-[var(--text-primary)]">
                  {formatTaskPanelDateTime(taskDetailState.task.completedAt)}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">Agent：</span>
                <span className="text-[var(--text-primary)]">
                  {taskDetailState.task.assignedAgent || '—'}
                </span>
              </div>
              <div className="col-span-2 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">Trace ID：</span>
                <span className="break-all font-mono text-[var(--text-primary)]">
                  {taskDetailTraceId || '—'}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">Model：</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {taskDetailState.task.assignedModel || '—'}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">模型来源：</span>
                <span className="text-[var(--text-primary)]">
                  {taskDetailBindingSnapshot?.modelSelectionSource
                    ? getModelSelectionSourceLabel(taskDetailBindingSnapshot.modelSelectionSource)
                    : taskDetailBindingSnapshot?.modelSource
                      ? getModelSelectionSourceLabel(taskDetailBindingSnapshot.modelSource)
                      : '—'}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">命中原因：</span>
                <span className="text-[var(--text-primary)]">
                  {taskDetailBindingSnapshot?.modelSelectionReason
                    ? getModelSelectionReasonLabel(taskDetailBindingSnapshot.modelSelectionReason)
                    : '—'}
                </span>
              </div>
              <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                <span className="text-[var(--text-muted)]">回退原因：</span>
                <span className="text-[var(--text-primary)]">
                  {taskDetailBindingSnapshot?.fallbackReason
                    ? getFallbackReasonLabel(taskDetailBindingSnapshot.fallbackReason)
                    : '—'}
                </span>
              </div>
            </div>

            {taskDetailBindingSnapshot?.modelSelectionSummary && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
                <p className="font-medium text-slate-100">模型选择解释</p>
                <p className="mt-1 text-slate-300">
                  {taskDetailBindingSnapshot.modelSelectionSummary}
                </p>
              </div>
            )}

            {taskBrief && (
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3 text-xs text-[var(--text-primary)]">
                <p className="font-medium text-[var(--text-primary)]">任务卡</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <span className="text-[var(--text-muted)]">任务卡 ID：</span>
                    <span className="font-mono">{String(taskBrief.taskId || taskBrief.briefId || '—')}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">复杂度：</span>
                    <span>{String(taskBrief.complexityScore ?? '—')}</span>
                  </div>
                </div>
                {typeof taskBrief.goal === 'string' && (
                  <p className="mt-2 text-[var(--text-secondary)]">目标：{taskBrief.goal}</p>
                )}
                {Array.isArray(taskBrief.acceptanceCriteria) && taskBrief.acceptanceCriteria.length > 0 && (
                  <div className="mt-3">
                    <p className="font-medium text-[var(--text-primary)]">验收标准</p>
                    <ul className="mt-1 space-y-1 text-[var(--text-secondary)]">
                      {taskBrief.acceptanceCriteria.map((item, index) => (
                        <li key={`${taskDetailState.task.id}-acceptance-${index}`}>- {String(item)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {capabilityBoundary && (
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3 text-xs text-[var(--text-primary)]">
                <p className="font-medium text-[var(--text-primary)]">能力边界</p>
                <p className="mt-2 text-[var(--text-secondary)]">
                  默认角色：{capabilityBoundary.defaultRole} · 默认策略：{capabilityBoundary.defaultStrategy} · 风险等级：{capabilityBoundary.riskLevel}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">适合任务</p>
                    <ul className="mt-1 space-y-1 text-[var(--text-secondary)]">
                      {capabilityBoundary.suitableTasks.slice(0, 3).map(item => (
                        <li key={`${capabilityBoundary.code}-fit-${item}`}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">不适合任务</p>
                    <ul className="mt-1 space-y-1 text-[var(--text-secondary)]">
                      {capabilityBoundary.unsuitableTasks.slice(0, 3).map(item => (
                        <li key={`${capabilityBoundary.code}-unfit-${item}`}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {executionEvents.length > 0 && (
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3 text-xs text-[var(--text-primary)]">
                <p className="font-medium text-[var(--text-primary)]">执行事件</p>
                <div className="mt-2 space-y-2 text-[var(--text-secondary)]">
                  {executionEvents.slice(-8).reverse().map((event, index) => (
                    <div
                      key={String(event.id || `${taskDetailState.task.id}-event-${index}`)}
                      className="rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[var(--text-primary)]">{String(event.type || 'unknown')}</span>
                        <span>{String(event.timestamp || '—')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]">
              <div className="flex items-center gap-2 border-b bg-[var(--bg-secondary)] p-2 ui-border">
                <button
                  type="button"
                  onClick={() => onTabChange('thinking')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                    taskDetailTab === 'thinking'
                      ? 'bg-violet-500/15 text-violet-300'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Brain className="h-3.5 w-3.5" />
                  思考过程 ({taskDetailState.thinkingLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('run')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                    taskDetailTab === 'run'
                      ? 'bg-sky-500/15 text-sky-300'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Run 日志 ({taskDetailState.runLogs.length})
                  {taskDetailState.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('diagnostic')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                    taskDetailTab === 'diagnostic'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  诊断
                </button>
              </div>

              <div className="p-3">
                {taskDetailTab === 'thinking' ? (
                  taskDetailState.thinkingLogs.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">暂无关联思考日志</p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {taskDetailState.thinkingLogs.map(log => (
                        <div
                          key={log.id}
                          className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5"
                        >
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {formatTaskPanelDateTime(log.timestamp)} · {log.agentId} · {log.type}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--text-primary)]">
                            {log.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : taskDetailTab === 'diagnostic' ? (
                  taskDetailDiagnostic ? (
                    <div className="space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${diagnosticBadgeConfig[taskDetailDiagnostic.category]}`}
                          >
                            <Stethoscope className="h-3 w-3" />
                            {taskDetailDiagnostic.label}
                          </span>
                          <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                            来源: {TASK_DIAGNOSTIC_SOURCE_LABELS[taskDetailDiagnostic.source]}
                          </span>
                          <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                            置信分: {taskDetailDiagnostic.score}
                          </span>
                          {taskDetailDiagnostic.updatedAt && (
                            <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                              更新时间: {formatTaskPanelDateTime(taskDetailDiagnostic.updatedAt)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void onCopyDiagnosticPackage()
                          }}
                          className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
                          title="复制诊断包"
                        >
                          {diagnosticCopyState === 'success' ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {diagnosticCopyState === 'success'
                            ? '已复制'
                            : diagnosticCopyState === 'error'
                              ? '复制失败'
                              : '复制诊断包'}
                        </button>
                      </div>
                      <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-2">
                        <p className="text-[11px] text-[var(--text-muted)]">失败原因</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[var(--text-primary)]">
                          {taskDetailDiagnostic.reason}
                        </p>
                      </div>
                      {taskDetailDiagnostic.evidence.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-[var(--text-muted)]">诊断证据</p>
                          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                            {taskDetailDiagnostic.evidence.map((item, index) => (
                              <pre
                                key={`${taskDetailState.task.id}-diagnostic-${index}`}
                                className="whitespace-pre-wrap break-words rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)]"
                              >
                                {item}
                              </pre>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">暂无可用诊断信息</p>
                  )
                ) : taskDetailState.loading ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载日志...
                  </div>
                ) : taskDetailState.error ? (
                  <p className="text-xs text-rose-400">加载失败：{taskDetailState.error}</p>
                ) : taskDetailState.runLogs.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">暂无 run 日志</p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {taskDetailState.runLogs.map((log, index) => (
                      <div
                        key={`${String(log.timestamp || '')}-${index}`}
                        className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5"
                      >
                        <div className="text-[10px] text-[var(--text-muted)]">
                          {formatTaskPanelDateTime(log.timestamp)} ·{' '}
                          {(log.level || 'info').toUpperCase()}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--text-primary)]">
                          {log.message || '无消息'}
                        </div>
                        {log.data && (
                          <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-[var(--text-secondary)]">
                            {safeStringify(log.data)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {taskDetailState.task.output && (
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
                <h4 className="mb-2 text-sm font-medium text-[var(--text-primary)]">任务输出</h4>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--bg-tertiary)] p-2 text-xs text-[var(--text-secondary)]">
                  {sanitizeDisplayOutput(taskDetailState.task.output)}
                </pre>
              </div>
            )}

            {taskDetailState.task.metadata && (
              <details className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
                <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
                  查看 metadata
                </summary>
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--bg-tertiary)] p-2 text-[11px] text-[var(--text-secondary)]">
                  {safeStringify(taskDetailState.task.metadata)}
                </pre>
              </details>
            )}
          </div>
        </TaskPanelSectionBoundary>
      </div>
    </div>
  )
}

import type { TaskReadinessDashboardView } from '@shared/task-readiness-dashboard'
import { TaskReadinessDashboard } from './TaskReadinessDashboard'
import { formatTaskPanelDateTime } from './task-panel-detail'
import {
  getDiagnosticCategoryLabel,
  type SessionDiagnosticSummary,
  type WorkflowStuckDiagnosticSummary
} from './task-panel-diagnostics'
import { TaskPanelSectionBoundary } from './TaskPanelSectionBoundary'
import {
  diagnosticBadgeConfig,
  diagnosticCategories,
  type BackgroundTaskStats,
  type TabType
} from './task-panel-shared'

interface WorkflowSnapshotSummary {
  total: number
  modelSources: string[]
  withFallback: number
  withConcurrency: number
}

interface WorkflowObservabilityProps {
  activeTab: TabType
  taskReadinessDashboard: TaskReadinessDashboardView | null
  workflowSnapshotSummary: WorkflowSnapshotSummary | null
  stuckDiagnosticSummary: WorkflowStuckDiagnosticSummary | null
  sessionDiagnosticSummary: SessionDiagnosticSummary
  effectiveBackgroundStats: BackgroundTaskStats
}

function MetricCard({
  label,
  value,
  hint,
  emphasize = false
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        emphasize
          ? 'border-amber-500/30 bg-amber-500/10'
          : 'border-[var(--border-primary)] bg-[var(--bg-primary)]'
      }`}
    >
      <p className="text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 break-words text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  )
}

export function WorkflowObservability({
  activeTab,
  taskReadinessDashboard,
  workflowSnapshotSummary,
  stuckDiagnosticSummary,
  sessionDiagnosticSummary,
  effectiveBackgroundStats
}: WorkflowObservabilityProps) {
  if (
    activeTab === 'tasks' &&
    !taskReadinessDashboard &&
    !workflowSnapshotSummary &&
    sessionDiagnosticSummary.total === 0 &&
    !stuckDiagnosticSummary
  ) {
    return null
  }

  return (
    <TaskPanelSectionBoundary title="可观测性概览" resetKey={activeTab}>
      <div className="space-y-4">
        {activeTab === 'tasks' && <TaskReadinessDashboard dashboard={taskReadinessDashboard} />}

        {activeTab === 'tasks' && stuckDiagnosticSummary && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-300">
                卡点诊断面板
              </p>
              {stuckDiagnosticSummary.updatedAt ? (
                <span className="text-[11px] text-amber-200/80">
                  更新于 {formatTaskPanelDateTime(stuckDiagnosticSummary.updatedAt)}
                </span>
              ) : null}
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <MetricCard
                label="当前阶段"
                value={stuckDiagnosticSummary.currentStage}
                hint={
                  stuckDiagnosticSummary.currentStageCode
                    ? `阶段代码: ${stuckDiagnosticSummary.currentStageCode}`
                    : undefined
                }
              />
              <MetricCard
                label="当前子任务"
                value={
                  stuckDiagnosticSummary.currentSubtask
                    ? stuckDiagnosticSummary.currentSubtask.title
                    : '—'
                }
                hint={
                  stuckDiagnosticSummary.currentSubtask
                    ? `状态: ${stuckDiagnosticSummary.currentSubtask.status}${stuckDiagnosticSummary.currentSubtask.phase ? ` · 阶段: ${stuckDiagnosticSummary.currentSubtask.phase}` : ''}`
                    : undefined
                }
              />
              <MetricCard
                label="当前阻塞"
                value={stuckDiagnosticSummary.blockerType}
                hint={stuckDiagnosticSummary.blockerReason}
                emphasize={stuckDiagnosticSummary.humanTakeoverRecommended}
              />
              <MetricCard
                label="最近工具调用"
                value={
                  stuckDiagnosticSummary.recentToolCall
                    ? `${stuckDiagnosticSummary.recentToolCall.toolName} · ${stuckDiagnosticSummary.recentToolCall.status}`
                    : '—'
                }
                hint={
                  stuckDiagnosticSummary.recentToolCall
                    ? `${stuckDiagnosticSummary.recentToolCall.error || '无异常'} · ${formatTaskPanelDateTime(stuckDiagnosticSummary.recentToolCall.timestamp)}`
                    : '暂无工具事件'
                }
              />
              <MetricCard
                label="最近失败分类"
                value={
                  stuckDiagnosticSummary.recentFailure
                    ? stuckDiagnosticSummary.recentFailure.label
                    : '—'
                }
                hint={
                  stuckDiagnosticSummary.recentFailure
                    ? `${stuckDiagnosticSummary.recentFailure.reason} · ${stuckDiagnosticSummary.recentFailure.taskTitle}`
                    : '当前没有失败分类信号'
                }
              />
              <MetricCard
                label="等待审批"
                value={stuckDiagnosticSummary.waitingApproval ? '是' : '否'}
                hint={
                  stuckDiagnosticSummary.pendingApproval
                    ? `${stuckDiagnosticSummary.pendingApproval.toolName} · 风险 ${stuckDiagnosticSummary.pendingApproval.riskLevel} · ${stuckDiagnosticSummary.pendingApproval.reason}`
                    : '当前没有待处理审批'
                }
              />
            </div>

            <div className="mt-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-xs">
              <p className="text-[var(--text-muted)]">人工接管建议</p>
              <p
                className={`mt-1 ${
                  stuckDiagnosticSummary.humanTakeoverRecommended
                    ? 'text-amber-300'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {stuckDiagnosticSummary.humanTakeoverRecommended ? '建议接管' : '暂不需要'}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {stuckDiagnosticSummary.humanTakeoverReason}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && workflowSnapshotSummary && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2">
            <p className="text-xs font-medium text-slate-200">运行绑定快照</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded bg-slate-800 px-2 py-0.5">
                任务数: {workflowSnapshotSummary.total}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5">
                来源:{' '}
                {workflowSnapshotSummary.modelSources.length > 0
                  ? workflowSnapshotSummary.modelSources.join(', ')
                  : '未知'}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5">
                回退次数: {workflowSnapshotSummary.withFallback}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5">
                并发键数量: {workflowSnapshotSummary.withConcurrency}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && sessionDiagnosticSummary.total > 0 && (
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              失败诊断概览
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                总计: {sessionDiagnosticSummary.total}
              </span>
              {diagnosticCategories.map(category => (
                <span
                  key={category}
                  className={`rounded border px-2 py-1 ${diagnosticBadgeConfig[category]}`}
                >
                  {getDiagnosticCategoryLabel(category)}: {sessionDiagnosticSummary[category]}
                </span>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'background' && (
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">诊断统计</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">
                总数: {effectiveBackgroundStats.total}
              </span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">
                运行中: {effectiveBackgroundStats.running}
              </span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">
                完成: {effectiveBackgroundStats.completed}
              </span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">
                失败: {effectiveBackgroundStats.error}
              </span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">
                取消: {effectiveBackgroundStats.cancelled}
              </span>
            </div>
          </div>
        )}
      </div>
    </TaskPanelSectionBoundary>
  )
}

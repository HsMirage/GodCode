import type { ToolApprovalRequest } from '@shared/tool-approval-contract'
import { APP_VERSION } from '@shared/app-meta'
import {
  GODCODE_TASK_READINESS_HISTORY_KEY,
  LEGACY_CODEALL_TASK_READINESS_HISTORY_KEY
} from '@shared/brand-compat'
import {
  buildTaskReadinessDashboardSnapshot,
  upsertTaskReadinessDashboardHistory,
  type TaskReadinessDashboardSnapshot
} from '@shared/task-readiness-dashboard'
import type { Task } from '@renderer/types/domain'
import type { TaskDiagnosticSummary } from './task-panel-diagnostics'
import type { WorkflowObservabilityTaskPanelSnapshot } from './task-panel-shared'
import { readCompatibleStorageValue, writeCompatibleStorageValue } from '../../utils/storage-compat'

function readRecoveryMetadata(task: Task) {
  const metadata =
    task.metadata && typeof task.metadata === 'object'
      ? (task.metadata as Record<string, unknown>)
      : null
  const recovery =
    metadata?.recovery && typeof metadata.recovery === 'object'
      ? (metadata.recovery as Record<string, unknown>)
      : null

  return {
    recoverySource:
      typeof (recovery?.recoverySource || metadata?.recoverySource) === 'string'
        ? String(recovery?.recoverySource || metadata?.recoverySource)
        : null,
    recoveryStage:
      typeof (recovery?.recoveryStage || metadata?.recoveryStage) === 'string'
        ? String(recovery?.recoveryStage || metadata?.recoveryStage)
        : null,
    resumeReason:
      typeof (recovery?.resumeReason || metadata?.resumeReason) === 'string'
        ? String(recovery?.resumeReason || metadata?.resumeReason)
        : null
  }
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }

  return window.localStorage
}

export function readTaskReadinessDashboardHistory(): TaskReadinessDashboardSnapshot[] {
  const storage = safeLocalStorage()
  if (!storage) {
    return []
  }

  try {
    const raw = readCompatibleStorageValue(
      GODCODE_TASK_READINESS_HISTORY_KEY,
      LEGACY_CODEALL_TASK_READINESS_HISTORY_KEY
    )
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as TaskReadinessDashboardSnapshot[]) : []
  } catch {
    return []
  }
}

export function persistTaskReadinessDashboardHistory(
  history: TaskReadinessDashboardSnapshot[]
): TaskReadinessDashboardSnapshot[] {
  const storage = safeLocalStorage()
  if (!storage) {
    return history
  }

  try {
    writeCompatibleStorageValue(
      GODCODE_TASK_READINESS_HISTORY_KEY,
      LEGACY_CODEALL_TASK_READINESS_HISTORY_KEY,
      JSON.stringify(history)
    )
  } catch (error) {
    console.error('Failed to persist task readiness dashboard history:', error)
  }

  return history
}

export function mergeTaskReadinessDashboardHistory(
  history: TaskReadinessDashboardSnapshot[],
  snapshot: TaskReadinessDashboardSnapshot | null
): TaskReadinessDashboardSnapshot[] {
  if (!snapshot) {
    return history
  }

  return upsertTaskReadinessDashboardHistory(history, snapshot)
}

export function buildLiveTaskReadinessDashboardSnapshot(input: {
  tasks: Task[]
  workflowObservability: WorkflowObservabilityTaskPanelSnapshot | null
  taskDiagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
  approvals: ToolApprovalRequest[]
}): TaskReadinessDashboardSnapshot | null {
  const tasks = input.tasks.filter(task => task.type !== 'workflow')
  if (tasks.length === 0) {
    return null
  }

  const retryState = input.workflowObservability?.retryState?.tasks || {}
  const retriedTaskIds = new Set(
    Object.entries(retryState)
      .filter(([, state]) => typeof state?.attemptNumber === 'number' && state.attemptNumber > 1)
      .map(([taskId]) => taskId)
  )

  const completedTasks = tasks.filter(task => task.status === 'completed')
  const completedRetriedTasks = completedTasks.filter(task => retriedTaskIds.has(task.id)).length
  const manualTakeoverTaskIds = new Set<string>()

  for (const task of tasks) {
    const diagnostic = input.taskDiagnosticsByTaskId[task.id]
    if (diagnostic && ['config', 'permission', 'tool'].includes(diagnostic.category)) {
      manualTakeoverTaskIds.add(task.id)
    }

    const retry = retryState[task.id]
    if (retry?.status === 'exhausted') {
      manualTakeoverTaskIds.add(task.id)
    }
  }

  const recoveryTasks = tasks.filter(task => Boolean(readRecoveryMetadata(task).recoverySource))
  const contextLossIncidents = recoveryTasks.filter(task => {
    const recovery = readRecoveryMetadata(task)
    return recovery.recoveryStage === 'failed' || recovery.resumeReason === 'recovery-failed'
  }).length
  const crossSessionRecoverySuccesses = recoveryTasks.filter(task => {
    const recovery = readRecoveryMetadata(task)
    return task.status === 'completed' || recovery.recoveryStage === 'completed'
  }).length
  const approvalRequiredActions = Math.max(
    input.approvals.length,
    tasks.filter(task => task.status === 'pending_approval').length
  )

  return buildTaskReadinessDashboardSnapshot({
    version: APP_VERSION,
    label: `v${APP_VERSION}`,
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    firstPassTasks: Math.max(0, completedTasks.length - completedRetriedTasks),
    retryCount:
      typeof input.workflowObservability?.retryState?.totalRetried === 'number'
        ? input.workflowObservability.retryState.totalRetried
        : null,
    manualTakeovers: manualTakeoverTaskIds.size,
    approvalRequiredActions,
    approvalHits: input.approvals.length,
    scopeViolations: null,
    contextLossIncidents,
    crossSessionRecoveryAttempts: recoveryTasks.length,
    crossSessionRecoverySuccesses,
    sourceStatusOverrides: {
      first_pass_rate: 'estimated',
      manual_takeover_rate: 'estimated',
      approval_hit_rate: 'estimated',
      scope_violation_rate: 'missing',
      context_loss_rate: 'estimated',
      cross_session_recovery_success_rate: 'estimated'
    },
    metricNotes: {
      first_pass_rate: '当前按 workflow retryState 估算，后续可接入 Run 日志做更精确计算。',
      manual_takeover_rate: '当前按失败诊断与重试耗尽信号估算，后续可接入统一人工接管事件。',
      approval_hit_rate:
        '当前按待处理审批请求与 pending_approval 任务估算，后续可接入审批审计全量数据。',
      scope_violation_rate: '当前缺少自动化越界审查结果，待后续验收链路接入。',
      context_loss_rate: '当前按 recovery-failed / recoveryStage=failed 估算。',
      cross_session_recovery_success_rate: '当前按带 recovery metadata 的任务状态估算。'
    },
    notes: ['当前版本基于任务面板实时数据生成，会随任务刷新自动更新。']
  })
}

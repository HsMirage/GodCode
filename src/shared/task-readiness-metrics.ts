export interface TaskReadinessMetricDefinition {
  key:
    | 'task_completion_rate'
    | 'first_pass_rate'
    | 'average_retry_count'
    | 'manual_takeover_rate'
    | 'approval_hit_rate'
    | 'scope_violation_rate'
    | 'context_loss_rate'
    | 'cross_session_recovery_success_rate'
  label: string
  description: string
  formula: string
  source: string[]
}

export interface TaskReadinessMetricSample {
  totalTasks: number
  completedTasks: number
  firstPassTasks: number
  retryCount: number
  manualTakeovers: number
  approvalRequiredActions: number
  approvalHits: number
  scopeViolations: number
  contextLossIncidents: number
  crossSessionRecoveryAttempts: number
  crossSessionRecoverySuccesses: number
}

export interface TaskReadinessMetricValue {
  key: TaskReadinessMetricDefinition['key']
  label: string
  value: number | null
  unit: '%' | 'count'
}

export const TASK_READINESS_METRICS: TaskReadinessMetricDefinition[] = [
  {
    key: 'task_completion_rate',
    label: '任务完成率',
    description: '已完成任务在总任务中的占比。',
    formula: 'completedTasks / totalTasks * 100',
    source: ['Task.status']
  },
  {
    key: 'first_pass_rate',
    label: '一次通过率',
    description: '无需返工即可通过验收的任务占比。',
    formula: 'firstPassTasks / totalTasks * 100',
    source: ['Task.metadata', 'Run.logs']
  },
  {
    key: 'average_retry_count',
    label: '平均重试次数',
    description: '每个任务平均发生的重试次数。',
    formula: 'retryCount / totalTasks',
    source: ['Workflow retry state', 'Run.logs']
  },
  {
    key: 'manual_takeover_rate',
    label: '人工接管率',
    description: '需要人工接管的任务占比。',
    formula: 'manualTakeovers / totalTasks * 100',
    source: ['Task.metadata', 'UI diagnostics']
  },
  {
    key: 'approval_hit_rate',
    label: '高风险动作审批命中率',
    description: '需要审批的动作中，成功命中真实审批流的占比。',
    formula: 'approvalHits / approvalRequiredActions * 100',
    source: ['AuditLog', 'Task.metadata.toolApproval']
  },
  {
    key: 'scope_violation_rate',
    label: '越界修改率',
    description: '超出允许修改范围的任务占比。',
    formula: 'scopeViolations / totalTasks * 100',
    source: ['Task brief', 'Artifacts', 'Acceptance review']
  },
  {
    key: 'context_loss_rate',
    label: '中途丢失上下文率',
    description: '执行中发生上下文丢失的任务占比。',
    formula: 'contextLossIncidents / totalTasks * 100',
    source: ['SessionState', 'Execution events']
  },
  {
    key: 'cross_session_recovery_success_rate',
    label: '跨会话恢复成功率',
    description: '跨会话恢复尝试中恢复成功的占比。',
    formula: 'crossSessionRecoverySuccesses / crossSessionRecoveryAttempts * 100',
    source: ['SessionState', 'Recovery metadata']
  }
]

function safeRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null
  }
  return Number(((numerator / denominator) * 100).toFixed(2))
}

export function computeTaskReadinessMetricValues(
  sample: TaskReadinessMetricSample
): TaskReadinessMetricValue[] {
  return [
    {
      key: 'task_completion_rate',
      label: '任务完成率',
      value: safeRate(sample.completedTasks, sample.totalTasks),
      unit: '%'
    },
    {
      key: 'first_pass_rate',
      label: '一次通过率',
      value: safeRate(sample.firstPassTasks, sample.totalTasks),
      unit: '%'
    },
    {
      key: 'average_retry_count',
      label: '平均重试次数',
      value: sample.totalTasks > 0 ? Number((sample.retryCount / sample.totalTasks).toFixed(2)) : null,
      unit: 'count'
    },
    {
      key: 'manual_takeover_rate',
      label: '人工接管率',
      value: safeRate(sample.manualTakeovers, sample.totalTasks),
      unit: '%'
    },
    {
      key: 'approval_hit_rate',
      label: '高风险动作审批命中率',
      value: safeRate(sample.approvalHits, sample.approvalRequiredActions),
      unit: '%'
    },
    {
      key: 'scope_violation_rate',
      label: '越界修改率',
      value: safeRate(sample.scopeViolations, sample.totalTasks),
      unit: '%'
    },
    {
      key: 'context_loss_rate',
      label: '中途丢失上下文率',
      value: safeRate(sample.contextLossIncidents, sample.totalTasks),
      unit: '%'
    },
    {
      key: 'cross_session_recovery_success_rate',
      label: '跨会话恢复成功率',
      value: safeRate(sample.crossSessionRecoverySuccesses, sample.crossSessionRecoveryAttempts),
      unit: '%'
    }
  ]
}


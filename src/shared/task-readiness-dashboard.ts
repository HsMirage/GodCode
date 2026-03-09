import {
  TASK_READINESS_METRICS,
  type TaskReadinessMetricDefinition,
  type TaskReadinessMetricValue
} from './task-readiness-metrics'

export type TaskReadinessMetricKey = TaskReadinessMetricDefinition['key']
export type TaskReadinessMetricSourceStatus = 'measured' | 'estimated' | 'missing'
export type TaskReadinessMetricTrend = 'up' | 'down' | 'flat' | 'new' | 'missing'
export type TaskReadinessMetricBetterDirection = 'higher' | 'lower'
export type TaskReadinessLayer = 'router' | 'delegate' | 'workforce' | 'tool' | 'ui'
export type TaskReadinessLayerStatus = 'regressed' | 'stable' | 'improved' | 'insufficient-data'

export interface TaskReadinessDashboardMetricSnapshot extends TaskReadinessMetricValue {
  sourceStatus: TaskReadinessMetricSourceStatus
  note?: string
}

export interface TaskReadinessDashboardSnapshot {
  version: string
  label: string
  capturedAt: string
  metrics: TaskReadinessDashboardMetricSnapshot[]
  notes?: string[]
}

export interface TaskReadinessDashboardBuildInput {
  version: string
  label: string
  capturedAt?: string
  totalTasks?: number | null
  completedTasks?: number | null
  firstPassTasks?: number | null
  retryCount?: number | null
  manualTakeovers?: number | null
  approvalRequiredActions?: number | null
  approvalHits?: number | null
  scopeViolations?: number | null
  contextLossIncidents?: number | null
  crossSessionRecoveryAttempts?: number | null
  crossSessionRecoverySuccesses?: number | null
  sourceStatusOverrides?: Partial<Record<TaskReadinessMetricKey, TaskReadinessMetricSourceStatus>>
  metricNotes?: Partial<Record<TaskReadinessMetricKey, string>>
  notes?: string[]
}

export interface TaskReadinessDashboardMetricPoint extends TaskReadinessDashboardMetricSnapshot {
  previousValue: number | null
  delta: number | null
  trend: TaskReadinessMetricTrend
  betterDirection: TaskReadinessMetricBetterDirection
}

export interface TaskReadinessLayerSummary {
  layer: TaskReadinessLayer
  label: string
  status: TaskReadinessLayerStatus
  reasons: string[]
}

export interface TaskReadinessDashboardView {
  latest: TaskReadinessDashboardSnapshot
  previous: TaskReadinessDashboardSnapshot | null
  metrics: TaskReadinessDashboardMetricPoint[]
  layers: TaskReadinessLayerSummary[]
}

const BETTER_DIRECTION_BY_METRIC: Record<TaskReadinessMetricKey, TaskReadinessMetricBetterDirection> = {
  task_completion_rate: 'higher',
  first_pass_rate: 'higher',
  average_retry_count: 'lower',
  manual_takeover_rate: 'lower',
  approval_hit_rate: 'higher',
  scope_violation_rate: 'lower',
  context_loss_rate: 'lower',
  cross_session_recovery_success_rate: 'higher'
}

const LAYER_LABELS: Record<TaskReadinessLayer, string> = {
  router: 'Router',
  delegate: 'Delegate',
  workforce: 'Workforce',
  tool: 'Tool',
  ui: 'UI'
}

const LAYER_METRIC_MAP: Record<TaskReadinessLayer, TaskReadinessMetricKey[]> = {
  router: ['scope_violation_rate'],
  delegate: ['task_completion_rate', 'first_pass_rate', 'manual_takeover_rate'],
  workforce: ['average_retry_count', 'manual_takeover_rate'],
  tool: ['approval_hit_rate'],
  ui: ['context_loss_rate', 'cross_session_recovery_success_rate']
}

function safeRate(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null
  }

  return Number(((numerator / denominator) * 100).toFixed(2))
}

function safeAverage(total: number | null | undefined, denominator: number | null | undefined): number | null {
  if (
    total === null ||
    total === undefined ||
    denominator === null ||
    denominator === undefined ||
    !Number.isFinite(total) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null
  }

  return Number((total / denominator).toFixed(2))
}

function buildMetricValue(
  input: TaskReadinessDashboardBuildInput,
  key: TaskReadinessMetricKey
): number | null {
  switch (key) {
    case 'task_completion_rate':
      return safeRate(input.completedTasks, input.totalTasks)
    case 'first_pass_rate':
      return safeRate(input.firstPassTasks, input.totalTasks)
    case 'average_retry_count':
      return safeAverage(input.retryCount, input.totalTasks)
    case 'manual_takeover_rate':
      return safeRate(input.manualTakeovers, input.totalTasks)
    case 'approval_hit_rate':
      return safeRate(input.approvalHits, input.approvalRequiredActions)
    case 'scope_violation_rate':
      return safeRate(input.scopeViolations, input.totalTasks)
    case 'context_loss_rate':
      return safeRate(input.contextLossIncidents, input.totalTasks)
    case 'cross_session_recovery_success_rate':
      return safeRate(input.crossSessionRecoverySuccesses, input.crossSessionRecoveryAttempts)
  }
}

function buildMetricSourceStatus(
  input: TaskReadinessDashboardBuildInput,
  key: TaskReadinessMetricKey,
  value: number | null
): TaskReadinessMetricSourceStatus {
  if (input.sourceStatusOverrides?.[key]) {
    return input.sourceStatusOverrides[key] as TaskReadinessMetricSourceStatus
  }

  return value === null ? 'missing' : 'measured'
}

function getMetricSnapshot(
  snapshot: TaskReadinessDashboardSnapshot | null | undefined,
  key: TaskReadinessMetricKey
): TaskReadinessDashboardMetricSnapshot | null {
  if (!snapshot) {
    return null
  }

  return snapshot.metrics.find(metric => metric.key === key) || null
}

function computeMetricTrend(
  latest: number | null,
  previous: number | null,
  betterDirection: TaskReadinessMetricBetterDirection
): { delta: number | null; trend: TaskReadinessMetricTrend } {
  if (latest === null) {
    return { delta: null, trend: 'missing' }
  }

  if (previous === null) {
    return { delta: null, trend: 'new' }
  }

  const delta = Number((latest - previous).toFixed(2))
  if (Math.abs(delta) < 0.01) {
    return { delta: 0, trend: 'flat' }
  }

  if (betterDirection === 'higher') {
    return { delta, trend: delta > 0 ? 'up' : 'down' }
  }

  return { delta, trend: delta < 0 ? 'up' : 'down' }
}

function formatDelta(metric: TaskReadinessDashboardMetricPoint): string {
  if (metric.delta === null) {
    return `${metric.label} 暂无历史对比数据`
  }

  const absolute = Math.abs(metric.delta)
  const suffix = metric.unit === '%' ? 'pp' : ''
  const verb = metric.trend === 'up' ? '改善' : metric.trend === 'down' ? '下降' : '持平'
  return `${metric.label}${verb} ${absolute}${suffix}`
}

export function buildTaskReadinessDashboardSnapshot(
  input: TaskReadinessDashboardBuildInput
): TaskReadinessDashboardSnapshot {
  return {
    version: input.version,
    label: input.label,
    capturedAt: input.capturedAt || new Date().toISOString(),
    metrics: TASK_READINESS_METRICS.map(definition => {
      const value = buildMetricValue(input, definition.key)
      return {
        key: definition.key,
        label: definition.label,
        value,
        unit: definition.key === 'average_retry_count' ? 'count' : '%',
        sourceStatus: buildMetricSourceStatus(input, definition.key, value),
        note: input.metricNotes?.[definition.key]
      }
    }),
    notes: input.notes || []
  }
}

export function upsertTaskReadinessDashboardHistory(
  history: TaskReadinessDashboardSnapshot[],
  snapshot: TaskReadinessDashboardSnapshot,
  maxEntries = 12
): TaskReadinessDashboardSnapshot[] {
  const next = history.filter(item => item.version !== snapshot.version)
  next.push(snapshot)
  return next
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
    .slice(-maxEntries)
}

export function buildTaskReadinessDashboardView(
  history: TaskReadinessDashboardSnapshot[]
): TaskReadinessDashboardView | null {
  if (!Array.isArray(history) || history.length === 0) {
    return null
  }

  const ordered = [...history].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  )
  const latest = ordered.at(-1) || null
  const previous = ordered.length >= 2 ? ordered.at(-2) || null : null

  if (!latest) {
    return null
  }

  const metrics = TASK_READINESS_METRICS.map(definition => {
    const latestMetric = getMetricSnapshot(latest, definition.key)
    const previousMetric = getMetricSnapshot(previous, definition.key)
    const betterDirection = BETTER_DIRECTION_BY_METRIC[definition.key]
    const { delta, trend } = computeMetricTrend(
      latestMetric?.value ?? null,
      previousMetric?.value ?? null,
      betterDirection
    )

    return {
      key: definition.key,
      label: definition.label,
      value: latestMetric?.value ?? null,
      unit: latestMetric?.unit || (definition.key === 'average_retry_count' ? 'count' : '%'),
      sourceStatus: latestMetric?.sourceStatus || 'missing',
      note: latestMetric?.note,
      previousValue: previousMetric?.value ?? null,
      delta,
      trend,
      betterDirection
    }
  })

  const layers = (Object.keys(LAYER_LABELS) as TaskReadinessLayer[]).map(layer => {
    const relatedMetrics = metrics.filter(metric => LAYER_METRIC_MAP[layer].includes(metric.key))
    const comparableMetrics = relatedMetrics.filter(metric => metric.value !== null && metric.previousValue !== null)

    if (relatedMetrics.every(metric => metric.value === null)) {
      return {
        layer,
        label: LAYER_LABELS[layer],
        status: 'insufficient-data' as TaskReadinessLayerStatus,
        reasons: ['当前版本暂无可用指标']
      }
    }

    if (comparableMetrics.length === 0) {
      return {
        layer,
        label: LAYER_LABELS[layer],
        status: 'insufficient-data' as TaskReadinessLayerStatus,
        reasons: ['已建立首个版本基线，等待下个版本形成趋势']
      }
    }

    const regressed = comparableMetrics.filter(metric => metric.trend === 'down')
    const improved = comparableMetrics.filter(metric => metric.trend === 'up')

    const status: TaskReadinessLayerStatus = regressed.length > 0
      ? 'regressed'
      : improved.length > 0
        ? 'improved'
        : 'stable'

    const reasons = (regressed.length > 0 ? regressed : improved.length > 0 ? improved : comparableMetrics)
      .slice()
      .sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0))
      .slice(0, 2)
      .map(formatDelta)

    return {
      layer,
      label: LAYER_LABELS[layer],
      status,
      reasons
    }
  })

  return {
    latest,
    previous,
    metrics,
    layers
  }
}


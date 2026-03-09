import type {
  TaskReadinessDashboardMetricPoint,
  TaskReadinessDashboardView,
  TaskReadinessLayerSummary
} from '@shared/task-readiness-dashboard'

const ESSENTIAL_METRIC_KEYS = new Set([
  'task_completion_rate',
  'average_retry_count',
  'manual_takeover_rate'
])

function formatMetricValue(metric: TaskReadinessDashboardMetricPoint): string {
  if (metric.value === null) {
    return '待接入'
  }

  return metric.unit === '%' ? `${metric.value}%` : String(metric.value)
}

function formatMetricDelta(
  metric: TaskReadinessDashboardMetricPoint,
  previousLabel: string | null
): string | null {
  if (!previousLabel || metric.trend === 'missing' || metric.trend === 'new' || metric.delta === null) {
    return null
  }

  const deltaValue = Math.abs(metric.delta)
  const suffix = metric.unit === '%' ? 'pp' : ''
  if (metric.trend === 'flat' || deltaValue === 0) {
    return `较 ${previousLabel} 持平`
  }

  const verb = metric.trend === 'up' ? '改善' : '退化'
  return `较 ${previousLabel}${verb} ${deltaValue}${suffix}`
}

function layerStatusLabel(status: TaskReadinessLayerSummary['status']): string {
  switch (status) {
    case 'regressed':
      return '退化'
    case 'improved':
      return '改善'
    case 'stable':
      return '稳定'
    case 'insufficient-data':
      return '数据不足'
  }
}

function layerStatusClass(status: TaskReadinessLayerSummary['status']): string {
  switch (status) {
    case 'regressed':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300'
    case 'improved':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    case 'stable':
      return 'border-slate-600/60 bg-slate-800/60 text-slate-200'
    case 'insufficient-data':
      return 'ui-warning-surface ui-warning-text'
  }
}

export function TaskReadinessDashboard({ dashboard }: { dashboard: TaskReadinessDashboardView | null }) {
  if (!dashboard) {
    return null
  }

  const previousLabel = dashboard.previous?.label || null
  const visibleMetrics = dashboard.metrics.filter(
    metric => ESSENTIAL_METRIC_KEYS.has(metric.key) && metric.value !== null
  )
  const fallbackMetrics = dashboard.metrics.filter(metric => metric.value !== null).slice(0, 3)
  const compactMetrics = visibleMetrics.length > 0 ? visibleMetrics : fallbackMetrics
  const visibleLayers = dashboard.layers.filter(
    layer => layer.status === 'regressed' || layer.status === 'improved'
  )
  const hasStableSignal = dashboard.layers.some(layer => layer.status === 'stable')

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        KPI 仪表盘
      </p>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {compactMetrics.map(metric => {
          const deltaText = formatMetricDelta(metric, previousLabel)
          return (
          <div
            key={metric.key}
            className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
          >
            <p className="text-[var(--text-muted)]">{metric.label}</p>
            <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
              {formatMetricValue(metric)}
            </p>
            {deltaText ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{deltaText}</p> : null}
          </div>
          )
        })}
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">分层诊断</p>
        {visibleLayers.length > 0 ? (
          <div className="mt-2 space-y-2">
            {visibleLayers.map(layer => (
              <div
                key={layer.layer}
                className={`rounded-lg border px-3 py-2 text-xs ${layerStatusClass(layer.status)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{layer.label}</p>
                  <span className="text-[10px] uppercase tracking-wide">
                    {layerStatusLabel(layer.status)}
                  </span>
                </div>
                {layer.reasons[0] ? (
                  <p className="mt-1 text-[11px]">{layer.reasons[0]}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {hasStableSignal ? '当前未发现明显退化。' : '当前暂无足够信号。'}
          </p>
        )}
      </div>
    </div>
  )
}

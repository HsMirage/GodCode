import type {
  TaskReadinessDashboardMetricPoint,
  TaskReadinessDashboardView,
  TaskReadinessLayerSummary
} from '@shared/task-readiness-dashboard'

function formatMetricValue(metric: TaskReadinessDashboardMetricPoint): string {
  if (metric.value === null) {
    return '待接入'
  }

  return metric.unit === '%' ? `${metric.value}%` : String(metric.value)
}

function formatMetricDelta(metric: TaskReadinessDashboardMetricPoint, previousLabel: string | null): string {
  if (!previousLabel || metric.trend === 'missing') {
    return '当前暂无可用数据'
  }

  if (metric.trend === 'new') {
    return `已开始记录，等待相较 ${previousLabel} 的趋势对比`
  }

  if (metric.delta === null) {
    return `等待相较 ${previousLabel} 的趋势对比`
  }

  const deltaValue = Math.abs(metric.delta)
  const suffix = metric.unit === '%' ? 'pp' : ''
  const verb = metric.trend === 'up' ? '改善' : metric.trend === 'down' ? '退化' : '持平'
  return `相较 ${previousLabel}${verb} ${deltaValue}${suffix}`
}

function sourceStatusLabel(status: TaskReadinessDashboardMetricPoint['sourceStatus']): string {
  switch (status) {
    case 'measured':
      return '实测'
    case 'estimated':
      return '估算'
    case 'missing':
      return '待接入'
  }
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
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  }
}

export function TaskReadinessDashboard({ dashboard }: { dashboard: TaskReadinessDashboardView | null }) {
  if (!dashboard) {
    return null
  }

  const previousLabel = dashboard.previous?.label || null

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
            任务 KPI 仪表盘
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            当前版本 {dashboard.latest.label}
            {previousLabel ? ` · 对比 ${previousLabel}` : ' · 已记录首个版本基线'}
          </p>
        </div>
        <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
          {new Date(dashboard.latest.capturedAt).toLocaleString()}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.metrics.map(metric => (
          <div
            key={metric.key}
            className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[var(--text-muted)]">{metric.label}</p>
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                {sourceStatusLabel(metric.sourceStatus)}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
              {formatMetricValue(metric)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              {formatMetricDelta(metric, previousLabel)}
            </p>
            {metric.note ? <p className="mt-1 text-[10px] text-[var(--text-muted)]">{metric.note}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">分层退化定位</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {dashboard.layers.map(layer => (
            <div key={layer.layer} className={`rounded-lg border px-3 py-2 text-xs ${layerStatusClass(layer.status)}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{layer.label}</p>
                <span className="text-[10px] uppercase tracking-wide">{layerStatusLabel(layer.status)}</span>
              </div>
              <div className="mt-1 space-y-1 text-[11px]">
                {layer.reasons.map(reason => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

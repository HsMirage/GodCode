import { describe, expect, it } from 'vitest'
import {
  buildTaskReadinessDashboardSnapshot,
  buildTaskReadinessDashboardView,
  upsertTaskReadinessDashboardHistory
} from '@/shared/task-readiness-dashboard'

describe('task readiness dashboard', () => {
  it('builds per-version metric trends and layer regression summaries', () => {
    const previous = buildTaskReadinessDashboardSnapshot({
      version: '0.9.0',
      label: 'v0.9.0',
      totalTasks: 10,
      completedTasks: 9,
      firstPassTasks: 8,
      retryCount: 2,
      manualTakeovers: 1,
      approvalRequiredActions: 2,
      approvalHits: 2,
      scopeViolations: null,
      contextLossIncidents: 0,
      crossSessionRecoveryAttempts: 1,
      crossSessionRecoverySuccesses: 1,
      sourceStatusOverrides: { scope_violation_rate: 'missing' },
      metricNotes: { scope_violation_rate: '待接入验收链路。' },
      capturedAt: '2026-03-01T00:00:00.000Z'
    })
    const latest = buildTaskReadinessDashboardSnapshot({
      version: '1.0.0',
      label: 'v1.0.0',
      totalTasks: 10,
      completedTasks: 7,
      firstPassTasks: 5,
      retryCount: 5,
      manualTakeovers: 3,
      approvalRequiredActions: 4,
      approvalHits: 2,
      scopeViolations: null,
      contextLossIncidents: 1,
      crossSessionRecoveryAttempts: 2,
      crossSessionRecoverySuccesses: 1,
      sourceStatusOverrides: { scope_violation_rate: 'missing' },
      metricNotes: { scope_violation_rate: '待接入验收链路。' },
      capturedAt: '2026-03-08T00:00:00.000Z'
    })

    const dashboard = buildTaskReadinessDashboardView([previous, latest])
    expect(dashboard?.latest.version).toBe('1.0.0')
    expect(dashboard?.previous?.version).toBe('0.9.0')
    expect(dashboard?.metrics.find(metric => metric.key === 'task_completion_rate')?.trend).toBe('down')
    expect(dashboard?.metrics.find(metric => metric.key === 'approval_hit_rate')?.delta).toBe(-50)
    expect(dashboard?.layers.find(layer => layer.layer === 'delegate')?.status).toBe('regressed')
    expect(dashboard?.layers.find(layer => layer.layer === 'tool')?.reasons[0]).toContain('审批命中率')
    expect(dashboard?.layers.find(layer => layer.layer === 'router')?.status).toBe('insufficient-data')
  })

  it('upserts snapshots by version while keeping timeline order', () => {
    const oldSnapshot = buildTaskReadinessDashboardSnapshot({
      version: '0.9.0',
      label: 'v0.9.0',
      totalTasks: 2,
      completedTasks: 2,
      capturedAt: '2026-03-01T00:00:00.000Z'
    })
    const latestSnapshot = buildTaskReadinessDashboardSnapshot({
      version: '1.0.0',
      label: 'v1.0.0',
      totalTasks: 2,
      completedTasks: 1,
      capturedAt: '2026-03-08T00:00:00.000Z'
    })
    const replacedSnapshot = buildTaskReadinessDashboardSnapshot({
      version: '1.0.0',
      label: 'v1.0.0',
      totalTasks: 3,
      completedTasks: 3,
      capturedAt: '2026-03-08T12:00:00.000Z'
    })

    const history = upsertTaskReadinessDashboardHistory([oldSnapshot, latestSnapshot], replacedSnapshot)
    expect(history).toHaveLength(2)
    expect(history[0]?.version).toBe('0.9.0')
    expect(history[1]?.capturedAt).toBe('2026-03-08T12:00:00.000Z')
  })
})


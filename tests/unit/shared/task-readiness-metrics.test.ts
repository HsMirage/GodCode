import { describe, expect, it } from 'vitest'
import {
  TASK_READINESS_METRICS,
  computeTaskReadinessMetricValues
} from '@/shared/task-readiness-metrics'

describe('task readiness metrics', () => {
  it('defines the baseline metrics table', () => {
    expect(TASK_READINESS_METRICS.length).toBe(8)
    expect(TASK_READINESS_METRICS[0]?.key).toBe('task_completion_rate')
  })

  it('computes percentage and count values safely', () => {
    const values = computeTaskReadinessMetricValues({
      totalTasks: 10,
      completedTasks: 8,
      firstPassTasks: 6,
      retryCount: 5,
      manualTakeovers: 2,
      approvalRequiredActions: 4,
      approvalHits: 4,
      scopeViolations: 1,
      contextLossIncidents: 1,
      crossSessionRecoveryAttempts: 2,
      crossSessionRecoverySuccesses: 1
    })

    expect(values.find(item => item.key === 'task_completion_rate')?.value).toBe(80)
    expect(values.find(item => item.key === 'average_retry_count')?.value).toBe(0.5)
    expect(values.find(item => item.key === 'approval_hit_rate')?.value).toBe(100)
  })
})


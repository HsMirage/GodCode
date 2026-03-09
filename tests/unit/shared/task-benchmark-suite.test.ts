import { describe, expect, it } from 'vitest'
import {
  TASK_BENCHMARK_DIMENSIONS,
  TASK_BENCHMARK_SUITE,
  getTaskBenchmarkById,
  summarizeTaskBenchmarkRun
} from '@/shared/task-benchmark-suite'

describe('task benchmark suite', () => {
  it('covers all planned benchmark dimensions with fixed cases', () => {
    expect(TASK_BENCHMARK_DIMENSIONS).toHaveLength(7)
    expect(TASK_BENCHMARK_SUITE).toHaveLength(7)

    const dimensionKeys = new Set(TASK_BENCHMARK_DIMENSIONS.map(item => item.key))
    const coveredDimensions = new Set(TASK_BENCHMARK_SUITE.map(item => item.dimension))
    expect(coveredDimensions).toEqual(dimensionKeys)

    const benchmark = getTaskBenchmarkById('B04-sensitive-config-change')
    expect(benchmark?.requiresApproval).toBe(true)
    expect(benchmark?.allowedTools).toContain('bash')
    expect(benchmark?.expectedRoute.preferredAgent).toBe('kuafu')
  })

  it('summarizes pass rate, approval coverage and missing benchmarks', () => {
    const summary = summarizeTaskBenchmarkRun([
      { benchmarkId: 'B01-simple-bug-fix', passed: true },
      { benchmarkId: 'B02-cross-module-feature', passed: true },
      {
        benchmarkId: 'B04-sensitive-config-change',
        passed: false,
        failureReason: '审批后恢复执行失败',
        approvalTriggered: true
      },
      { benchmarkId: 'B07-release-preflight', passed: true, approvalTriggered: false }
    ])

    expect(summary.totalBenchmarks).toBe(7)
    expect(summary.executedBenchmarks).toBe(4)
    expect(summary.passedBenchmarks).toBe(3)
    expect(summary.passRate).toBe(42.86)
    expect(summary.approvalBenchmarks).toBe(2)
    expect(summary.approvalBenchmarksCovered).toBe(1)
    expect(summary.approvalCoverageRate).toBe(50)
    expect(summary.missingBenchmarkIds).toEqual([
      'B03-readonly-architecture-review',
      'B05-browser-data-extraction',
      'B06-recovery-after-refresh'
    ])
    expect(summary.failedBenchmarks).toContainEqual({
      benchmarkId: 'B04-sensitive-config-change',
      reason: '审批后恢复执行失败'
    })
    expect(summary.failedBenchmarks).toContainEqual({
      benchmarkId: 'B03-readonly-architecture-review',
      reason: '未执行'
    })
    expect(summary.byDimension.find(item => item.dimension === 'cross_module_implementation')?.passRate).toBe(100)
    expect(summary.byDimension.find(item => item.dimension === 'browser_automation')?.passRate).toBe(0)
  })
})

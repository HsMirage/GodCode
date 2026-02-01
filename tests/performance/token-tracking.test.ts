import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { CostTracker } from '../../src/main/services/llm/cost-tracker'
import fs from 'fs'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
}))

vi.mock('@/shared/logger', () => ({
  logger: {
    warn: vi.fn()
  }
}))

function getMemoryMB(): number {
  const usage = process.memoryUsage()
  return Math.round(usage.heapUsed / 1024 / 1024)
}

function forceGC(): void {
  if (global.gc) {
    global.gc()
  }
}

describe('Performance: Token Usage Tracking', () => {
  let costTracker: CostTracker
  const mockDate = new Date('2024-01-01T12:00:00.000Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)

    vi.mocked(fs.existsSync).mockReturnValue(false)

    costTracker = CostTracker.getInstance()
    costTracker.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('handles high-frequency token tracking (1000 calls)', () => {
    const startTime = Date.now()

    for (let i = 0; i < 1000; i++) {
      costTracker.trackUsage('anthropic', 100, 50)
    }

    const duration = Date.now() - startTime
    const opsPerSecond = Math.round(1000 / (duration / 1000))

    console.log(`
=== High-Frequency Token Tracking ===
Operations: 1000
Duration: ${duration}ms
Ops/sec: ${opsPerSecond}
Total cost tracked: $${costTracker.getDailyCost().toFixed(4)}
`)

    expect(duration).toBeLessThan(1000)
    expect(opsPerSecond).toBeGreaterThan(1000)
    expect(costTracker.getDailyCost()).toBeGreaterThan(0)
  })

  test('tracks concurrent LLM calls accurately', async () => {
    const concurrentCalls = 50
    const tokensPerCall = { prompt: 500, completion: 200 }

    const startTime = Date.now()

    const trackingPromises = Array.from({ length: concurrentCalls }, (_, i) =>
      Promise.resolve().then(() => {
        costTracker.trackUsage(`model-${i % 3}`, tokensPerCall.prompt, tokensPerCall.completion)
      })
    )

    await Promise.all(trackingPromises)

    const duration = Date.now() - startTime
    const totalCost = costTracker.getDailyCost()

    const expectedCostPerCall =
      (tokensPerCall.prompt / 1_000_000) * 3 + (tokensPerCall.completion / 1_000_000) * 15
    const expectedTotalCost = expectedCostPerCall * concurrentCalls

    console.log(`
=== Concurrent Token Tracking ===
Concurrent calls: ${concurrentCalls}
Duration: ${duration}ms
Expected cost: $${expectedTotalCost.toFixed(6)}
Actual cost: $${totalCost.toFixed(6)}
Accuracy: ${((1 - Math.abs(totalCost - expectedTotalCost) / expectedTotalCost) * 100).toFixed(2)}%
`)

    expect(totalCost).toBeCloseTo(expectedTotalCost, 4)
    expect(duration).toBeLessThan(1000)
  })

  test('cost calculation accuracy with various token counts', () => {
    const testCases = [
      { prompt: 0, completion: 0, expected: 0 },
      { prompt: 1000, completion: 1000, expected: 0.018 },
      { prompt: 1_000_000, completion: 0, expected: 3 },
      { prompt: 0, completion: 1_000_000, expected: 15 },
      { prompt: 500_000, completion: 500_000, expected: 9 },
      { prompt: 100_000, completion: 50_000, expected: 1.05 }
    ]

    let allPassed = true

    for (const tc of testCases) {
      costTracker.reset()
      costTracker.trackUsage('test', tc.prompt, tc.completion)
      const actual = costTracker.getDailyCost()
      const passed = Math.abs(actual - tc.expected) < 0.001

      if (!passed) {
        console.log(
          `FAILED: prompt=${tc.prompt}, completion=${tc.completion}, expected=${tc.expected}, actual=${actual}`
        )
        allPassed = false
      }
    }

    console.log(`
=== Cost Calculation Accuracy ===
Test cases: ${testCases.length}
All passed: ${allPassed}
`)

    expect(allPassed).toBe(true)
  })

  test('handles budget checks under load', () => {
    costTracker.reset()

    for (let i = 0; i < 100; i++) {
      costTracker.trackUsage('model', 1000, 500)
    }

    const costBeforeBudgetCheck = costTracker.getDailyCost()

    const startTime = Date.now()
    let checksPerformed = 0

    for (let i = 0; i < 1000; i++) {
      try {
        costTracker.checkBudget(100)
        checksPerformed++
      } catch {
        break
      }
    }

    const duration = Date.now() - startTime

    console.log(`
=== Budget Check Performance ===
Budget checks: ${checksPerformed}
Duration: ${duration}ms
Current cost: $${costBeforeBudgetCheck.toFixed(4)}
`)

    expect(duration).toBeLessThan(100)
    expect(checksPerformed).toBe(1000)
  })

  test('tracks cost accumulation over multiple providers', () => {
    const providers = ['anthropic', 'openai', 'gemini', 'deepseek', 'mistral']
    const callsPerProvider = 20

    const startTime = Date.now()

    for (const provider of providers) {
      for (let i = 0; i < callsPerProvider; i++) {
        costTracker.trackUsage(provider, 1000 + i * 100, 500 + i * 50)
      }
    }

    const duration = Date.now() - startTime
    const totalCost = costTracker.getDailyCost()

    console.log(`
=== Multi-Provider Tracking ===
Providers: ${providers.length}
Calls per provider: ${callsPerProvider}
Total calls: ${providers.length * callsPerProvider}
Duration: ${duration}ms
Total cost: $${totalCost.toFixed(4)}
`)

    expect(totalCost).toBeGreaterThan(0)
    expect(duration).toBeLessThan(500)
  })

  test('memory usage stays bounded with many records', () => {
    forceGC()
    const startMemory = getMemoryMB()

    for (let i = 0; i < 1000; i++) {
      costTracker.trackUsage('model', 100, 50)
    }

    forceGC()
    const endMemory = getMemoryMB()

    console.log(`
=== Memory Usage with Many Records ===
Records: 1000
Start Memory: ${startMemory}MB
End Memory: ${endMemory}MB
Memory Delta: ${endMemory - startMemory}MB
`)

    expect(endMemory - startMemory).toBeLessThan(100)
  })

  test('file persistence handles rapid writes', () => {
    const startTime = Date.now()
    let writeCount = 0

    for (let i = 0; i < 100; i++) {
      costTracker.trackUsage('model', 100, 50)
      writeCount++
    }

    const duration = Date.now() - startTime

    console.log(`
=== File Persistence Performance ===
Writes: ${writeCount}
Duration: ${duration}ms
Writes/sec: ${Math.round(writeCount / (duration / 1000))}
writeFileSync calls: ${vi.mocked(fs.writeFileSync).mock.calls.length}
`)

    expect(duration).toBeLessThan(1000)
  })

  test('handles edge cases in token counts', () => {
    costTracker.reset()

    costTracker.trackUsage('model', -100, 50)
    expect(costTracker.getDailyCost()).toBeGreaterThanOrEqual(0)

    costTracker.reset()
    costTracker.trackUsage('model', 100.7, 50.3)
    expect(costTracker.getDailyCost()).toBeGreaterThan(0)

    costTracker.reset()
    costTracker.trackUsage('model', Number.MAX_SAFE_INTEGER, 0)
    expect(isFinite(costTracker.getDailyCost())).toBe(true)

    console.log(`
=== Edge Case Handling ===
Negative tokens handled: ✓
Float tokens handled: ✓
Large numbers handled: ✓
`)
  })

  test('cost reaches warning threshold level', () => {
    costTracker.reset()

    costTracker.trackUsage('model', 2_600_000, 0)

    const currentCost = costTracker.getDailyCost()

    console.log(`
=== Warning Threshold Test ===
Cost after tracking: $${currentCost.toFixed(2)}
Threshold check: ${currentCost >= 8.0 ? 'Above 80% of $10 limit' : 'Below threshold'}
`)

    expect(currentCost).toBeGreaterThan(7.5)
  })
})

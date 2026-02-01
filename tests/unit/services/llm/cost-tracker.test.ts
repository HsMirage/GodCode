import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CostTracker } from '@/main/services/llm/cost-tracker'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '@/shared/logger'

// Mock dependencies
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
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

describe('CostTracker', () => {
  let costTracker: CostTracker
  const mockDate = new Date('2024-01-01T12:00:00.000Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)

    // Reset singleton instance by accessing private static property if needed,
    // or by creating a fresh instance via new (we'll need to cast as any to bypass private constructor)
    // However, the cleanest way with the existing code is to just create a new instance via reflection
    // or rely on the fact that we can't easily reset the singleton but we can reset its state.

    // Let's rely on `CostTracker.getInstance()` but we need to ensure it's fresh or reset.
    // The class has a reset() method, so we should use that.

    // First, ensure fs mocks behave as if file doesn't exist initially
    vi.mocked(fs.existsSync).mockReturnValue(false)

    // Force a new instance creation if possible, or just get the instance and reset it
    // To truly isolate tests, we might need to bypass the singleton pattern or add a resetInstance method for testing.
    // For now, we'll just use getInstance() and reset().
    costTracker = CostTracker.getInstance()
    costTracker.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should initialize with empty records', () => {
    expect(costTracker.getDailyCost()).toBe(0)
  })

  it('should track usage and calculate cost correctly', () => {
    // 1M prompt tokens = $3, 1M completion tokens = $15
    // 1000 prompt tokens = $0.003
    // 1000 completion tokens = $0.015
    // Total = $0.018

    costTracker.trackUsage('anthropic', 1000, 1000)

    const cost = costTracker.getDailyCost()
    expect(cost).toBeCloseTo(0.018)

    // Verify file persistence
    // Note: reset() in beforeEach also calls saveRecords, so we check the last call
    expect(fs.writeFileSync).toHaveBeenCalled()
    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const lastCall = calls[calls.length - 1]
    const writtenData = JSON.parse(lastCall[1] as string)

    expect(writtenData).toHaveLength(1)
    expect(writtenData[0]).toEqual({
      date: '2024-01-01',
      provider: 'anthropic',
      promptTokens: 1000,
      completionTokens: 1000,
      cost: 0.018
    })
  })

  it('should accumulate costs for the same day', () => {
    costTracker.trackUsage('anthropic', 1000, 1000) // $0.018
    costTracker.trackUsage('openai', 2000, 2000) // $0.036

    const total = costTracker.getDailyCost()
    expect(total).toBeCloseTo(0.054)
  })

  it('should prune records from previous days', () => {
    // Simulate a record from yesterday
    const yesterdayRecord = {
      date: '2023-12-31',
      provider: 'anthropic',
      promptTokens: 1000,
      completionTokens: 1000,
      cost: 0.018
    }

    // Mock loading from file
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([yesterdayRecord]))

    // We need to trigger loading again or manually inject records (since we can't easily re-instantiate singleton)
    // Let's use `reset()` which clears everything, then manually add a record via a private-like access or just rely on `loadRecords` behavior if we could trigger it.
    // Since `loadRecords` is private and called in constructor, let's create a new instance via prototype manipulation or similar if we really need to test loading.

    // Alternative: Just test `pruneToToday` logic via public methods.
    // `trackUsage` calls `pruneToToday`.

    // Let's simulate the state where we have old records (using `any` to access private property)
    ;(costTracker as any).records = [yesterdayRecord]

    // Now track usage for today
    costTracker.trackUsage('openai', 1000, 1000)

    // Should have removed yesterday's record
    const records = (costTracker as any).records
    expect(records).toHaveLength(1)
    expect(records[0].date).toBe('2024-01-01')
  })

  it('should throw error when budget exceeded', () => {
    // Limit is $10. Let's spend $11.
    // 1M prompt tokens = $3. 4M = $12.
    costTracker.trackUsage('expensive-model', 4_000_000, 0)

    expect(() => costTracker.checkBudget(10)).toThrow('Daily LLM budget exceeded')
  })

  it('should not throw when within budget', () => {
    costTracker.trackUsage('cheap-model', 100, 100)
    expect(() => costTracker.checkBudget(10)).not.toThrow()
  })

  it('should warn when approaching limit', () => {
    // Threshold is 0.8 (80%)
    // Limit $10. Warn at $8.

    // Spend $8.1
    // 2.7M prompt tokens * $3 = $8.1
    costTracker.trackUsage('model', 2_700_000, 0)

    expect(logger.warn).toHaveBeenCalledWith(
      'Approaching daily LLM budget limit',
      expect.objectContaining({
        total: '8.10',
        dailyLimit: '10.00'
      })
    )
  })

  it('should handle file system errors gracefully', () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Write failed')
    })

    costTracker.trackUsage('model', 100, 100)

    expect(logger.warn).toHaveBeenCalledWith(
      'CostTracker failed to persist usage data',
      expect.objectContaining({ error: 'Write failed' })
    )
  })

  it('should handle corrupted usage file gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

    // Create new instance to trigger loadRecords
    // We have to use a trick to reset the singleton for this specific test
    ;(CostTracker as any).instance = undefined
    const newTracker = CostTracker.getInstance()

    expect(logger.warn).toHaveBeenCalledWith(
      'CostTracker failed to load usage data',
      expect.anything()
    )
    // Should start with empty records
    expect(newTracker.getDailyCost()).toBe(0)
  })
})

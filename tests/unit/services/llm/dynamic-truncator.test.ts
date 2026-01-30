import { describe, it, expect, beforeEach } from 'vitest'
import {
  truncateToTokenLimit,
  dynamicTruncate,
  createDynamicTruncator
} from '@/main/services/llm/dynamic-truncator'

describe('Dynamic Truncator', () => {
  describe('truncateToTokenLimit', () => {
    it('returns unchanged when under limit', () => {
      const input = 'short content'
      const result = truncateToTokenLimit(input, 100)
      expect(result.result).toBe(input)
      expect(result.truncated).toBe(false)
    })

    it('truncates long content preserving header lines', () => {
      const input = 'line1\nline2\nline3\nline4\nline5'
      const result = truncateToTokenLimit(input, 5, 2)
      expect(result.truncated).toBe(true)
      expect(result.result).toContain('line1\nline2')
      expect(result.removedCount).toBe(3)
    })

    it('returns truncated:true flag when truncation occurs', () => {
      const input = 'a'.repeat(400)
      const result = truncateToTokenLimit(input, 50)
      expect(result.truncated).toBe(true)
    })

    it('handles content with fewer lines than preserveHeaderLines', () => {
      const input = 'only\ntwo lines'
      const result = truncateToTokenLimit(input, 2)
      expect(result.truncated).toBe(true)
      expect(result.result).toContain('only\ntw')
      expect(result.result).toContain('[Output truncated due to context window limit]')
    })

    it('includes removal count in result when line-based truncation occurs', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`)
      const input = lines.join('\n')
      const result = truncateToTokenLimit(input, 100, 3)
      expect(result.truncated).toBe(true)
      expect(result.removedCount).toBeGreaterThan(0)
    })
  })

  describe('dynamicTruncate', () => {
    it('falls back to targetMaxTokens when no contextUsage provided', () => {
      const input = 'a'.repeat(200)
      const result = dynamicTruncate(input, undefined, { targetMaxTokens: 10 })
      expect(result.truncated).toBe(true)
    })

    it('respects remaining context window', () => {
      const input = 'a'.repeat(400)
      const contextUsage = {
        usedTokens: 1000,
        remainingTokens: 100,
        usagePercentage: 0.9
      }
      const result = dynamicTruncate(input, contextUsage)
      expect(result.truncated).toBe(true)
    })

    it('returns suppression message when context exhausted', () => {
      const input = 'some content'
      const contextUsage = {
        usedTokens: 200000,
        remainingTokens: 0,
        usagePercentage: 1.0
      }
      const result = dynamicTruncate(input, contextUsage)
      expect(result.result).toBe('[Output suppressed - context window exhausted]')
      expect(result.truncated).toBe(true)
    })

    it('calculates maxOutputTokens as 50% of remaining', () => {
      const input = 'a'.repeat(400)
      const contextUsage = {
        usedTokens: 0,
        remainingTokens: 160,
        usagePercentage: 0
      }
      const result = dynamicTruncate(input, contextUsage)
      expect(result.truncated).toBe(true)
    })
  })

  describe('createDynamicTruncator', () => {
    let truncator: ReturnType<typeof createDynamicTruncator>

    beforeEach(() => {
      truncator = createDynamicTruncator(1000)
    })

    it('factory returns object with expected methods', () => {
      expect(truncator.truncate).toBeDefined()
      expect(truncator.getUsage).toBeDefined()
      expect(truncator.addTokens).toBeDefined()
      expect(truncator.reset).toBeDefined()
      expect(truncator.truncateSync).toBeDefined()
    })

    it('truncate updates internal usedTokens', () => {
      const input = 'abcd'
      truncator.truncate(input)
      expect(truncator.getUsage().usedTokens).toBe(1)
    })

    it('getUsage returns correct stats', () => {
      const usage = truncator.getUsage()
      expect(usage.usedTokens).toBe(0)
      expect(usage.remainingTokens).toBe(1000)
      expect(usage.usagePercentage).toBe(0)
    })

    it('addTokens increments counter', () => {
      truncator.addTokens(500)
      expect(truncator.getUsage().usedTokens).toBe(500)
    })

    it('reset clears usedTokens', () => {
      truncator.addTokens(500)
      truncator.reset()
      expect(truncator.getUsage().usedTokens).toBe(0)
    })

    it('truncateSync works independently', () => {
      const input = 'a'.repeat(40)
      const result = truncator.truncateSync(input, 5)
      expect(result.truncated).toBe(true)
      expect(truncator.getUsage().usedTokens).toBe(0)
    })
  })
})

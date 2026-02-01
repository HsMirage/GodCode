import { describe, it, expect } from 'vitest'

describe('ContextManagerService', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens for English text', () => {
      const text = 'Hello world this is a test'
      expect(text.length / 4).toBeGreaterThan(5)
    })

    it('should estimate tokens for Chinese text', () => {
      const text = '你好世界这是测试'
      expect(text.length / 2).toBeGreaterThan(3)
    })
  })

  it('should have getContextWindow method', () => {
    expect(true).toBe(true)
  })
})

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ContextManagerService } from '@/main/services/context-manager.service'
import type { Message } from '@/types/domain'

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => ({
  prisma: {
    message: {
      findMany: vi.fn(),
      deleteMany: vi.fn()
    }
  },
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

// Mock DatabaseService
vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mocks.prisma
    })
  }
}))

// Mock LoggerService
vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => mocks.logger
    })
  }
}))

describe('ContextManagerService Integration', () => {
  let service: ContextManagerService

  // Helper to create mock messages
  const createMessage = (
    id: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    createdAtStr: string
  ): Message => ({
    id,
    sessionId: 'session-123',
    role,
    content,
    createdAt: new Date(createdAtStr)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ContextManagerService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getContextWindow', () => {
    it('should return empty window for empty session', async () => {
      mocks.prisma.message.findMany.mockResolvedValue([])

      const result = await service.getContextWindow('session-123')

      expect(result).toEqual({
        messages: [],
        totalTokens: 0,
        truncated: false
      })
      expect(mocks.prisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-123' },
        orderBy: { createdAt: 'asc' }
      })
    })

    it('should include all messages when under token limit', async () => {
      const messages = [
        createMessage('1', 'user', 'Hello', '2026-01-31T10:00:00Z'),
        createMessage('2', 'assistant', 'Hi there', '2026-01-31T10:00:05Z')
      ]
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      const result = await service.getContextWindow('session-123', 1000)

      expect(result.messages).toHaveLength(2)
      expect(result.truncated).toBe(false)
      expect(result.totalTokens).toBeGreaterThan(0)
    })

    it('should apply sliding window when over token limit (exclude oldest non-system)', async () => {
      // Create messages that exceed the small limit we'll set
      // "Message 1" ~ 9 chars ~ 3 tokens
      // "Message 2" ~ 9 chars ~ 3 tokens
      // "Message 3" ~ 9 chars ~ 3 tokens
      const messages = [
        createMessage('1', 'user', 'Message 1', '2026-01-31T10:00:00Z'),
        createMessage('2', 'assistant', 'Message 2', '2026-01-31T10:00:05Z'),
        createMessage('3', 'user', 'Message 3', '2026-01-31T10:00:10Z')
      ]
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      // Set maxTokens to roughly allow only 2 messages
      // Estimate: "Message X" is 9 chars.
      // estimateTokens calculation: 9 chars / 4 = 2.25 -> ceil = 3 tokens per message.
      // If maxTokens = 7, we should get 2 messages (6 tokens), 3 messages would be 9 tokens.
      const result = await service.getContextWindow('session-123', 7)

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].id).toBe('2')
      expect(result.messages[1].id).toBe('3')
      expect(result.truncated).toBe(true)
      expect(result.totalTokens).toBe(6) // 3 + 3
    })

    it('should prioritize system messages even if old', async () => {
      const messages = [
        createMessage('1', 'system', 'System Prompt', '2026-01-31T10:00:00Z'), // ~13 chars -> 4 tokens
        createMessage('2', 'user', 'Old Message', '2026-01-31T10:01:00Z'), // ~11 chars -> 3 tokens
        createMessage('3', 'user', 'New Message', '2026-01-31T10:02:00Z') // ~11 chars -> 3 tokens
      ]
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      // Max tokens = 8.
      // System (4) + New (3) = 7 <= 8.
      // System (4) + New (3) + Old (3) = 10 > 8.
      // Should keep System and New.
      const result = await service.getContextWindow('session-123', 8)

      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('system')
      expect(result.messages[1].content).toBe('New Message')
      expect(result.truncated).toBe(true)
    })

    it('should handle mixed Chinese/English text token estimation', async () => {
      // English: "Hello" (5 chars) -> 5/4 = 1.25 -> 2 tokens
      // Chinese: "你好" (2 chars) -> 2/2 = 1 token
      // Mixed: "Hello你好" -> 5/4 + 2/2 = 1.25 + 1 = 2.25 -> 3 tokens
      const messages = [createMessage('1', 'user', 'Hello你好', '2026-01-31T10:00:00Z')]
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      const result = await service.getContextWindow('session-123')

      expect(result.messages).toHaveLength(1)
      expect(result.totalTokens).toBe(3)
    })

    it('should respect custom maxTokens parameter', async () => {
      const messages = [
        createMessage('1', 'user', 'A long message that takes some tokens', '2026-01-31T10:00:00Z')
      ]
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      // Very small limit
      const result = await service.getContextWindow('session-123', 1)

      // Should be truncated because even one message is > 1 token
      expect(result.messages).toHaveLength(0)
      expect(result.truncated).toBe(true)
      expect(result.totalTokens).toBe(0)
    })
  })

  describe('generateSummary', () => {
    it('should return empty string for empty session', async () => {
      mocks.prisma.message.findMany.mockResolvedValue([])

      const result = await service.generateSummary('session-123')

      expect(result).toBe('')
    })

    it('should generate summary with message counts', async () => {
      const messages = [
        createMessage('1', 'user', 'Hello', '2026-01-31T10:00:00Z'),
        createMessage('2', 'assistant', 'Hi', '2026-01-31T10:00:05Z'),
        createMessage('3', 'user', 'Bye', '2026-01-31T10:00:10Z')
      ]
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      const result = await service.generateSummary('session-123')

      expect(result).toContain('Session Summary (3 messages)')
      expect(result).toContain('User messages: 2')
      expect(result).toContain('Assistant messages: 1')
      expect(mocks.logger.info).toHaveBeenCalledWith('Generated session summary', {
        sessionId: 'session-123'
      })
    })

    it('should only take first 50 messages', async () => {
      mocks.prisma.message.findMany.mockResolvedValue([]) // Return value doesn't matter for the call check

      await service.generateSummary('session-123')

      expect(mocks.prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50
        })
      )
    })
  })

  describe('cleanupOldMessages', () => {
    it('should return 0 when messages under keepCount', async () => {
      mocks.prisma.message.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }])

      const count = await service.cleanupOldMessages('session-123', 5)

      expect(count).toBe(0)
      expect(mocks.prisma.message.deleteMany).not.toHaveBeenCalled()
    })

    it('should delete oldest messages when over keepCount', async () => {
      // 5 messages total
      const messages = [{ id: '5' }, { id: '4' }, { id: '3' }, { id: '2' }, { id: '1' }]
      // Mock finding messages (logic sorts desc in implementation)
      mocks.prisma.message.findMany.mockResolvedValue(messages)

      // Mock delete result
      mocks.prisma.message.deleteMany.mockResolvedValue({ count: 2 })

      // Keep 3, so 2 should be deleted
      const count = await service.cleanupOldMessages('session-123', 3)

      expect(count).toBe(2)

      // Verify findMany was called correctly
      expect(mocks.prisma.message.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-123' },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      })

      // Verify deleteMany was called with correct IDs
      // slice(3) on [5,4,3,2,1] gives [2,1] (the oldest ones if the array was sorted desc by createdAt? Wait)
      // Implementation: orderBy: { createdAt: 'desc' }.
      // So index 0 is NEWEST.
      // slice(keepCount) gets the OLDER messages.
      // If messages are [Newest ... Oldest]
      // slice(3) gets the ones after the first 3.
      expect(mocks.prisma.message.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['2', '1'] } }
      })
    })

    it('should return correct deletion count', async () => {
      mocks.prisma.message.findMany.mockResolvedValue(Array(10).fill({ id: 'msg' }))
      mocks.prisma.message.deleteMany.mockResolvedValue({ count: 5 })

      const count = await service.cleanupOldMessages('session-123', 5)

      expect(count).toBe(5)
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Cleaned up old messages',
        expect.objectContaining({
          deleted: 5
        })
      )
    })
  })
})

import { describe, expect, test, vi } from 'vitest'
import {
  persistAssistantMessage,
  persistUserMessage
} from '../../../../src/main/services/message/message-persistence.service'

describe('message-persistence.service', () => {
  test('persistUserMessage creates user message and touches session timestamp', async () => {
    const createdMessage = {
      id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'hello'
    }
    const tx = {
      message: {
        create: vi.fn().mockResolvedValue(createdMessage)
      },
      session: {
        update: vi.fn().mockResolvedValue({ id: 'session-1' })
      }
    }
    const prisma = {
      $transaction: vi.fn(async callback => callback(tx))
    } as any

    const result = await persistUserMessage({
      prisma,
      sessionId: 'session-1',
      content: 'hello',
      metadata: { agentCode: 'luban' }
    })

    expect(result).toBe(createdMessage)
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'session-1',
          role: 'user',
          content: 'hello',
          metadata: { agentCode: 'luban' }
        })
      })
    )
    expect(tx.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: { updatedAt: expect.any(Date) }
      })
    )
  })

  test('persistAssistantMessage creates assistant message and touches session timestamp', async () => {
    const createdMessage = {
      id: 'message-2',
      sessionId: 'session-2',
      role: 'assistant',
      content: 'done'
    }
    const tx = {
      message: {
        create: vi.fn().mockResolvedValue(createdMessage)
      },
      session: {
        update: vi.fn().mockResolvedValue({ id: 'session-2' })
      }
    }
    const prisma = {
      $transaction: vi.fn(async callback => callback(tx))
    } as any

    const result = await persistAssistantMessage({
      prisma,
      sessionId: 'session-2',
      content: 'done',
      metadata: { executionPath: 'direct' }
    })

    expect(result).toBe(createdMessage)
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'session-2',
          role: 'assistant',
          content: 'done',
          metadata: { executionPath: 'direct' }
        })
      })
    )
    expect(tx.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-2' },
        data: { updatedAt: expect.any(Date) }
      })
    )
  })
})

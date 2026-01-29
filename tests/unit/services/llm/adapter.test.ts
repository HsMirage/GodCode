import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      stream: vi.fn()
    }
  }
}))

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter

  beforeEach(() => {
    adapter = new AnthropicAdapter('test-api-key')
  })

  it('should initialize with API key', () => {
    expect(adapter).toBeDefined()
  })

  it('should format messages correctly', async () => {
    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' }
        }
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: ' World' }
        }
      }
    }

    // @ts-ignore
    adapter.client.messages.stream.mockReturnValue(mockStream)

    const messages: any[] = [
      { role: 'user', content: 'Test message', id: '1', sessionId: '1', createdAt: new Date() }
    ]

    const chunks: string[] = []
    for await (const chunk of adapter.streamMessage(messages as any, {
      model: 'claude-3-5-sonnet-20241022'
    })) {
      if (chunk.content) {
        chunks.push(chunk.content)
      }
    }

    expect(chunks).toEqual(['Hello', ' World'])
  })

  it('should retry on failure', async () => {
    let attemptCount = 0

    const mockStreamFail = {
      [Symbol.asyncIterator]: async function* () {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('API Error')
        }
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Success' }
        }
      }
    }

    // @ts-ignore
    adapter.client.messages.stream.mockReturnValue(mockStreamFail)

    const messages: any[] = [
      { role: 'user', content: 'Test', id: '1', sessionId: '1', createdAt: new Date() }
    ]

    const chunks: string[] = []
    for await (const chunk of adapter.streamMessage(messages as any, {
      model: 'claude-3-5-sonnet-20241022'
    })) {
      if (chunk.content) {
        chunks.push(chunk.content)
      }
    }

    expect(attemptCount).toBe(3)
    expect(chunks).toEqual(['Success'])
  })
})

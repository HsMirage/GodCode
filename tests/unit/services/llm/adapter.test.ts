import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk')

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

    vi.spyOn(Anthropic.prototype.messages, 'stream').mockReturnValue(mockStream as any)

    const messages = [{ role: 'user' as const, content: 'Test message' }]

    const chunks: string[] = []
    for await (const chunk of adapter.streamResponse(messages, {
      model: 'claude-3-5-sonnet-20241022'
    })) {
      chunks.push(chunk)
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

    vi.spyOn(Anthropic.prototype.messages, 'stream').mockReturnValue(mockStreamFail as any)

    const messages = [{ role: 'user' as const, content: 'Test' }]

    const chunks: string[] = []
    for await (const chunk of adapter.streamResponse(messages, {
      model: 'claude-3-5-sonnet-20241022'
    })) {
      chunks.push(chunk)
    }

    expect(attemptCount).toBe(3)
    expect(chunks).toEqual(['Success'])
  })
})

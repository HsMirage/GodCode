import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
import OpenAI from 'openai'

// Mock SDK
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    }))
  }
})

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter
  let mockCreate: any

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new OpenAIAdapter('test-key')
    const mockClient = (OpenAI as any).mock.results[0].value
    mockCreate = mockClient.chat.completions.create
  })

  it('should send message successfully', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    })

    const result = await adapter.sendMessage(
      [
        {
          role: 'user',
          content: 'Hi',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gpt-4' }
    )

    expect(result.content).toBe('Hello')
    expect(result.usage.prompt_tokens).toBe(10)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] }),
      expect.anything()
    )
  })

  it('should retry on failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
      choices: [{ message: { content: 'Success' } }],
      usage: {}
    })

    const result = await adapter.sendMessage(
      [
        {
          role: 'user',
          content: 'Hi',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      {}
    )

    expect(result.content).toBe('Success')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('should stream messages', async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: 'Hel' } }] }
      yield { choices: [{ delta: { content: 'lo' } }] }
    })()

    mockCreate.mockResolvedValue(mockStream)

    const chunks = []
    for await (const chunk of adapter.streamMessage(
      [
        {
          role: 'user',
          content: 'Hi',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      {}
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(3) // Hel, lo, '' (done)
    expect(chunks[0].content).toBe('Hel')
    expect(chunks[1].content).toBe('lo')
    expect(chunks[2].done).toBe(true)
  })
})

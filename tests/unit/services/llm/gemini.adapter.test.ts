import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeminiAdapter } from '@/main/services/llm/gemini.adapter'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Mock SDK
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        startChat: vi.fn().mockReturnValue({
          sendMessage: vi.fn(),
          sendMessageStream: vi.fn()
        })
      })
    }))
  }
})

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter
  let mockChat: any

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new GeminiAdapter('test-key')
    const mockClient = (GoogleGenerativeAI as any).mock.results[0].value
    mockChat = mockClient.getGenerativeModel().startChat()
  })

  it('should send message successfully', async () => {
    mockChat.sendMessage.mockResolvedValue({
      response: {
        text: () => 'Hello',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
      }
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

    expect(result.content).toBe('Hello')
    expect(result.usage.prompt_tokens).toBe(10)
    expect(mockChat.sendMessage).toHaveBeenCalledWith('Hi')
  })

  it('should handle system prompt', async () => {
    mockChat.sendMessage.mockResolvedValue({
      response: { text: () => 'Response', usageMetadata: {} }
    })

    await adapter.sendMessage(
      [
        {
          role: 'system',
          content: 'System',
          id: '0',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        },
        {
          role: 'user',
          content: 'User',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      {}
    )

    // Gemini adapter prepends system prompt to user prompt
    expect(mockChat.sendMessage).toHaveBeenCalledWith('System\n\nUser')
  })

  it('should retry on failure', async () => {
    mockChat.sendMessage.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
      response: { text: () => 'Success', usageMetadata: {} }
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
    expect(mockChat.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('should stream messages', async () => {
    const mockStream = (async function* () {
      yield { text: () => 'Hel' }
      yield { text: () => 'lo' }
    })()

    mockChat.sendMessageStream.mockResolvedValue({
      stream: mockStream
    })

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

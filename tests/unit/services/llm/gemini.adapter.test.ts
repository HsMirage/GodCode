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

vi.mock('@/main/services/ai-browser', () => ({
  allTools: []
}))

vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    getWebContents: vi.fn().mockReturnValue(null)
  }
}))

vi.mock('@/main/services/tools/tool-execution.service', () => ({
  toolExecutionService: {
    registerBrowserTools: vi.fn(),
    getToolDefinitions: vi.fn().mockReturnValue([]),
    executeToolCalls: vi.fn().mockResolvedValue({
      outputs: [],
      allSucceeded: true,
      totalDurationMs: 0
    })
  }
}))

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
        candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
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
      response: {
        text: () => 'Response',
        candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        usageMetadata: {}
      }
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
      response: {
        text: () => 'Success',
        candidates: [{ content: { parts: [{ text: 'Success' }] } }],
        usageMetadata: {}
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

    expect(result.content).toBe('Success')
    expect(mockChat.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('should stream messages', async () => {
    const mockStream = (async function* () {
      yield { text: () => 'Hel', candidates: [{ content: { parts: [{ text: 'Hel' }] } }] }
      yield { text: () => 'lo', candidates: [{ content: { parts: [{ text: 'lo' }] } }] }
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

  it('should handle tool calls in sendMessage', async () => {
    const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

    mockChat.sendMessage
      .mockResolvedValueOnce({
        response: {
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'test_tool', args: { arg: 'value' } } }]
              }
            }
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
        }
      })
      .mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: 'Tool result processed' }] } }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 }
        }
      })

    vi.mocked(toolExecutionService.executeToolCalls).mockResolvedValueOnce({
      outputs: [
        {
          toolCall: { id: 'gemini-123', name: 'test_tool', arguments: { arg: 'value' } },
          result: { success: true, output: 'Tool executed' },
          success: true,
          durationMs: 100
        }
      ],
      allSucceeded: true,
      totalDurationMs: 100
    })

    const result = await adapter.sendMessage(
      [
        {
          role: 'user',
          content: 'Use the tool',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gemini-pro' }
    )

    expect(result.content).toBe('Tool result processed')
    expect(mockChat.sendMessage).toHaveBeenCalledTimes(2)
    expect(toolExecutionService.executeToolCalls).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'test_tool', arguments: { arg: 'value' } })
      ]),
      expect.anything()
    )
  })

  it('should handle tool calls in streamMessage', async () => {
    const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

    const firstStream = (async function* () {
      yield {
        candidates: [
          { content: { parts: [{ functionCall: { name: 'test_tool', args: { arg: 'value' } } }] } }
        ]
      }
    })()

    const secondStream = (async function* () {
      yield { candidates: [{ content: { parts: [{ text: 'Done' }] } }] }
    })()

    mockChat.sendMessageStream
      .mockResolvedValueOnce({ stream: firstStream })
      .mockResolvedValueOnce({ stream: secondStream })

    vi.mocked(toolExecutionService.executeToolCalls).mockResolvedValueOnce({
      outputs: [
        {
          toolCall: { id: 'gemini-123', name: 'test_tool', arguments: { arg: 'value' } },
          result: { success: true, output: 'Tool executed' },
          success: true,
          durationMs: 100
        }
      ],
      allSucceeded: true,
      totalDurationMs: 100
    })

    const chunks = []
    for await (const chunk of adapter.streamMessage(
      [
        {
          role: 'user',
          content: 'Use the tool',
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

    expect(chunks.find(c => c.content === 'Done')).toBeTruthy()
    expect(chunks[chunks.length - 1].done).toBe(true)
    expect(mockChat.sendMessageStream).toHaveBeenCalledTimes(2)
    expect(toolExecutionService.executeToolCalls).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'test_tool', arguments: { arg: 'value' } })
      ]),
      expect.anything()
    )
  })
})

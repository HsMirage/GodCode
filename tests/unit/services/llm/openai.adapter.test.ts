import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
import OpenAI from 'openai'

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

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreate: any

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new OpenAIAdapter('test-key')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = (OpenAI as any).mock.results[0].value
    mockCreate = mockClient.chat.completions.create
  })

  it('should send message successfully', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
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
      choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
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
      yield { choices: [{ delta: { content: 'Hel' }, finish_reason: null }] }
      yield { choices: [{ delta: { content: 'lo' }, finish_reason: null }] }
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
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

    expect(chunks).toHaveLength(3)
    expect(chunks[0].content).toBe('Hel')
    expect(chunks[1].content).toBe('lo')
    expect(chunks[2].done).toBe(true)
  })

  it('should handle tool calls in sendMessage', async () => {
    const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'test_tool', arguments: '{"arg": "value"}' }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Tool result processed' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 10 }
      })

    vi.mocked(toolExecutionService.executeToolCalls).mockResolvedValueOnce({
      outputs: [
        {
          toolCall: { id: 'call_1', name: 'test_tool', arguments: { arg: 'value' } },
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
      { model: 'gpt-4' }
    )

    expect(result.content).toBe('Tool result processed')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(toolExecutionService.executeToolCalls).toHaveBeenCalledWith(
      [{ id: 'call_1', name: 'test_tool', arguments: { arg: 'value' } }],
      expect.anything()
    )
  })

  it('should handle tool calls in streamMessage', async () => {
    const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

    const firstStream = (async function* () {
      yield {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', type: 'function', function: { name: 'test_tool' } }
              ]
            },
            finish_reason: null
          }
        ]
      }
      yield {
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: '{"arg":' } }] },
            finish_reason: null
          }
        ]
      }
      yield {
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: '"value"}' } }] },
            finish_reason: null
          }
        ]
      }
      yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
    })()

    const secondStream = (async function* () {
      yield { choices: [{ delta: { content: 'Done' }, finish_reason: null }] }
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] }
    })()

    mockCreate.mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream)

    vi.mocked(toolExecutionService.executeToolCalls).mockResolvedValueOnce({
      outputs: [
        {
          toolCall: { id: 'call_1', name: 'test_tool', arguments: { arg: 'value' } },
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
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(toolExecutionService.executeToolCalls).toHaveBeenCalledWith(
      [{ id: 'call_1', name: 'test_tool', arguments: { arg: 'value' } }],
      expect.anything()
    )
  })
})

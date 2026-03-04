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
      },
      responses: {
        create: vi.fn()
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockResponsesCreate: any

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new OpenAIAdapter('test-key')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = (OpenAI as any).mock.results[0].value
    mockCreate = mockClient.chat.completions.create
    mockResponsesCreate = mockClient.responses.create
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )

    expect(result.content).toBe('Hello')
    expect(result.usage.prompt_tokens).toBe(10)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] }),
      expect.anything()
    )
  })

  it('should extract non-standard reasoning_content when content is empty', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null, reasoning_content: 'Recovered text from gateway' }, finish_reason: 'stop' }],
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )

    expect(result.content).toContain('Recovered text from gateway')
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )

    expect(result.content).toBe('Success')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('should throw when OpenAI-compatible response is missing choices and fallback text', async () => {
    mockCreate.mockResolvedValue({
      usage: { prompt_tokens: 10, completion_tokens: 0 }
    })

    await expect(
      adapter.sendMessage(
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
        { model: 'gpt-4', apiProtocol: 'chat/completions' }
      )
    ).rejects.toThrow('missing choices[0]')
  })

  it('should extract choice-level text when message field is absent', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ text: 'Recovered from choice.text', finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 4 }
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )

    expect(result.content).toContain('Recovered from choice.text')
  })

  it(
    'should keep reconnecting beyond configured maxRetries for retryable API failures',
    async () => {
      mockCreate
        .mockRejectedValueOnce(new Error('Network error 1'))
        .mockRejectedValueOnce(new Error('Network error 2'))
        .mockRejectedValueOnce(new Error('Network error 3'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Recovered' }, finish_reason: 'stop' }],
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
        { model: 'gpt-4', apiProtocol: 'chat/completions', maxRetries: 1 }
      )

      expect(result.content).toBe('Recovered')
      expect(mockCreate).toHaveBeenCalledTimes(4)
    },
    15000
  )

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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(3)
    expect(chunks[0].content).toBe('Hel')
    expect(chunks[1].content).toBe('lo')
    expect(chunks[2].done).toBe(true)
  })

  it('should ignore malformed streaming chunks without choices', async () => {
    const mockStream = (async function* () {
      yield { malformed: true }
      yield { choices: [{ delta: { content: 'OK' }, finish_reason: null }] }
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )) {
      chunks.push(chunk)
    }

    expect(chunks.some(chunk => chunk.content === 'OK')).toBe(true)
    expect(chunks[chunks.length - 1].done).toBe(true)
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
    )

    expect(result.content).toBe('Tool result processed')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(toolExecutionService.executeToolCalls).toHaveBeenCalledWith(
      [{ id: 'call_1', name: 'test_tool', arguments: { arg: 'value' } }],
      expect.anything()
    )
  })

  it('should fallback to tool execution summary when tool loop ends without final text', async () => {
    const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'file_read', arguments: '{"path":"/tmp/spec.md"}' }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ],
      usage: { prompt_tokens: 12, completion_tokens: 6 }
    })

    vi.mocked(toolExecutionService.executeToolCalls).mockResolvedValueOnce({
      outputs: [
        {
          toolCall: { id: 'call_1', name: 'file_read', arguments: { path: '/tmp/spec.md' } },
          result: { success: true, output: 'SPEC: homepage, blacklist, search' },
          success: true,
          durationMs: 42
        }
      ],
      allSucceeded: true,
      totalDurationMs: 42
    })

    const result = await adapter.sendMessage(
      [
        {
          role: 'user',
          content: 'Read spec and continue',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gpt-4', apiProtocol: 'chat/completions', maxToolIterations: 1 }
    )

    expect(result.content).toContain('TOOL_EXECUTION_SUMMARY')
    expect(result.content).toContain('file_read')
    expect(result.content).toContain('SPEC: homepage, blacklist, search')
  })

  it('should execute responses protocol in sendMessage', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      id: 'resp_1',
      output_text: 'Responses hello',
      output: [],
      usage: { input_tokens: 7, output_tokens: 5 }
    })

    const result = await adapter.sendMessage(
      [
        {
          role: 'user',
          content: 'Hi from responses',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gpt-4.1-mini', apiProtocol: 'responses' }
    )

    expect(result.content).toBe('Responses hello')
    expect(result.usage.prompt_tokens).toBe(7)
    expect(result.usage.completion_tokens).toBe(5)
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('should normalize responses tool schema to strict required fields', async () => {
    const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

    vi.mocked(toolExecutionService.getToolDefinitions).mockReturnValueOnce([
      {
        name: 'grep',
        description: 'Search content',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string' },
            path: { type: 'string' }
          },
          required: ['pattern'],
          additionalProperties: false
        }
      }
    ])

    mockResponsesCreate.mockResolvedValueOnce({
      id: 'resp_schema_1',
      output_text: 'ok',
      output: [],
      usage: { input_tokens: 1, output_tokens: 1 }
    })

    await adapter.sendMessage(
      [
        {
          role: 'user',
          content: 'Use grep',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gpt-4.1-mini', apiProtocol: 'responses' }
    )

    const firstRequest = vi.mocked(mockResponsesCreate).mock.calls[0]?.[0] as {
      tools?: Array<{ parameters?: { required?: string[] } }>
    }

    expect(firstRequest.tools?.[0]?.parameters?.required).toEqual(['pattern', 'path'])
  })

  it('should execute responses protocol in streamMessage', async () => {
    const responseStream = (async function* () {
      yield { type: 'response.output_text.delta', delta: 'Hello ' }
      yield { type: 'response.output_text.delta', delta: 'responses' }
      yield {
        type: 'response.completed',
        response: { id: 'resp_2', output: [] }
      }
    })()

    mockResponsesCreate.mockResolvedValueOnce(responseStream)

    const chunks = []
    for await (const chunk of adapter.streamMessage(
      [
        {
          role: 'user',
          content: 'Stream via responses',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gpt-4.1-mini', apiProtocol: 'responses' }
    )) {
      chunks.push(chunk)
    }

    expect(chunks.map(c => c.content).join('')).toContain('Hello responses')
    expect(chunks[chunks.length - 1].done).toBe(true)
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).not.toHaveBeenCalled()
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
      { model: 'gpt-4', apiProtocol: 'chat/completions' }
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

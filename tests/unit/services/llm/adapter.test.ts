import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      stream: vi.fn(),
      create: vi.fn()
    }
  }
}))

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@/main/services/ai-browser', () => ({
  allTools: [
    {
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn().mockResolvedValue({ success: true, data: 'test result' })
    }
  ]
}))

vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    getWebContents: vi.fn().mockReturnValue({})
  }
}))

vi.mock('@/main/services/tools/tool-execution.service', () => ({
  toolExecutionService: {
    registerBrowserTools: vi.fn(),
    executeToolCalls: vi.fn().mockResolvedValue({
      outputs: [
        {
          toolCall: { id: 'tool-1', name: 'test_tool', arguments: {} },
          result: { success: true, data: 'test result' },
          success: true,
          durationMs: 100
        }
      ],
      allSucceeded: true,
      totalDurationMs: 100
    })
  }
}))

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new AnthropicAdapter('test-api-key')
  })

  it('should initialize with API key', () => {
    expect(adapter).toBeDefined()
  })

  describe('streamMessage', () => {
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

      ;(adapter as any).client.messages.stream.mockReturnValue(mockStream)

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

      ;(adapter as any).client.messages.stream.mockReturnValue(mockStreamFail)

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

    it('should handle system messages', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } }
          yield { type: 'message_stop' }
        }
      }

      ;(adapter as any).client.messages.stream.mockReturnValue(mockStream)

      const messages: any[] = [
        {
          role: 'system',
          content: 'You are helpful',
          id: '0',
          sessionId: '1',
          createdAt: new Date()
        },
        { role: 'user', content: 'Hello', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      const chunks: string[] = []
      for await (const chunk of adapter.streamMessage(messages as any, {
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.5,
        topP: 0.9,
        stopSequences: ['END']
      })) {
        if (chunk.content) {
          chunks.push(chunk.content)
        }
      }

      expect(chunks).toContain('Response')
    })

    it('should handle tool use in streaming mode', async () => {
      const { toolExecutionService } = await import('@/main/services/tools/tool-execution.service')

      let streamCallCount = 0

      const mockStreamWithTool = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Let me help' }
          }
          yield { type: 'content_block_stop', index: 0 }
          yield {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id: 'tool-1', name: 'test_tool' }
          }
          yield {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: '{"key":' }
          }
          yield {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: '"value"}' }
          }
          yield { type: 'content_block_stop', index: 1 }
          yield { type: 'message_delta', delta: { stop_reason: 'tool_use' } }
          yield { type: 'message_stop' }
        }
      }

      const mockStreamFinal = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Done!' }
          }
          yield { type: 'content_block_stop', index: 0 }
          yield { type: 'message_delta', delta: { stop_reason: 'end_turn' } }
          yield { type: 'message_stop' }
        }
      }

      ;(adapter as any).client.messages.stream.mockImplementation(() => {
        streamCallCount++
        return streamCallCount === 1 ? mockStreamWithTool : mockStreamFinal
      })

      const messages: any[] = [
        { role: 'user', content: 'Use the tool', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      const chunks: string[] = []
      const doneFlags: boolean[] = []
      for await (const chunk of adapter.streamMessage(messages as any, {
        model: 'claude-3-5-sonnet-20241022'
      })) {
        if (chunk.content) {
          chunks.push(chunk.content)
        }
        if (chunk.done) {
          doneFlags.push(chunk.done)
        }
      }

      expect(streamCallCount).toBe(2)
      expect(chunks).toContain('Let me help')
      expect(chunks).toContain('Done!')
      expect(doneFlags).toContain(true)
      expect(toolExecutionService.registerBrowserTools).toHaveBeenCalled()
      expect(toolExecutionService.executeToolCalls).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'tool-1',
            name: 'test_tool',
            arguments: { key: 'value' }
          })
        ]),
        expect.anything()
      )
    })
  })

  describe('sendMessage', () => {
    it('should send message and return response', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn'
      }

      ;(adapter as any).client.messages.create.mockResolvedValue(mockResponse)

      const messages: any[] = [
        { role: 'user', content: 'Hi', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      const result = await adapter.sendMessage(messages as any, { model: 'claude' })

      expect(result.content).toBe('Hello from Claude!')
      expect(result.usage.prompt_tokens).toBe(10)
      expect(result.usage.completion_tokens).toBe(20)
    })

    it('should handle system prompt', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 5, output_tokens: 10 },
        stop_reason: 'end_turn'
      }

      ;(adapter as any).client.messages.create.mockResolvedValue(mockResponse)

      const messages: any[] = [
        { role: 'system', content: 'Be helpful', id: '0', sessionId: '1', createdAt: new Date() },
        { role: 'user', content: 'Hi', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      await adapter.sendMessage(messages as any, {
        model: 'claude',
        temperature: 0.7,
        topP: 0.95,
        stopSequences: ['STOP']
      })

      expect((adapter as any).client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'Be helpful',
          temperature: 0.7,
          top_p: 0.95,
          stop_sequences: ['STOP']
        }),
        expect.anything()
      )
    })

    it('should retry on failure', async () => {
      let callCount = 0
      ;(adapter as any).client.messages.create.mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          throw new Error('API Error')
        }
        return {
          content: [{ type: 'text', text: 'Success' }],
          usage: { input_tokens: 5, output_tokens: 5 },
          stop_reason: 'end_turn'
        }
      })

      const messages: any[] = [
        { role: 'user', content: 'Hi', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      const result = await adapter.sendMessage(messages as any, { model: 'claude' })

      expect(callCount).toBe(3)
      expect(result.content).toBe('Success')
    })

    it('should throw after max retries', async () => {
      ;(adapter as any).client.messages.create.mockRejectedValue(new Error('Persistent error'))

      const messages: any[] = [
        { role: 'user', content: 'Hi', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      await expect(adapter.sendMessage(messages as any, { model: 'claude' })).rejects.toThrow(
        'Persistent error'
      )
    })

    it('should handle tool use in response', async () => {
      const mockResponseWithTool = {
        content: [
          { type: 'text', text: 'Let me use the tool' },
          { type: 'tool_use', id: 'tool-1', name: 'test_tool', input: {} }
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'tool_use'
      }

      const mockFinalResponse = {
        content: [{ type: 'text', text: 'Done!' }],
        usage: { input_tokens: 15, output_tokens: 5 },
        stop_reason: 'end_turn'
      }

      let callCount = 0
      ;(adapter as any).client.messages.create.mockImplementation(() => {
        callCount++
        return callCount === 1 ? mockResponseWithTool : mockFinalResponse
      })

      const messages: any[] = [
        { role: 'user', content: 'Use the tool', id: '1', sessionId: '1', createdAt: new Date() }
      ]

      const result = await adapter.sendMessage(messages as any, { model: 'claude' })

      expect(callCount).toBe(2)
      expect(result.content).toContain('Let me use the tool')
      expect(result.content).toContain('Done!')
      expect(result.usage.prompt_tokens).toBe(25)
      expect(result.usage.completion_tokens).toBe(25)
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    anthropic: {
      create: vi.fn(),
      stream: vi.fn()
    },
    openai: {
      create: vi.fn()
    },
    gemini: {
      sendMessage: vi.fn(),
      sendMessageStream: vi.fn(),
      startChat: vi.fn(),
      getGenerativeModel: vi.fn()
    },
    costTracker: {
      trackUsage: vi.fn(),
      getDailyCost: vi.fn().mockReturnValue(0),
      checkBudget: vi.fn(),
      reset: vi.fn()
    },
    smartRouter: {
      selectModel: vi.fn(),
      getAvailableModels: vi.fn()
    }
  }
})

mocks.gemini.startChat.mockReturnValue({
  sendMessage: mocks.gemini.sendMessage,
  sendMessageStream: mocks.gemini.sendMessageStream
})

mocks.gemini.getGenerativeModel.mockReturnValue({
  startChat: mocks.gemini.startChat
})

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
  }
}))

vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    getWebContents: vi.fn()
  }
}))

vi.mock('@/main/services/ai-browser', () => ({
  allTools: []
}))

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mocks.anthropic.create,
        stream: mocks.anthropic.stream
      }
    }
  }
})

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mocks.openai.create
        }
      }
    }
  }
})

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      getGenerativeModel = mocks.gemini.getGenerativeModel
    }
  }
})

import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
import { GeminiAdapter } from '@/main/services/llm/gemini.adapter'
import type { Message } from '@/types/domain'

describe('LLM Providers Integration', () => {
  const mockMessages: Message[] = [
    {
      id: 'msg_1',
      sessionId: 'sess_1',
      role: 'user',
      content: 'Hello',
      createdAt: new Date()
    }
  ]
  const mockConfig = {
    maxTokens: 100,
    temperature: 0.7
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.gemini.startChat.mockReturnValue({
      sendMessage: mocks.gemini.sendMessage,
      sendMessageStream: mocks.gemini.sendMessageStream
    })
    mocks.gemini.getGenerativeModel.mockReturnValue({
      startChat: mocks.gemini.startChat
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Model Selection and API Call Flow', () => {
    it('should select Anthropic adapter and complete API call with response parsing', async () => {
      const adapter = new AnthropicAdapter('mock-api-key')

      mocks.anthropic.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Hello from Claude' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn'
      })

      const response = await adapter.sendMessage(mockMessages, mockConfig)

      expect(response.content).toBe('Hello from Claude')
      expect(response.usage.prompt_tokens).toBe(10)
      expect(response.usage.completion_tokens).toBe(5)
      expect(mocks.anthropic.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 100
        }),
        expect.any(Object)
      )
    })

    it('should select OpenAI adapter and complete API call with response parsing', async () => {
      const adapter = new OpenAIAdapter('mock-api-key')

      mocks.openai.create.mockResolvedValueOnce({
        choices: [{ message: { content: 'Hello from GPT' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 }
      })

      const response = await adapter.sendMessage(mockMessages, mockConfig)

      expect(response.content).toBe('Hello from GPT')
      expect(response.usage.prompt_tokens).toBe(8)
      expect(response.usage.completion_tokens).toBe(4)
      expect(mocks.openai.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        }),
        expect.any(Object)
      )
    })

    it('should select Gemini adapter and complete API call with response parsing', async () => {
      const adapter = new GeminiAdapter('mock-api-key')

      mocks.gemini.sendMessage.mockResolvedValueOnce({
        response: {
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 }
        }
      })

      const response = await adapter.sendMessage(mockMessages, mockConfig)

      expect(response.content).toBe('Hello from Gemini')
      expect(response.usage.prompt_tokens).toBe(5)
      expect(response.usage.completion_tokens).toBe(3)
    })
  })

  describe('Smart Router Integration', () => {
    it('should route to appropriate provider based on model name', async () => {
      const anthropicAdapter = new AnthropicAdapter('mock-key')
      const openaiAdapter = new OpenAIAdapter('mock-key')
      const geminiAdapter = new GeminiAdapter('mock-key')

      mocks.anthropic.create.mockResolvedValue({
        content: [{ type: 'text', text: 'Claude response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn'
      })

      mocks.openai.create.mockResolvedValue({
        choices: [{ message: { content: 'GPT response' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4 }
      })

      mocks.gemini.sendMessage.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 }
        }
      })

      const claudeResponse = await anthropicAdapter.sendMessage(mockMessages, mockConfig)
      const gptResponse = await openaiAdapter.sendMessage(mockMessages, mockConfig)
      const geminiResponse = await geminiAdapter.sendMessage(mockMessages, mockConfig)

      expect(claudeResponse.content).toBe('Claude response')
      expect(gptResponse.content).toBe('GPT response')
      expect(geminiResponse.content).toBe('Gemini response')
    })
  })

  describe('Cost Tracking Integration', () => {
    it('should track token usage after successful API calls', async () => {
      const adapter = new AnthropicAdapter('mock-api-key')

      mocks.anthropic.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn'
      })

      const response = await adapter.sendMessage(mockMessages, mockConfig)

      expect(response.usage.prompt_tokens).toBe(100)
      expect(response.usage.completion_tokens).toBe(50)
      expect(response.usage.prompt_tokens + response.usage.completion_tokens).toBe(150)
    })

    it('should accumulate costs across multiple API calls', async () => {
      const adapter = new AnthropicAdapter('mock-api-key')

      mocks.anthropic.create
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Response 1' }],
          usage: { input_tokens: 100, output_tokens: 50 },
          stop_reason: 'end_turn'
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Response 2' }],
          usage: { input_tokens: 200, output_tokens: 100 },
          stop_reason: 'end_turn'
        })

      const response1 = await adapter.sendMessage(mockMessages, mockConfig)
      const response2 = await adapter.sendMessage(mockMessages, mockConfig)

      const total1 = response1.usage.prompt_tokens + response1.usage.completion_tokens
      const total2 = response2.usage.prompt_tokens + response2.usage.completion_tokens
      expect(total1).toBe(150)
      expect(total2).toBe(300)
    })
  })

  describe('Error Handling and Retry Logic', () => {
    it('should retry on transient failures', async () => {
      const adapter = new AnthropicAdapter('mock-api-key')

      mocks.anthropic.create
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Success after retry' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn'
        })

      const response = await adapter.sendMessage(mockMessages, mockConfig)

      expect(response.content).toBe('Success after retry')
      expect(mocks.anthropic.create).toHaveBeenCalledTimes(2)
    })

    it('should propagate errors after max retries', async () => {
      const adapter = new AnthropicAdapter('mock-api-key')

      mocks.anthropic.create.mockRejectedValue(new Error('Persistent failure'))

      await expect(adapter.sendMessage(mockMessages, mockConfig)).rejects.toThrow(
        'Persistent failure'
      )
      expect(mocks.anthropic.create).toHaveBeenCalledTimes(3)
    })
  })

  describe('Streaming Integration', () => {
    it('should stream message chunks from Anthropic', async () => {
      const adapter = new AnthropicAdapter('mock-api-key')

      const mockStream = (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } }
        yield { type: 'message_stop' }
      })()

      mocks.anthropic.stream.mockReturnValue(mockStream)

      const chunks: string[] = []
      for await (const chunk of adapter.streamMessage(mockMessages, mockConfig)) {
        chunks.push(chunk.content)
      }

      expect(chunks.join('')).toBe('Hello world')
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should stream message chunks from OpenAI', async () => {
      const adapter = new OpenAIAdapter('mock-api-key')

      const mockStream = (async function* () {
        yield { choices: [{ delta: { content: 'Hello' } }] }
        yield { choices: [{ delta: { content: ' from' } }] }
        yield { choices: [{ delta: { content: ' GPT' } }] }
      })()

      mocks.openai.create.mockResolvedValue(mockStream)

      const chunks: string[] = []
      for await (const chunk of adapter.streamMessage(mockMessages, mockConfig)) {
        chunks.push(chunk.content)
      }

      expect(chunks.join('')).toBe('Hello from GPT')
      expect(mocks.openai.create).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
        expect.any(Object)
      )
    })
  })
})

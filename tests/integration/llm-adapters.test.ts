import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AnthropicAdapter } from '@/main/services/llm/anthropic.adapter'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
import { GeminiAdapter } from '@/main/services/llm/gemini.adapter'
import { OpenAICompatAdapter } from '@/main/services/llm/openai-compat.adapter'
import type { Message } from '@/types/domain'

// Define mocks using vi.hoisted to ensure availability in vi.mock factories
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
    }
  }
})

// Configure mock return values
mocks.gemini.startChat.mockReturnValue({
  sendMessage: mocks.gemini.sendMessage,
  sendMessageStream: mocks.gemini.sendMessageStream
})

mocks.gemini.getGenerativeModel.mockReturnValue({
  startChat: mocks.gemini.startChat
})

// Mock Logger
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock Electron (required for CostTracker)
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
  }
}))

// Mock BrowserViewManager (used in Anthropic tools)
vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    getWebContents: vi.fn()
  }
}))

// Mock AI Browser Tools
vi.mock('@/main/services/ai-browser', () => ({
  allTools: []
}))

// Mock Anthropic SDK
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

// Mock OpenAI SDK
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

// Mock Google Generative AI SDK
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      getGenerativeModel = mocks.gemini.getGenerativeModel
    }
  }
})

describe('LLM Adapters Integration', () => {
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
    // Re-apply return values that might be cleared
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

  describe('AnthropicAdapter', () => {
    let adapter: AnthropicAdapter

    beforeEach(() => {
      adapter = new AnthropicAdapter('mock-api-key')
    })

    it('should send message successfully (non-streaming)', async () => {
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

    it('should stream message successfully', async () => {
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

    it('should retry on failure', async () => {
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

    it('should handle rate limit errors', async () => {
      mocks.anthropic.create.mockRejectedValue(new Error('Rate limit exceeded'))

      await expect(adapter.sendMessage(mockMessages, mockConfig)).rejects.toThrow(
        'Rate limit exceeded'
      )
      // It should retry up to MAX_RETRIES (3)
      expect(mocks.anthropic.create).toHaveBeenCalledTimes(3)
    })
  })

  describe('OpenAIAdapter', () => {
    let adapter: OpenAIAdapter

    beforeEach(() => {
      adapter = new OpenAIAdapter('mock-api-key')
    })

    it('should send message successfully (non-streaming)', async () => {
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

    it('should stream message successfully', async () => {
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
        expect.objectContaining({
          stream: true
        }),
        expect.any(Object)
      )
    })

    it('should handle API errors', async () => {
      mocks.openai.create.mockRejectedValue(new Error('API Error'))
      await expect(adapter.sendMessage(mockMessages, mockConfig)).rejects.toThrow('API Error')
    })
  })

  describe('GeminiAdapter', () => {
    let adapter: GeminiAdapter

    beforeEach(() => {
      adapter = new GeminiAdapter('mock-api-key')
    })

    it('should send message successfully (non-streaming)', async () => {
      mocks.gemini.sendMessage.mockResolvedValueOnce({
        response: {
          text: () => 'Hello from Gemini',
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 }
        }
      })

      const response = await adapter.sendMessage(mockMessages, mockConfig)

      expect(response.content).toBe('Hello from Gemini')
      expect(response.usage.prompt_tokens).toBe(5)
      expect(response.usage.completion_tokens).toBe(3)
    })

    it('should stream message successfully', async () => {
      const mockStream = {
        stream: (async function* () {
          yield { text: () => 'Hello' }
          yield { text: () => ' Gemini' }
        })()
      }

      mocks.gemini.sendMessageStream.mockResolvedValueOnce(mockStream)

      const chunks: string[] = []
      for await (const chunk of adapter.streamMessage(mockMessages, mockConfig)) {
        chunks.push(chunk.content)
      }

      expect(chunks.join('')).toBe('Hello Gemini')
    })

    it('should handle timeout/errors', async () => {
      mocks.gemini.sendMessage.mockRejectedValue(new Error('Timeout'))
      await expect(adapter.sendMessage(mockMessages, mockConfig)).rejects.toThrow('Timeout')
    })
  })

  describe('OpenAICompatAdapter', () => {
    it('should initialize with custom baseURL', () => {
      const adapter = new OpenAICompatAdapter('key', 'https://custom.api/v1')
      expect(adapter).toBeInstanceOf(OpenAIAdapter)
    })

    it('should throw if baseURL missing', () => {
      expect(() => new OpenAICompatAdapter('key', '')).toThrow('baseURL is required')
    })

    it('should use custom baseURL for requests', async () => {
      const adapter = new OpenAICompatAdapter('key', 'https://local-llm:1234/v1')
      mocks.openai.create.mockResolvedValueOnce({
        choices: [{ message: { content: 'Local Response' } }],
        usage: { prompt_tokens: 2, completion_tokens: 2 }
      })

      const response = await adapter.sendMessage(mockMessages, mockConfig)
      expect(response.content).toBe('Local Response')
    })
  })
})

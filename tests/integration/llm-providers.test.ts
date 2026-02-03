import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    openai: {
      create: vi.fn()
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

import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Model Selection and API Call Flow', () => {
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
  })

  describe('Streaming Integration', () => {
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

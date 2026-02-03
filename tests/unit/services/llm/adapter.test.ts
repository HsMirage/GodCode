import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIAdapter } from '@/main/services/llm/openai.adapter'

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn()
      }
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

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new OpenAIAdapter('test-api-key')
  })

  it('should initialize with API key', () => {
    expect(adapter).toBeDefined()
  })
})

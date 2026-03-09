import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import { OpenAICompatAdapter } from '@/main/services/llm/openai-compat.adapter'

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

describe('OpenAICompatAdapter', () => {
  let adapter: OpenAICompatAdapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCreate: any

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new OpenAICompatAdapter('test-key', 'https://compat.example.com/v1')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = (OpenAI as any).mock.results.at(-1)?.value
    mockCreate = mockClient.chat.completions.create
  })

  it('defaults to chat/completions when apiProtocol is missing', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello from compat' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 2 }
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
      { model: 'gpt-4o-mini' }
    )

    expect(result.content).toBe('Hello from compat')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

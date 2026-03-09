import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiAdapter } from '@/main/services/llm/gemini.adapter'

vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    getWebContents: vi.fn().mockReturnValue(null)
  }
}))

vi.mock('@/main/services/tools/tool-execution.service', () => ({
  toolExecutionService: {
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
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    adapter = new GeminiAdapter('test-key')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('caps sendMessage retry attempts at three retries', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const pending = adapter
      .sendMessage(
        [
          {
            role: 'user',
            content: 'Hello',
            id: '1',
            sessionId: 's1',
            createdAt: new Date(),
            metadata: {}
          }
        ],
        { model: 'gemini-1.5-flash', maxRetries: 10 }
      )
      .catch(error => error)

    await vi.runAllTimersAsync()

    const error = await pending

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Network error')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('caps streamMessage retry attempts at three retries', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))

    const stream = adapter.streamMessage(
      [
        {
          role: 'user',
          content: 'Hello',
          id: '1',
          sessionId: 's1',
          createdAt: new Date(),
          metadata: {}
        }
      ],
      { model: 'gemini-1.5-flash', maxRetries: 10 }
    )

    const nextChunk = stream.next().catch(error => error)

    await vi.runAllTimersAsync()

    const error = await nextChunk

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Network error')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('keeps long-running requests alive until the five-minute default timeout', async () => {
    let requestSignal: AbortSignal | undefined

    fetchMock.mockImplementation((_, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined

      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new Error('AbortError')), {
          once: true
        })
      })
    })

    const pending = adapter
      .sendMessage(
        [
          {
            role: 'user',
            content: 'Hello',
            id: '1',
            sessionId: 's1',
            createdAt: new Date(),
            metadata: {}
          }
        ],
        { model: 'gemini-1.5-flash', maxRetries: 0 }
      )
      .catch(error => error)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(requestSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(239_999)
    expect(requestSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)

    const error = await pending

    expect(requestSignal?.aborted).toBe(true)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('AbortError')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

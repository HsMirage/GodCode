import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => {
  let recoveredHandler: ((payload: unknown) => void) | null = null

  return {
    list: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    onStreamChunk: vi.fn(() => () => {}),
    onStreamError: vi.fn(() => () => {}),
    onRecovered: vi.fn((callback: (payload: unknown) => void) => {
      recoveredHandler = callback
      return () => {
        recoveredHandler = null
      }
    }),
    emitRecovered: (payload: unknown) => {
      recoveredHandler?.(payload)
    }
  }
})

vi.mock('../../../src/renderer/src/api', () => ({
  messageApi: {
    list: (...args: any[]) => mocks.list(...args),
    send: (...args: any[]) => mocks.send(...args),
    abort: (...args: any[]) => mocks.abort(...args),
    onStreamChunk: (...args: any[]) => mocks.onStreamChunk(...args),
    onStreamError: (...args: any[]) => mocks.onStreamError(...args)
  },
  sessionApi: {
    onRecovered: (...args: any[]) => mocks.onRecovered(...args)
  }
}))

import { useChatMessages } from '../../../src/renderer/src/hooks/useChatMessages'
import { useSessionStore } from '../../../src/renderer/src/store/session.store'
import { useStreamingStore } from '../../../src/renderer/src/store/streaming.store'

describe('useChatMessages recovery sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({ currentSession: null, messagesBySessionId: {} })
    useStreamingStore.setState({ sessions: new Map() })
    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke: vi.fn(),
        on: vi.fn(() => () => {})
      }
    })
  })

  it('rebuilds current session messages from recovery payload', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        id: 'message-1',
        role: 'user',
        content: 'Initial question',
        createdAt: '2026-03-06T00:00:00.000Z'
      }
    ])

    const { result } = renderHook(() =>
      useChatMessages({
        sessionId: 'session-1',
        spaceId: 'space-1',
        bumpSessionActivity: vi.fn()
      })
    )

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })

    act(() => {
      mocks.emitRecovered({
        sessionId: 'session-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Initial question',
            createdAt: '2026-03-06T00:00:00.000Z'
          },
          {
            id: 'message-2',
            role: 'assistant',
            content: 'Recovered answer',
            createdAt: '2026-03-06T00:01:00.000Z'
          }
        ]
      })
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
      expect(result.current.messages[1]?.content).toBe('Recovered answer')
    })
  })
})

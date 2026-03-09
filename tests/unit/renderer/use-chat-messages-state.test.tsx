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
    })
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

describe('useChatMessages state consistency', () => {
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

  it('replaces optimistic state with canonical session-store messages after send', async () => {
    mocks.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'message-1',
          role: 'user',
          content: 'Hello',
          createdAt: '2026-03-06T00:00:00.000Z'
        },
        {
          id: 'message-2',
          role: 'assistant',
          content: 'Hi there',
          createdAt: '2026-03-06T00:00:05.000Z'
        }
      ])
    mocks.send.mockResolvedValueOnce({ success: true })

    const { result } = renderHook(() =>
      useChatMessages({
        sessionId: 'session-1',
        spaceId: 'space-1',
        bumpSessionActivity: vi.fn()
      })
    )

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(0)
    })

    await act(async () => {
      await result.current.handleSend({ content: 'Hello' }, 'default')
    })

    await waitFor(() => {
      expect(result.current.messages.map(message => message.content)).toEqual(['Hello', 'Hi there'])
    })

    expect(useSessionStore.getState().messagesBySessionId['session-1']?.map(message => message.id)).toEqual([
      'message-1',
      'message-2'
    ])
    expect(useStreamingStore.getState().sessions.size).toBe(0)
  })

  it('shows only the active session messages when switching quickly between sessions', async () => {
    mocks.list
      .mockResolvedValueOnce([
        {
          id: 'session-1-message',
          role: 'user',
          content: 'From session one',
          createdAt: '2026-03-06T00:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'session-2-message',
          role: 'user',
          content: 'From session two',
          createdAt: '2026-03-06T00:01:00.000Z'
        }
      ])

    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string | null }) =>
        useChatMessages({
          sessionId,
          spaceId: 'space-1',
          bumpSessionActivity: vi.fn()
        }),
      {
        initialProps: { sessionId: 'session-1' }
      }
    )

    await waitFor(() => {
      expect(result.current.messages.map(message => message.content)).toEqual(['From session one'])
    })

    act(() => {
      useStreamingStore.getState().startStreaming('session-1')
      useStreamingStore.getState().appendContent('session-1', 'partial reply')
    })

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.isStreaming).toBe(true)
    })

    rerender({ sessionId: 'session-2' })

    await waitFor(() => {
      expect(result.current.messages.map(message => message.content)).toEqual(['From session two'])
      expect(result.current.messages.some(message => message.isStreaming)).toBe(false)
    })

    expect(Array.from(useStreamingStore.getState().sessions.keys())).toEqual([])
  })
})

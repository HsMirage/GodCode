import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useStreamingEvents } from '../../../src/renderer/src/hooks/useStreamingEvents'
import { useStreamingStore } from '../../../src/renderer/src/store/streaming.store'

describe('useStreamingEvents session cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStreamingStore.setState({ sessions: new Map() })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        on: vi.fn(() => () => {})
      }
    })
  })

  it('removes stale streaming state when the active session changes', async () => {
    act(() => {
      useStreamingStore.setState({
        sessions: new Map([
          [
            'session-1',
            {
              isStreaming: true,
              content: 'current',
              eventType: 'content',
              toolCalls: [],
              error: null,
              usage: null
            }
          ],
          [
            'session-2',
            {
              isStreaming: true,
              content: 'stale',
              eventType: 'content',
              toolCalls: [],
              error: null,
              usage: null
            }
          ]
        ])
      })
    })

    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string | null }) => useStreamingEvents(sessionId),
      { initialProps: { sessionId: 'session-1' } }
    )

    await waitFor(() => {
      const sessions = useStreamingStore.getState().sessions
      expect(Array.from(sessions.keys())).toEqual(['session-1'])
      expect(sessions.get('session-1')?.content).toBe('current')
    })

    act(() => {
      useStreamingStore.getState().startStreaming('session-2')
      useStreamingStore.getState().appendContent('session-2', 'next-session')
    })

    rerender({ sessionId: 'session-2' })

    await waitFor(() => {
      const sessions = useStreamingStore.getState().sessions
      expect(Array.from(sessions.keys())).toEqual(['session-2'])
      expect(sessions.get('session-2')?.content).toBe('next-session')
    })
  })
})

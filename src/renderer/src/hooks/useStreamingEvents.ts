import { useEffect, useCallback } from 'react'
import { useStreamingStore } from '../store/streaming.store'

/**
 * Stream chunk event payload from IPC
 */
export interface StreamChunkEvent {
  sessionId: string
  content: string
  done: boolean
  type?: 'content' | 'tool_start' | 'tool_end' | 'error' | 'done'
  toolCall?: {
    id: string
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
    permissionPreview?: {
      requestedName: string
      resolvedName: string
      template: 'safe' | 'balanced' | 'full'
      permission: 'auto' | 'confirm' | 'deny'
      source: 'default' | 'template' | 'custom' | 'fallback'
      dangerous: boolean
      highRisk: boolean
      highRiskEnforced: boolean
      requiresConfirmation: boolean
      allowedByPolicy: boolean
      allowedWithoutConfirmation: boolean
      reason?: string
      confirmReason?: string
    }
  }
  error?: {
    message: string
    code?: string
  }
}

/**
 * Stream error event payload from IPC
 */
export interface StreamErrorEvent {
  sessionId: string
  message: string
  code?: string
}

/**
 * Stream usage event payload from IPC
 */
export interface StreamUsageEvent {
  sessionId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * Hook to subscribe to streaming events for a specific session
 */
export function useStreamingEvents(sessionId: string | null) {
  const {
    retainCurrentSession,
    startStreaming,
    appendContent,
    toolStart,
    toolEnd,
    setError,
    completeStreaming,
    setUsage,
    resetStreaming,
    sessions
  } = useStreamingStore()

  const streamState = sessionId ? sessions.get(sessionId) : undefined

  useEffect(() => {
    retainCurrentSession(sessionId)
  }, [sessionId, retainCurrentSession])

  // Handle stream chunk events
  const handleStreamChunk = useCallback(
    (event: StreamChunkEvent) => {
      if (!sessionId || event.sessionId !== sessionId) return

      const eventType = event.type || (event.done ? 'done' : 'content')

      switch (eventType) {
        case 'content':
          if (event.content) {
            appendContent(sessionId, event.content)
          }
          break

        case 'tool_start':
          if (event.toolCall) {
            toolStart(sessionId, {
              id: event.toolCall.id,
              name: event.toolCall.name
            })
          }
          break

        case 'tool_end':
          if (event.toolCall) {
            toolEnd(sessionId, {
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
              result: event.toolCall.result,
              permissionPreview: event.toolCall.permissionPreview
            })
          }
          break

        case 'error':
          if (event.error) {
            setError(sessionId, event.error)
          }
          break

        case 'done':
          completeStreaming(sessionId)
          break
      }
    },
    [sessionId, appendContent, toolStart, toolEnd, setError, completeStreaming]
  )

  // Handle stream error events
  const handleStreamError = useCallback(
    (event: StreamErrorEvent) => {
      if (!sessionId || event.sessionId !== sessionId) return
      if (event.code === 'API_RETRYING') return
      setError(sessionId, { message: event.message, code: event.code })
    },
    [sessionId, setError]
  )

  // Handle stream usage events
  const handleStreamUsage = useCallback(
    (event: StreamUsageEvent) => {
      if (!sessionId || event.sessionId !== sessionId) return
      setUsage(sessionId, {
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens
      })
    },
    [sessionId, setUsage]
  )

  // Subscribe to IPC events
  useEffect(() => {
    if (!sessionId || !window.godcode) return

    const removeChunkListener = window.godcode.on('message:stream-chunk', handleStreamChunk)
    const removeErrorListener = window.godcode.on('message:stream-error', handleStreamError)
    const removeUsageListener = window.godcode.on('message:stream-usage', handleStreamUsage)

    return () => {
      removeChunkListener()
      removeErrorListener()
      removeUsageListener()
    }
  }, [sessionId, handleStreamChunk, handleStreamError, handleStreamUsage])

  // Start streaming helper
  const start = useCallback(() => {
    if (sessionId) {
      startStreaming(sessionId)
    }
  }, [sessionId, startStreaming])

  // Reset streaming helper
  const reset = useCallback(() => {
    if (sessionId) {
      resetStreaming(sessionId)
    }
  }, [sessionId, resetStreaming])

  return {
    streamState,
    isStreaming: streamState?.isStreaming ?? false,
    content: streamState?.content ?? '',
    toolCalls: streamState?.toolCalls ?? [],
    error: streamState?.error ?? null,
    usage: streamState?.usage ?? null,
    start,
    reset
  }
}

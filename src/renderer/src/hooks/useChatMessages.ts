import { useCallback, useDebugValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Message } from '../components/chat/MessageCard'
import type { MessageInputSendPayload } from '../components/chat/MessageInput'
import { messageApi, sessionApi } from '../api'
import { useSessionStore } from '../store/session.store'
import { AGENT_DEFINITIONS, type AgentRoutingStrategy } from '@shared/agent-definitions'
import { useStreamingEvents } from './useStreamingEvents'

interface UseChatMessagesOptions {
  sessionId: string | null
  spaceId: string | null
  bumpSessionActivity: (spaceId: string, sessionId: string) => void
  onWorkforceDetected?: () => void
}

interface PersistedMessagePayload {
  id: string
  role: string
  content: string
  metadata?: unknown
  createdAt?: string
}

const EMPTY_MESSAGES: Message[] = []

function normalizeMessages(input: PersistedMessagePayload[]): Message[] {
  return input
    .filter(message => message.role !== 'system')
    .map(message => ({
      id: message.id,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      metadata:
        message.metadata && typeof message.metadata === 'object'
          ? (message.metadata as Record<string, unknown>)
          : undefined,
      createdAt: message.createdAt || new Date().toISOString()
    }))
}

function buildStreamingMessage(input: {
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  toolCalls: Message['toolCalls']
  error: Message['error'] | null
}): Message | null {
  const { isLoading, isStreaming, streamingContent, toolCalls, error } = input
  const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0
  const shouldDisplay = isStreaming || (!!streamingContent && isLoading) || hasToolCalls || !!error

  if (!shouldDisplay) {
    return null
  }

  return {
    id: 'streaming',
    role: 'assistant',
    content: streamingContent,
    createdAt: new Date().toISOString(),
    isStreaming: isStreaming || (!!streamingContent && isLoading),
    toolCalls,
    error: error ?? undefined
  }
}

function isConsistentPersistentMessage(message: Message): boolean {
  const hasToolCalls = Array.isArray(message.toolCalls) && message.toolCalls.length > 0
  return !message.isStreaming && !hasToolCalls && !message.error
}

export function useChatMessages(options: UseChatMessagesOptions) {
  const { sessionId, spaceId, bumpSessionActivity, onWorkforceDetected } = options
  const setMessages = useSessionStore(state => state.setMessages)
  const addMessage = useSessionStore(state => state.addMessage)
  const persistedMessages = useSessionStore(state =>
    sessionId ? state.messagesBySessionId[sessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  )
  const {
    isStreaming,
    content: streamingContent,
    toolCalls,
    error: streamError,
    start,
    reset
  } = useStreamingEvents(sessionId)

  const [isLoading, setIsLoading] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)

  const fetchMessages = useCallback(async (targetSessionId: string) => {
    const existingMessages = await messageApi.list(targetSessionId)
    return Array.isArray(existingMessages) ? normalizeMessages(existingMessages) : []
  }, [])

  const reloadMessages = useCallback(
    async (targetSessionId: string) => {
      const nextMessages = await fetchMessages(targetSessionId)
      setMessages(targetSessionId, nextMessages)
      return nextMessages
    },
    [fetchMessages, setMessages]
  )

  useEffect(() => {
    activeSessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    if (!window.codeall) return

    setIsLoading(false)
    setSendError(null)
    setRetryNotice(null)

    if (!sessionId) {
      return
    }

    void reloadMessages(sessionId).catch(error => {
      console.error('Failed to load messages:', error)
    })
  }, [reloadMessages, sessionId])

  useEffect(() => {
    if (!window.codeall) return

    const removeRecovered = sessionApi.onRecovered(payload => {
      const { sessionId: recoveredSessionId, messages: recoveredMessages } = payload as {
        sessionId?: string
        messages?: PersistedMessagePayload[]
      }

      if (!recoveredSessionId || recoveredSessionId !== activeSessionIdRef.current) {
        return
      }

      reset()
      setIsLoading(false)
      setSendError(null)
      setRetryNotice(null)

      if (Array.isArray(recoveredMessages)) {
        setMessages(recoveredSessionId, normalizeMessages(recoveredMessages))
        return
      }

      void reloadMessages(recoveredSessionId).catch(error => {
        console.error('Failed to reload recovered messages:', error)
      })
    })

    return removeRecovered
  }, [reloadMessages, reset, setMessages])

  useEffect(() => {
    if (!window.codeall) return

    const removeError = messageApi.onStreamError(payload => {
      const { sessionId: errSessionId, message, code } = payload as {
        sessionId?: string
        message: string
        code?: string
      }

      if (errSessionId && errSessionId !== activeSessionIdRef.current) {
        return
      }

      if (code === 'API_RETRYING') {
        setRetryNotice(message)
        return
      }

      setRetryNotice(null)
      setSendError(message)
      setIsLoading(false)
    })

    return removeError
  }, [])

  const getAgentStrategy = (agentCode?: string): AgentRoutingStrategy | undefined => {
    if (!agentCode || agentCode === 'default') return undefined
    const agent = AGENT_DEFINITIONS.find(a => a.code === agentCode)
    return agent?.defaultStrategy
  }

  const handleSend = useCallback(
    async (payload: MessageInputSendPayload, agentCode?: string) => {
      const { content, skillCommand } = payload
      if (!sessionId || !spaceId || !window.codeall) return false

      const targetSessionId = sessionId
      const userMessage: Message = {
        id: `optimistic-user-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      }

      addMessage(targetSessionId, userMessage)
      setIsLoading(true)
      setSendError(null)
      setRetryNotice(null)
      start()
      bumpSessionActivity(spaceId, targetSessionId)

      const strategy = getAgentStrategy(agentCode)
      if (strategy === 'workforce') {
        onWorkforceDetected?.()
      }

      try {
        await messageApi.send({
          sessionId: targetSessionId,
          content,
          agentCode,
          skillCommand
        })

        const nextMessages = await fetchMessages(targetSessionId)

        if (activeSessionIdRef.current === targetSessionId) {
          setRetryNotice(null)
          setIsLoading(false)
          reset()
        }

        setMessages(targetSessionId, nextMessages)
        return true
      } catch (error) {
        console.error('Failed to send message:', error)

        try {
          const nextMessages = await fetchMessages(targetSessionId)

          if (activeSessionIdRef.current === targetSessionId) {
            setIsLoading(false)
            setRetryNotice(null)
            setSendError(error instanceof Error ? error.message : String(error))
            reset()
          }

          setMessages(targetSessionId, nextMessages)
        } catch {
          if (activeSessionIdRef.current === targetSessionId) {
            setIsLoading(false)
            setRetryNotice(null)
            setSendError(error instanceof Error ? error.message : String(error))
            reset()
          }
        }

        return true
      }
    },
    [
      sessionId,
      spaceId,
      addMessage,
      bumpSessionActivity,
      fetchMessages,
      onWorkforceDetected,
      reset,
      setMessages,
      start
    ]
  )

  const handleStop = useCallback(async () => {
    if (!sessionId || !window.codeall) return

    const targetSessionId = sessionId

    try {
      await messageApi.abort({ sessionId: targetSessionId })
      const nextMessages = await fetchMessages(targetSessionId)

      if (activeSessionIdRef.current === targetSessionId) {
        setIsLoading(false)
        setRetryNotice(null)
        reset()
      }

      setMessages(targetSessionId, nextMessages)
    } catch (error) {
      console.error('Failed to stop active session:', error)

      if (activeSessionIdRef.current === targetSessionId) {
        setIsLoading(false)
      }
    }
  }, [fetchMessages, reset, sessionId, setMessages])

  const streamingMessage = useMemo(
    () =>
      buildStreamingMessage({
        isLoading,
        isStreaming,
        streamingContent,
        toolCalls,
        error: streamError
      }),
    [isLoading, isStreaming, streamError, streamingContent, toolCalls]
  )

  const displayMessages = useMemo(() => {
    if (!streamingMessage) {
      return persistedMessages
    }

    return [...persistedMessages, streamingMessage]
  }, [persistedMessages, streamingMessage])

  const persistentMessagesConsistent = useMemo(
    () => persistedMessages.every(isConsistentPersistentMessage),
    [persistedMessages]
  )

  useDebugValue(
    {
      sessionId,
      persistedCount: persistedMessages.length,
      displayCount: displayMessages.length,
      isStreaming,
      hasStreamingContent: streamingContent.length > 0,
      persistentMessagesConsistent
    },
    value =>
      `session=${value.sessionId ?? 'none'} persisted=${value.persistedCount} display=${value.displayCount} streaming=${value.isStreaming ? 'yes' : 'no'} content=${value.hasStreamingContent ? 'yes' : 'no'} consistent=${value.persistentMessagesConsistent ? 'yes' : 'no'}`
  )

  return {
    messages: displayMessages,
    isLoading,
    sendError,
    retryNotice,
    streamingContent,
    handleSend,
    handleStop
  }
}

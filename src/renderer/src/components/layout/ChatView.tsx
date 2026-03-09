import { useEffect, useState, useRef, useCallback } from 'react'
import { Message } from '../chat/MessageCard'
import { MessageList } from '../chat/MessageList'
import { MessageInput, type MessageInputSendPayload } from '../chat/MessageInput'
import { TypingIndicator } from '../chat/TypingIndicator'
import { SessionResumeIndicator } from '../session/SessionResumeIndicator'
import { useStreamingEvents } from '../../hooks/useStreamingEvents'

export function ChatView() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const messageScrollRef = useRef<HTMLDivElement>(null)

  // Use the streaming events hook
  const {
    isStreaming,
    content: streamingContent,
    toolCalls,
    error,
    start,
    reset
  } = useStreamingEvents(sessionId)

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.godcode) {
      console.warn('[ChatView] window.godcode not available, chat will be disabled')
      return
    }

    const initializeSession = async () => {
      try {
        const session = await window.godcode.invoke('session:get-or-create-default')
        if (!session || typeof session !== 'object' || !('id' in session)) {
          // Session not available (e.g., in E2E test environment without database)
          console.warn('No session available, chat will be disabled')
          return
        }
        setSessionId((session as { id: string }).id)

        const existingMessages = await window.godcode.invoke(
          'message:list',
          (session as { id: string }).id
        )
        if (!Array.isArray(existingMessages)) {
          console.warn('No messages available')
          return
        }
        setMessages(
          existingMessages
            .filter((msg: any) => msg.role !== 'system')
            .map((msg: any) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              metadata:
                msg.metadata && typeof msg.metadata === 'object'
                  ? (msg.metadata as Record<string, unknown>)
                  : undefined,
              createdAt: msg.createdAt || new Date().toISOString()
            }))
        )
      } catch (error) {
        console.error('Failed to initialize session:', error)
      }
    }

    initializeSession()
  }, [])

  // Handle streaming completion - add final message to list
  const prevIsStreamingRef = useRef(false)
  useEffect(() => {
    // Detect transition from streaming to not streaming
    if (prevIsStreamingRef.current && !isStreaming && streamingContent) {
      // Streaming just completed, add the message
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: streamingContent,
          createdAt: new Date().toISOString(),
          error: error || undefined
        }
      ])
      reset()
      setIsLoading(false)
    }
    prevIsStreamingRef.current = isStreaming
  }, [isStreaming, streamingContent, error, reset])

  // Handle error during streaming
  useEffect(() => {
    if (error && !isStreaming) {
      setIsLoading(false)
    }
  }, [error, isStreaming])

  const handleSend = useCallback(
    async (payload: MessageInputSendPayload, agentCode?: string) => {
      const { content, skillCommand } = payload
      if (!sessionId || !window.godcode) return false

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      }
      setMessages(prev => [...prev, userMessage])
      setIsLoading(true)

      // Start streaming state
      start()

      try {
        await window.godcode.invoke('message:send', {
          sessionId,
          content,
          agentCode,
          skillCommand
        })
        return true
      } catch (error) {
        console.error('Failed to send message:', error)
        setIsLoading(false)
        return true
      }
    },
    [sessionId, start]
  )

  // Build display messages including streaming message
  const displayMessages = [...messages]
  if (isStreaming || (streamingContent && isLoading)) {
    displayMessages.push({
      id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      createdAt: new Date().toISOString(),
      isStreaming: true,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      error: error || undefined
    })
  }

  return (
    <div className="h-full flex flex-col ui-bg-app">
      <div
        ref={messageScrollRef}
        className="flex-1 min-h-0 overflow-y-auto scroll-smooth p-4 scrollbar-overlay"
      >
        {sessionId && (
          <div className="mb-2">
            <SessionResumeIndicator sessionId={sessionId} />
          </div>
        )}
        <MessageList
          messages={displayMessages}
          scrollContainerRef={messageScrollRef}
          scrollKey={sessionId ?? undefined}
        />

        {isLoading && !streamingContent && !isStreaming && (
          <div className="flex justify-center">
            <TypingIndicator />
          </div>
        )}
      </div>

      <div className="p-4 border-t ui-border ui-bg-panel">
        <div className="max-w-3xl mx-auto relative">
          <MessageInput isLoading={isLoading} onSend={handleSend} placeholder="Type a message..." />
          <div className="text-xs text-center text-[var(--text-muted)] mt-2">
            GodCode can make mistakes. Please verify generated code.
          </div>
        </div>
      </div>
    </div>
  )
}

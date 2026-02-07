import { useEffect, useState, useRef } from 'react'
import { Message } from '../chat/MessageCard'
import { MessageList } from '../chat/MessageList'
import { MessageInput } from '../chat/MessageInput'
import { TypingIndicator } from '../chat/TypingIndicator'
import { SessionResumeIndicator } from '../session/SessionResumeIndicator'

export function ChatView() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const streamingContentRef = useRef('')
  const [streamingContent, setStreamingContent] = useState('')
  const messageScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[ChatView] window.codeall not available, chat will be disabled')
      return
    }

    const initializeSession = async () => {
      try {
        const session = await window.codeall.invoke('session:get-or-create-default')
        if (!session || typeof session !== 'object' || !('id' in session)) {
          // Session not available (e.g., in E2E test environment without database)
          console.warn('No session available, chat will be disabled')
          return
        }
        setSessionId((session as { id: string }).id)

        const existingMessages = await window.codeall.invoke(
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
              createdAt: msg.createdAt || new Date().toISOString()
            }))
        )
      } catch (error) {
        console.error('Failed to initialize session:', error)
      }
    }

    initializeSession()
  }, [])

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      return
    }

    const removeListener = window.codeall.on(
      'message:stream-chunk',
      ({ content, done }: { content: string; done: boolean }) => {
        if (done) {
          const finalContent = streamingContentRef.current + content
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: finalContent,
              createdAt: new Date().toISOString()
            }
          ])
          streamingContentRef.current = ''
          setStreamingContent('')
          setIsLoading(false)
        } else {
          streamingContentRef.current += content
          setStreamingContent(streamingContentRef.current)
        }
      }
    )

    return () => {
      removeListener()
    }
  }, [])

  const handleSend = async (content: string) => {
    if (!sessionId || !window.codeall) return false

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    streamingContentRef.current = ''
    setStreamingContent('')

    try {
      await window.codeall.invoke('message:send', {
        sessionId,
        content
      })
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsLoading(false)
      return true
    }
  }

  const displayMessages = [...messages]
  if (streamingContent) {
    displayMessages.push({
      id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      createdAt: new Date().toISOString(),
      isStreaming: true
    })
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
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

        {isLoading && !streamingContent && (
          <div className="flex justify-center">
            <TypingIndicator />
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="max-w-3xl mx-auto relative">
          <MessageInput isLoading={isLoading} onSend={handleSend} placeholder="Type a message..." />
          <div className="text-xs text-center text-slate-500 mt-2">
            CodeAll can make mistakes. Please verify generated code.
          </div>
        </div>
      </div>
    </div>
  )
}

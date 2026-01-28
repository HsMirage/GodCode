import { useEffect, useState } from 'react'
import { MessageList, type ChatMessage } from '../components/chat/MessageList'
import { MessageInput } from '../components/chat/MessageInput'
import { TypingIndicator } from '../components/chat/TypingIndicator'

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const session = await window.codeall.invoke('session:get-or-create-default')
        setSessionId(session.id)

        const existingMessages = await window.codeall.invoke('message:list', session.id)
        setMessages(
          existingMessages
            .filter((msg) => msg.role !== 'system')
            .map((msg) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content
            }))
        )
      } catch (error) {
        console.error('Failed to initialize session:', error)
      }
    }

    initializeSession()
  }, [])

  useEffect(() => {
    const removeListener = window.codeall.on('message:stream-chunk', ({ content, done }) => {
      if (done) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: streamingContent + content
          }
        ])
        setStreamingContent('')
        setIsLoading(false)
      } else {
        setStreamingContent((prev) => prev + content)
      }
    })

    return () => {
      removeListener()
    }
  }, [streamingContent])

  const handleSend = async (content: string) => {
    if (!sessionId) return

    const userMessage: ChatMessage = {
      role: 'user',
      content
    }
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    try {
      await window.codeall.invoke('message:send', {
        sessionId,
        content
      })
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsLoading(false)
    }
  }

  const displayMessages = [...messages]
  if (streamingContent) {
    displayMessages.push({
      role: 'assistant',
      content: streamingContent
    })
  }

  return (
    <div className="flex h-full flex-col gap-4 px-6 py-4">
      <header>
        <h1 className="text-xl font-semibold">对话</h1>
        <p className="mt-1 text-sm text-slate-400">与AI助手进行交互</p>
      </header>

      <div className="flex-1 overflow-hidden">
        <MessageList messages={displayMessages} />
      </div>

      {isLoading && (
        <div className="flex justify-center">
          <TypingIndicator />
        </div>
      )}

      <MessageInput
        isLoading={isLoading}
        onSend={handleSend}
        placeholder="输入消息... (Enter发送, Shift+Enter换行)"
      />
    </div>
  )
}

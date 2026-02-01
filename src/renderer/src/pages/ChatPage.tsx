import { useEffect, useState } from 'react'
import { MessageList } from '../components/chat/MessageList'
import { MessageInput } from '../components/chat/MessageInput'
import { TypingIndicator } from '../components/chat/TypingIndicator'
import { WorkflowView } from '../components/workflow/WorkflowView'
import { ContentCanvas } from '../components/layout/ContentCanvas'
import { ArtifactRail } from '../components/layout/ArtifactRail'
import { useCanvasLifecycle } from '../hooks/useCanvasLifecycle'
import { Message } from '../components/chat/MessageCard'

type ViewMode = 'chat' | 'workflow'

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const [showArtifacts, setShowArtifacts] = useState(false)
  const { isOpen: canvasIsOpen } = useCanvasLifecycle()

  useEffect(() => {
    const initializeSession = async () => {
      try {
        const session = await window.codeall.invoke('session:get-or-create-default')
        setSessionId(session.id)

        const existingMessages = await window.codeall.invoke('message:list', session.id)
        setMessages(
          existingMessages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
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
    const removeListener = window.codeall.on('message:stream-chunk', ({ content, done }) => {
      if (done) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: streamingContent + content,
            createdAt: new Date().toISOString()
          }
        ])
        setStreamingContent('')
        setIsLoading(false)
      } else {
        setStreamingContent(prev => prev + content)
      }
    })

    return () => {
      removeListener()
    }
  }, [streamingContent])

  const handleSend = async (content: string) => {
    if (!sessionId) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
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
      id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      createdAt: new Date().toISOString(),
      isStreaming: true
    })
  }

  return (
    <div className="flex h-full">
      <div
        className={`flex flex-col gap-4 px-6 py-4 transition-all ${
          canvasIsOpen && showArtifacts
            ? 'w-1/2'
            : canvasIsOpen || showArtifacts
              ? 'w-2/3'
              : 'flex-1'
        }`}
      >
        <header className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold">{viewMode === 'chat' ? '对话' : '流程图'}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {viewMode === 'chat' ? '与AI助手进行交互' : '查看任务执行流程'}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex gap-2 rounded-xl border border-slate-800/70 bg-slate-950/70 p-1 backdrop-blur">
              <button
                type="button"
                onClick={() => setViewMode('chat')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === 'chat'
                    ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.2)]'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                对话
              </button>
              <button
                type="button"
                onClick={() => setViewMode('workflow')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === 'workflow'
                    ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.2)]'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                流程图
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowArtifacts(!showArtifacts)}
              className={`rounded-xl border border-slate-800/70 p-1 px-4 text-sm font-medium backdrop-blur transition-all ${
                showArtifacts
                  ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.2)] border-sky-500/30'
                  : 'bg-slate-950/70 text-slate-400 hover:text-slate-300 hover:bg-slate-900/70'
              }`}
            >
              产物
            </button>
          </div>
        </header>

        {viewMode === 'chat' ? (
          <>
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
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            {sessionId && <WorkflowView sessionId={sessionId} />}
          </div>
        )}
      </div>

      {canvasIsOpen && (
        <div className={showArtifacts ? 'w-1/4' : 'w-1/3'}>
          <ContentCanvas />
        </div>
      )}

      {showArtifacts && sessionId && (
        <div className={canvasIsOpen ? 'w-1/4' : 'w-1/3'}>
          <ArtifactRail />
        </div>
      )}
    </div>
  )
}

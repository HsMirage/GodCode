import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { MessageList } from '../components/chat/MessageList'
import { MessageInput } from '../components/chat/MessageInput'
import { TypingIndicator } from '../components/chat/TypingIndicator'
import { WorkflowView } from '../components/workflow/WorkflowView'
import { ContentCanvas } from '../components/canvas/ContentCanvas'
import { useCanvasLifecycle } from '../hooks/useCanvasLifecycle'
import { Message } from '../components/chat/MessageCard'
import { SessionResumeIndicator } from '../components/session/SessionResumeIndicator'
import { AgentWorkViewer } from '../components/agents/AgentWorkViewer'
import { useAgentStore } from '../store/agent.store'
import { useUIStore } from '../store/ui.store'
import { Globe, ListTodo } from 'lucide-react'
import { useDataStore } from '../store/data.store'

type ViewMode = 'chat' | 'workflow' | 'agent'

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const streamingContentRef = useRef('')
  const [streamingContent, setStreamingContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const { isOpen: canvasIsOpen } = useCanvasLifecycle()
  const { selectedAgentId } = useAgentStore()
  const { isTaskPanelOpen, isBrowserPanelOpen, toggleTaskPanel, toggleBrowserPanel } = useUIStore()
  const { currentSpaceId, currentSessionId, bumpSessionActivity, fetchSpaces } = useDataStore()
  const activeSessionIdRef = useRef<string | null>(null)
  const messageScrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [isNarrow, setIsNarrow] = useState(false)

  // When ContentCanvas is visible, avoid shrinking the chat column too far.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect?.width ?? el.clientWidth
      setIsNarrow(width < 980)
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    activeSessionIdRef.current = currentSessionId
  }, [currentSessionId])

  // Ensure base data exists (spaces -> currentSpace).
  useEffect(() => {
    if (!window.codeall) {
      console.warn('[ChatPage] window.codeall not available, chat will be disabled')
      return
    }

    if (!currentSpaceId) {
      void fetchSpaces()
      return
    }
  }, [currentSpaceId, fetchSpaces])

  const chatDisabled = !currentSessionId

  // Load message history for the active session
  useEffect(() => {
    if (!window.codeall) return

    streamingContentRef.current = ''
    setStreamingContent('')
    setIsLoading(false)
    setSendError(null)

    if (!currentSessionId) {
      setMessages([])
      return
    }

    const load = async () => {
      try {
        const existingMessages = await window.codeall.invoke('message:list', currentSessionId)
        if (!Array.isArray(existingMessages)) {
          setMessages([])
          return
        }

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
        console.error('Failed to load messages:', error)
      }
    }

    void load()
  }, [currentSessionId])

  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('message:stream-chunk', payload => {
      const { content, done, sessionId } = payload as {
        content: string
        done: boolean
        sessionId?: string
      }

      // Ignore chunks for sessions that aren't currently visible.
      if (sessionId && sessionId !== activeSessionIdRef.current) return

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
    })

    return () => {
      removeListener()
    }
  }, [])

  const handleSend = async (content: string) => {
    if (!currentSessionId || !currentSpaceId || !window.codeall) return false

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    setSendError(null)
    bumpSessionActivity(currentSpaceId, currentSessionId)

    streamingContentRef.current = ''
    setStreamingContent('')

    try {
      await window.codeall.invoke('message:send', {
        sessionId: currentSessionId,
        content
      })
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsLoading(false)
      setSendError(error instanceof Error ? error.message : String(error))

      // Reconcile with DB state: message:send may have already persisted the user message
      // before failing to produce an assistant reply.
      try {
        const existingMessages = await window.codeall.invoke('message:list', currentSessionId)
        if (Array.isArray(existingMessages)) {
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
        }
      } catch {
        // ignore
      }
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
    <div
      ref={rootRef}
      className={['h-full', canvasIsOpen && !isNarrow ? 'flex' : 'flex flex-col'].join(' ')}
    >
      <div
        className={[
          'flex flex-col gap-4 py-4 transition-all',
          isNarrow ? 'px-4' : 'px-6',
          canvasIsOpen && !isNarrow ? 'flex-[2] min-w-0' : 'flex-1 min-w-0'
        ].join(' ')}
      >
        <header className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold">{viewMode === 'chat' ? '对话' : '流程图'}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {viewMode === 'chat' ? '与 AI 助手进行交互' : '查看任务执行流程'}
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
              <button
                type="button"
                onClick={() => setViewMode('agent')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === 'agent'
                    ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.2)]'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                代理
              </button>
            </div>
          </div>
        </header>

        {viewMode === 'chat' && (
          <>
            {currentSessionId && (
              <div className="mb-2">
                <SessionResumeIndicator sessionId={currentSessionId} />
              </div>
            )}

            <div
              ref={messageScrollRef}
              className="flex-1 min-h-0 overflow-y-auto scroll-smooth pr-2 scrollbar-overlay"
            >
              {chatDisabled ? (
                <div className="h-full flex items-center justify-center">
                  <div className="max-w-md text-center rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6 backdrop-blur">
                    <p className="text-slate-200 font-medium">未选择任何对话</p>
                    <p className="mt-2 text-sm text-slate-500">
                      请在左侧空间下选择一个已有对话，或点击“新对话”创建。
                    </p>
                  </div>
                </div>
              ) : (
                <MessageList
                  messages={displayMessages}
                  scrollContainerRef={messageScrollRef}
                  scrollKey={currentSessionId ?? undefined}
                />
              )}
            </div>

            {sendError && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                发送失败: {sendError}
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center">
                <TypingIndicator />
              </div>
            )}

            <MessageInput
              isLoading={isLoading}
              onSend={handleSend}
              disabled={chatDisabled}
              disabledHint="请先选择一个对话"
              placeholder="输入消息... (Enter 发送 / Shift+Enter 换行)"
              resetKey={currentSessionId}
              autoFocus={!chatDisabled}
              afterSend={
                <>
                  <button
                    type="button"
                    onClick={toggleTaskPanel}
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-2xl border transition',
                      isTaskPanelOpen
                        ? 'border-indigo-400/50 bg-indigo-500/25 text-indigo-100'
                        : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:text-indigo-200 hover:border-indigo-400/40'
                    ].join(' ')}
                    title={isTaskPanelOpen ? '关闭任务面板' : '打开任务面板'}
                    aria-label="Toggle task panel"
                  >
                    <ListTodo className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleBrowserPanel}
                    className={[
                      'flex h-10 w-10 items-center justify-center rounded-2xl border transition',
                      isBrowserPanelOpen
                        ? 'border-indigo-400/50 bg-indigo-500/25 text-indigo-100'
                        : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:text-indigo-200 hover:border-indigo-400/40'
                    ].join(' ')}
                    title={isBrowserPanelOpen ? '关闭浏览器' : '打开浏览器'}
                    aria-label="Toggle browser panel"
                  >
                    <Globe className="h-4 w-4" />
                  </button>
                </>
              }
            />
          </>
        )}

        {viewMode === 'workflow' && (
          <div className="flex-1 overflow-hidden">
            {currentSessionId ? (
              <WorkflowView sessionId={currentSessionId} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-slate-500">请先在左侧选择或创建一个对话</div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'agent' && (
          <div className="flex-1 overflow-hidden h-full">
            {selectedAgentId ? (
              <AgentWorkViewer agentId={selectedAgentId} className="h-full" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-slate-400">请选择一个代理查看工作状态</p>
                  <p className="mt-2 text-sm text-slate-500">在右侧面板或代理列表中选择一个活动代理</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {canvasIsOpen && (
        <div
          className={[
            canvasIsOpen && !isNarrow ? 'flex-[1] min-w-0' : 'flex-none border-t border-slate-800/60',
            isNarrow ? 'h-[44%] min-h-[260px]' : ''
          ].join(' ')}
        >
          <ContentCanvas />
        </div>
      )}
    </div>
  )
}

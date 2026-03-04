import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { MessageList } from '../components/chat/MessageList'
import { MessageInput, type MessageInputSendPayload } from '../components/chat/MessageInput'
import { TypingIndicator } from '../components/chat/TypingIndicator'
import { WorkflowView } from '../components/workflow/WorkflowView'
import { ContentCanvas } from '../components/canvas/ContentCanvas'
import { useCanvasLifecycle } from '../hooks/useCanvasLifecycle'
import { Message } from '../components/chat/MessageCard'
import { SessionResumeIndicator } from '../components/session/SessionResumeIndicator'
import { AgentWorkViewer } from '../components/agents/AgentWorkViewer'
import { AgentList } from '../components/agents/AgentList'
import { useAgentStore } from '../store/agent.store'
import { useUIStore } from '../store/ui.store'
import { AGENT_DEFINITIONS, type AgentRoutingStrategy } from '@shared/agent-definitions'
import { FileCode2, Globe, ListTodo } from 'lucide-react'
import { useDataStore } from '../store/data.store'
import { useTraceNavigationStore } from '../store/trace-navigation.store'

type ViewMode = 'chat' | 'workflow' | 'agent'

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)
  const streamingContentRef = useRef('')
  const [streamingContent, setStreamingContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('chat')
  const { isOpen: canvasIsOpen } = useCanvasLifecycle()
  const { selectedAgentId, fetchAgents, selectAgent } = useAgentStore()
  const {
    isTaskPanelOpen,
    isBrowserPanelOpen,
    showArtifactRail,
    toggleTaskPanel,
    toggleBrowserPanel,
    toggleArtifactRail
  } = useUIStore()
  const { currentSpaceId, currentSessionId, bumpSessionActivity, fetchSpaces } = useDataStore()
  const activeSessionIdRef = useRef<string | null>(null)
  const messageScrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [isNarrow, setIsNarrow] = useState(false)
  const navigationTarget = useTraceNavigationStore(state => state.target)
  const clearNavigate = useTraceNavigationStore(state => state.clearNavigate)

  // Helper to determine agent strategy
  const getAgentStrategy = (agentCode?: string): AgentRoutingStrategy | undefined => {
    if (!agentCode || agentCode === 'default') return undefined
    const agent = AGENT_DEFINITIONS.find(a => a.code === agentCode)
    return agent?.defaultStrategy
  }

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

  useEffect(() => {
    if (viewMode !== 'agent') return
    void fetchAgents(currentSessionId)
  }, [viewMode, currentSessionId, fetchAgents])

  useEffect(() => {
    if (!navigationTarget) {
      return
    }

    if (navigationTarget.preferredView === 'agent') {
      setViewMode('agent')
      if (navigationTarget.agentId) {
        selectAgent(navigationTarget.agentId)
      }
      return
    }

    if (navigationTarget.preferredView === 'workflow') {
      setViewMode('workflow')
      return
    }

    const timer = setTimeout(() => {
      clearNavigate()
    }, 2400)

    return () => clearTimeout(timer)
  }, [navigationTarget, selectAgent, clearNavigate])

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

  useEffect(() => {
    if (!window.codeall || !currentSessionId) return

    const removeListener = window.codeall.on('task:status-changed', (_payload: any) => {
      // Only auto-switch once (if still in chat mode) when a task event occurs
      // This acts as a backup trigger if the initial switch didn't happen
      // or if tasks are generated later in the process
      if (viewMode === 'chat') {
        setViewMode('workflow')
      }
      if (viewMode === 'agent') {
        void fetchAgents(currentSessionId)
      }
    })

    return () => removeListener()
  }, [currentSessionId, viewMode, fetchAgents])

  const chatDisabled = !currentSessionId

  // Load message history for the active session
  useEffect(() => {
    if (!window.codeall) return

    streamingContentRef.current = ''
    setStreamingContent('')
    setIsLoading(false)
    setSendError(null)
    setRetryNotice(null)

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
              metadata:
                msg.metadata && typeof msg.metadata === 'object'
                  ? (msg.metadata as Record<string, unknown>)
                  : undefined,
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
        if (finalContent.trim()) {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: finalContent,
              createdAt: new Date().toISOString()
            }
          ])
        }
        streamingContentRef.current = ''
        setStreamingContent('')
        setIsLoading(false)
        setRetryNotice(null)
      } else {
        streamingContentRef.current += content
        setStreamingContent(streamingContentRef.current)
      }
    })

    return () => {
      removeListener()
    }
  }, [])

  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('message:stream-error', payload => {
      const { sessionId, message, code } = payload as {
        sessionId?: string
        message: string
        code?: string
      }
      if (sessionId && sessionId !== activeSessionIdRef.current) return

      if (code === 'API_RETRYING') {
        setRetryNotice(message)
        return
      }

      setRetryNotice(null)
      setSendError(message)
      setIsLoading(false)
    })

    return () => {
      removeListener()
    }
  }, [])

  const handleSend = async (payload: MessageInputSendPayload, agentCode?: string) => {
    const { content, skillCommand } = payload
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
    setRetryNotice(null)
    bumpSessionActivity(currentSpaceId, currentSessionId)

    streamingContentRef.current = ''
    setStreamingContent('')

    // Auto-switch to workflow view when workforce strategy is detected
    const strategy = getAgentStrategy(agentCode)
    if (strategy === 'workforce') {
      setViewMode('workflow')
    }

    try {
      const assistantMessage = await window.codeall.invoke('message:send', {
        sessionId: currentSessionId,
        content,
        agentCode,
        skillCommand
      })

      if (assistantMessage && typeof assistantMessage === 'object') {
        const persistedAssistant = assistantMessage as {
          id?: string
          role?: string
          content?: string
          createdAt?: string
          metadata?: unknown
        }

        if (persistedAssistant.role === 'assistant' && typeof persistedAssistant.content === 'string') {
          setMessages(prev => {
            const reverseIndex = [...prev]
              .reverse()
              .findIndex(
                message =>
                  message.role === 'assistant' &&
                  message.content === persistedAssistant.content &&
                  !message.metadata
              )

            if (reverseIndex < 0) {
              return prev
            }

            const messageIndex = prev.length - 1 - reverseIndex
            const next = [...prev]
            next[messageIndex] = {
              ...next[messageIndex],
              id: persistedAssistant.id || next[messageIndex].id,
              createdAt: persistedAssistant.createdAt || next[messageIndex].createdAt,
              metadata:
                persistedAssistant.metadata && typeof persistedAssistant.metadata === 'object'
                  ? (persistedAssistant.metadata as Record<string, unknown>)
                  : next[messageIndex].metadata
            }
            return next
          })
        }
      }

      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsLoading(false)
      setRetryNotice(null)
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
                metadata:
                  msg.metadata && typeof msg.metadata === 'object'
                    ? (msg.metadata as Record<string, unknown>)
                    : undefined,
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

  const handleStop = async () => {
    if (!currentSessionId || !window.codeall) return

    try {
      await window.codeall.invoke('message:abort', { sessionId: currentSessionId })
    } catch (error) {
      console.error('Failed to stop active session:', error)
    } finally {
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
    <div
      ref={rootRef}
      className={[
        // min-h-0 is required so the message list can become the scroll container in short windows.
        'h-full min-h-0',
        canvasIsOpen && !isNarrow ? 'flex' : 'flex flex-col'
      ].join(' ')}
    >
      <div
        className={[
          // overflow-hidden prevents the whole column from becoming the scroll container;
          // only the message list should scroll.
          'flex flex-col gap-4 py-4 transition-all min-h-0 overflow-hidden',
          isNarrow ? 'px-4' : 'px-6',
          canvasIsOpen && !isNarrow ? 'flex-[2] min-w-0' : 'flex-1 min-w-0'
        ].join(' ')}
      >
        <header className="flex shrink-0 items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-semibold">
              {viewMode === 'chat' ? '对话' : viewMode === 'workflow' ? '流程图' : '代理'}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {viewMode === 'chat'
                ? '与 AI 助手进行交互'
                : viewMode === 'workflow'
                  ? '查看任务执行流程'
                  : '查看代理分工与执行状态'}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-1 backdrop-blur">
              <button
                type="button"
                onClick={() => setViewMode('chat')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === 'chat'
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.18)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                对话
              </button>
              <button
                type="button"
                onClick={() => setViewMode('workflow')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === 'workflow'
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.18)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                流程图
              </button>
              <button
                type="button"
                onClick={() => setViewMode('agent')}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  viewMode === 'agent'
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.18)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
                  <div className="max-w-md text-center rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6 backdrop-blur">
                    <p className="text-[var(--text-primary)] font-medium">未选择任何对话</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
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
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
                发送失败: {sendError}
              </div>
            )}

            {retryNotice && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                {retryNotice}
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center">
                <TypingIndicator />
              </div>
            )}

            <div className="shrink-0">
              <MessageInput
                isLoading={isLoading}
                onSend={handleSend}
                onStop={handleStop}
                disabled={chatDisabled}
                disabledHint="请先选择一个对话"
                placeholder="输入消息... (Enter 发送 / Shift+Enter 换行)"
                resetKey={currentSessionId}
                autoFocus={!chatDisabled}
                afterSend={
                  <>
                    <button
                      type="button"
                      onClick={toggleArtifactRail}
                      className={[
                        'flex h-10 w-10 items-center justify-center rounded-2xl border transition',
                        showArtifactRail
                          ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-100'
                          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-400/40 hover:bg-[var(--bg-tertiary)]'
                      ].join(' ')}
                      title={showArtifactRail ? '关闭产物面板' : '打开产物面板'}
                      aria-label="Toggle artifact panel"
                    >
                      <FileCode2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleTaskPanel}
                      className={[
                        'flex h-10 w-10 items-center justify-center rounded-2xl border transition',
                        isTaskPanelOpen
                          ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-100'
                          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-400/40 hover:bg-[var(--bg-tertiary)]'
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
                          ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-100'
                          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-400/40 hover:bg-[var(--bg-tertiary)]'
                      ].join(' ')}
                      title={isBrowserPanelOpen ? '关闭浏览器' : '打开浏览器'}
                      aria-label="Toggle browser panel"
                    >
                      <Globe className="h-4 w-4" />
                    </button>
                  </>
                }
              />
            </div>
          </>
        )}

        {viewMode === 'workflow' && (
          <div className="flex-1 overflow-hidden relative">
            {retryNotice && (
              <div className="absolute top-2 right-3 z-20 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200 backdrop-blur">
                {retryNotice}
              </div>
            )}
            {isLoading && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                <div className="px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-500 text-xs font-medium flex items-center gap-2 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  任务分解中...
                </div>
              </div>
            )}
            {currentSessionId ? (
              <WorkflowView sessionId={currentSessionId} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-[var(--text-muted)]">
                  请先在左侧选择或创建一个对话
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'agent' && (
          <div className="flex-1 overflow-hidden h-full min-h-0 flex flex-col gap-3">
            <div className="shrink-0 max-h-[42%] overflow-y-auto pr-1">
              <AgentList />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {selectedAgentId ? (
                <AgentWorkViewer agentId={selectedAgentId} className="h-full" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-[var(--text-secondary)]">请选择一个代理查看工作状态</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      上方代理列表展示了当前会话的真实分工和状态
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {canvasIsOpen && (
        <div
          className={[
            canvasIsOpen && !isNarrow ? 'flex-[1] min-w-0' : 'flex-none border-t ui-border',
            isNarrow ? 'h-[44%] min-h-[260px]' : ''
          ].join(' ')}
        >
          <ContentCanvas />
        </div>
      )}
    </div>
  )
}

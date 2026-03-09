import { Bot, User, Terminal, AlertCircle } from 'lucide-react'
import { cn } from '../../utils'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallDisplay } from './ToolCallDisplay'
import type { StreamingToolCall } from '../../store/streaming.store'

interface SkillRuntimeMetadata {
  id?: string
  name?: string
  command?: string
  input?: string | null
  rawInput?: string | null
  allowedTools?: string[] | null
  agent?: string | null
  model?: string | null
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date | string | number
  metadata?: Record<string, unknown>
  isStreaming?: boolean
  toolCalls?: StreamingToolCall[]
  error?: { message: string; code?: string }
}

interface MessageCardProps {
  message: Message
}

export function MessageCard({ message }: MessageCardProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const hasError = !!message.error

  const timestamp = message.createdAt ? new Date(message.createdAt).toLocaleString() : ''
  const contextInjectionSummary =
    !isUser && message.metadata && typeof message.metadata === 'object'
      ? ((message.metadata as Record<string, unknown>).contextInjectionSummary as
          | Record<string, unknown>
          | undefined)
      : undefined
  const skillRuntime =
    !isUser && message.metadata && typeof message.metadata === 'object'
      ? (((message.metadata as Record<string, unknown>).skill as SkillRuntimeMetadata | undefined) ??
        undefined)
      : undefined

  const summaryTitle =
    typeof contextInjectionSummary?.title === 'string'
      ? contextInjectionSummary.title
      : '本次注入上下文摘要'
  const summaryTotalCount =
    typeof contextInjectionSummary?.totalCount === 'number' ? contextInjectionSummary.totalCount : 0
  const summaryAcceptedCount =
    typeof contextInjectionSummary?.acceptedCount === 'number'
      ? contextInjectionSummary.acceptedCount
      : 0
  const summaryFilteredCount =
    typeof contextInjectionSummary?.filteredCount === 'number'
      ? contextInjectionSummary.filteredCount
      : 0
  const summaryTruncatedCount =
    typeof contextInjectionSummary?.truncatedCount === 'number'
      ? contextInjectionSummary.truncatedCount
      : 0

  const skillName = typeof skillRuntime?.name === 'string' ? skillRuntime.name : null
  const skillCommand = typeof skillRuntime?.command === 'string' ? skillRuntime.command : null
  const skillInput =
    typeof skillRuntime?.input === 'string' && skillRuntime.input.trim().length > 0
      ? skillRuntime.input
      : null
  const skillRawInput =
    typeof skillRuntime?.rawInput === 'string' && skillRuntime.rawInput.trim().length > 0
      ? skillRuntime.rawInput
      : null
  const skillModel = typeof skillRuntime?.model === 'string' ? skillRuntime.model : null
  const skillAgent = typeof skillRuntime?.agent === 'string' ? skillRuntime.agent : null
  const skillToolsCount = Array.isArray(skillRuntime?.allowedTools) ? skillRuntime.allowedTools.length : 0
  const hasSkillSummary = !!(
    skillName ||
    skillCommand ||
    skillInput ||
    skillRawInput ||
    skillModel ||
    skillAgent ||
    skillToolsCount
  )

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Terminal className="w-3 h-3" />
          <span>{message.content}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex gap-4 max-w-3xl mx-auto w-full group',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg',
          isUser
            ? 'bg-gradient-to-br from-indigo-500 to-indigo-600'
            : hasError
              ? 'bg-gradient-to-br from-red-500 to-red-600'
              : 'bg-gradient-to-br from-emerald-500 to-emerald-600'
        )}
      >
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : hasError ? (
          <AlertCircle className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>

      <div className="flex flex-col gap-1 max-w-[85%]">
        <div
          className={cn(
            'flex items-center gap-2 text-xs text-[var(--text-muted)]',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          <span className="font-medium text-[var(--text-secondary)]">{isUser ? 'You' : 'CodeAll'}</span>
          {timestamp && <span>• {timestamp}</span>}
          {message.isStreaming && (
            <span className="text-emerald-500 animate-pulse">Streaming...</span>
          )}
        </div>

        {/* Tool calls display */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallDisplay toolCalls={message.toolCalls} />
        )}

        {/* Error display */}
        {hasError && (
          <div className="rounded-lg p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">Error</span>
              {message.error?.code && (
                <code className="text-xs bg-red-500/10 px-1.5 py-0.5 rounded">
                  {message.error.code}
                </code>
              )}
            </div>
            <p className="mt-1 ml-6">{message.error?.message}</p>
          </div>
        )}

        {/* Skill runtime summary */}
        {!isUser && hasSkillSummary && (
          <div className="rounded-lg p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)]">
            <div className="font-medium text-[var(--text-primary)]">技能执行摘要</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {skillCommand && <code className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5">{skillCommand}</code>}
              {skillName && <span>技能 {skillName}</span>}
              {skillAgent && <span>Agent {skillAgent}</span>}
              {skillModel && <span>Model {skillModel}</span>}
              {skillToolsCount > 0 && <span>工具白名单 {skillToolsCount}</span>}
            </div>
            {(skillInput || skillRawInput) && (
              <div className="mt-2 space-y-1 text-[var(--text-muted)]">
                {skillInput && <div>输入: {skillInput}</div>}
                {skillRawInput && <div>原始输入: {skillRawInput}</div>}
              </div>
            )}
          </div>
        )}

        {/* Context injection summary */}
        {!isUser && contextInjectionSummary && (
          <div className="rounded-lg p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)]">
            <div className="font-medium text-[var(--text-primary)]">{summaryTitle}</div>
            <div className="mt-1">
              总计 {summaryTotalCount} · 接受 {summaryAcceptedCount} · 过滤 {summaryFilteredCount} · 截断{' '}
              {summaryTruncatedCount}
            </div>
          </div>
        )}

        {/* Message content */}
        <div
          className={cn(
            'rounded-2xl p-4 text-sm leading-relaxed shadow-sm break-words',
            isUser
              ? 'bg-indigo-500/10 text-indigo-900 dark:text-indigo-100 border border-indigo-500/20 rounded-tr-sm'
              : hasError
                ? 'bg-red-500/5 text-[var(--text-primary)] border border-red-500/20 rounded-tl-sm'
                : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-primary)] rounded-tl-sm'
          )}
        >
          {isUser ? (
            // User messages: plain text with whitespace preserved
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            // Assistant messages: Markdown rendering
            <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
          )}
        </div>
      </div>
    </div>
  )
}

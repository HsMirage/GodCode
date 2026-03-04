import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Atom, Paperclip, Send, Square, X } from 'lucide-react'
import { AgentSelector } from './AgentSelector'
import { useUIStore } from '../../store/ui.store'

export interface MessageInputSendPayload {
  content: string
  skillCommand?: {
    command: string
    input?: string
    rawInput?: string
  }
}

export interface MessageInputProps {
  isLoading?: boolean
  onSend: (payload: MessageInputSendPayload, agentCode?: string) => boolean | Promise<boolean>
  onStop?: () => void | Promise<void>
  placeholder?: string
  afterSend?: React.ReactNode
  disabled?: boolean
  disabledHint?: string
  /**
   * When changed, the input switches to the draft context for that key.
   * Drafts are preserved per key so switching sessions won't lose unsent content.
   */
  resetKey?: string | number | null
  autoFocus?: boolean
}

const panelClass = [
  'rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]',
  'px-4 py-4 text-[var(--text-primary)] shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_0_24px_rgba(15,23,42,0.35)]',
  'backdrop-blur'
].join(' ')

const inputShellClass = [
  'rounded-2xl border border-[var(--border-secondary)]',
  'bg-[var(--bg-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_0_18px_rgba(15,23,42,0.25)]',
  'backdrop-blur'
].join(' ')

const textareaClass = [
  'w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--text-primary)]',
  'placeholder:text-[var(--text-muted)] focus:outline-none'
].join(' ')

const iconButtonBase = [
  'h-9 flex items-center gap-1.5 px-2.5 rounded-lg border border-transparent',
  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
  'transition-colors duration-150',
  'disabled:cursor-not-allowed disabled:text-[var(--text-muted)] disabled:hover:bg-transparent'
].join(' ')

const MAX_HEIGHT = 200
const MAX_ATTACHMENTS = 8
const MAX_ATTACHMENT_CHARS = 80_000
const COMMAND_EMPTY_STATE_TEXT = '没有匹配的命令，继续输入以筛选'

type Attachment = {
  id: string
  name: string
  size: number
  content: string
  truncated: boolean
}

type DraftState = {
  value: string
  thinkingEnabled: boolean
  attachments: Attachment[]
  selectedAgent: string
}

type SlashCommandItem = {
  label: string
  command: string
  description: string
  argsHint?: string
}

const DEFAULT_AGENT_CODE = 'haotian'
const sharedDraftCache = new Map<string, DraftState>()

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let idx = 0
  let value = bytes
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const rounded = idx === 0 ? `${Math.round(value)}` : value.toFixed(value < 10 ? 1 : 0)
  return `${rounded} ${units[idx]}`
}

function parseSlashInvocation(input: string): { command: string; remainder: string } | null {
  const trimmedLeft = input.trimStart()
  if (!trimmedLeft.startsWith('/')) {
    return null
  }

  const withoutPrefix = trimmedLeft.slice(1)
  const firstSpace = withoutPrefix.search(/\s/)
  if (firstSpace === -1) {
    return { command: `/${withoutPrefix}`, remainder: '' }
  }

  const command = withoutPrefix.slice(0, firstSpace)
  const remainder = withoutPrefix.slice(firstSpace).trim()
  return { command: `/${command}`, remainder }
}

function getSlashQuery(input: string): string | null {
  const invocation = parseSlashInvocation(input)
  if (!invocation) {
    return null
  }
  if (invocation.remainder) {
    return null
  }
  return invocation.command
}

export function MessageInput({
  isLoading = false,
  onSend,
  onStop,
  placeholder,
  afterSend,
  disabled = false,
  disabledHint,
  resetKey,
  autoFocus = false
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedAgent, setSelectedAgent] = useState(DEFAULT_AGENT_CODE)
  const [commandItems, setCommandItems] = useState<SlashCommandItem[]>([])
  const [commandPanelOpen, setCommandPanelOpen] = useState(false)
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0)
  const slashCommandMru = useUIStore(state => state.slashCommandMru)
  const recordSlashCommandUse = useUIStore(state => state.recordSlashCommandUse)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const draftKeyRef = useRef<string | null>(null)
  const draftsRef = useRef<Record<string, DraftState>>({})
  const latestRef = useRef<DraftState>({
    value: '',
    thinkingEnabled: false,
    attachments: [],
    selectedAgent: DEFAULT_AGENT_CODE
  })

  const resizeTextarea = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
  }

  const closeCommandPanel = () => {
    setCommandPanelOpen(false)
    setCommandItems([])
    setCommandSelectedIndex(0)
  }

  useEffect(() => {
    resizeTextarea()
  }, [value])

  useEffect(() => {
    latestRef.current = { value, thinkingEnabled, attachments, selectedAgent }
  }, [attachments, thinkingEnabled, value, selectedAgent])

  useEffect(() => {
    if (resetKey === undefined) return

    const prevKey = draftKeyRef.current
    if (prevKey) {
      draftsRef.current[prevKey] = latestRef.current
      sharedDraftCache.set(prevKey, latestRef.current)
    }

    const nextKey = resetKey == null ? null : String(resetKey)
    draftKeyRef.current = nextKey

    const next = nextKey ? draftsRef.current[nextKey] ?? sharedDraftCache.get(nextKey) : undefined
    setValue(next?.value ?? '')
    setThinkingEnabled(next?.thinkingEnabled ?? false)
    setAttachments(next?.attachments ?? [])
    setSelectedAgent(next?.selectedAgent ?? DEFAULT_AGENT_CODE)

    if (!autoFocus) return

    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [autoFocus, resetKey])

  useEffect(() => {
    return () => {
      const key = draftKeyRef.current
      if (!key) return
      sharedDraftCache.set(key, latestRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (disabled || isLoading) {
        if (!cancelled) {
          closeCommandPanel()
        }
        return
      }

      const slashQuery = getSlashQuery(value)
      if (!slashQuery) {
        if (!cancelled) {
          closeCommandPanel()
        }
        return
      }

      if (!window.codeall) {
        if (!cancelled) {
          closeCommandPanel()
        }
        return
      }

      try {
        const items = await window.codeall.invoke('skill:command-items', { query: slashQuery })
        if (!cancelled) {
          setCommandItems(Array.isArray(items) ? (items as SlashCommandItem[]) : [])
          setCommandPanelOpen(true)
        }
      } catch {
        if (!cancelled) {
          setCommandItems([])
          setCommandPanelOpen(true)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [disabled, isLoading, value])

  const orderedCommandItems = useMemo(() => {
    if (commandItems.length <= 1) {
      return commandItems
    }

    const mruRank = new Map<string, number>()
    slashCommandMru.forEach((command, index) => {
      mruRank.set(command, index)
    })

    const withIndex = commandItems.map((item, index) => ({ item, index }))
    withIndex.sort((a, b) => {
      const aRank = mruRank.get(a.item.command)
      const bRank = mruRank.get(b.item.command)

      if (aRank !== undefined && bRank !== undefined) {
        return aRank - bRank
      }
      if (aRank !== undefined) {
        return -1
      }
      if (bRank !== undefined) {
        return 1
      }
      return a.index - b.index
    })

    return withIndex.map(entry => entry.item)
  }, [commandItems, slashCommandMru])

  useEffect(() => {
    if (!commandPanelOpen) {
      setCommandSelectedIndex(0)
      return
    }

    setCommandSelectedIndex(current => {
      if (orderedCommandItems.length === 0) {
        return 0
      }
      return Math.min(current, orderedCommandItems.length - 1)
    })
  }, [commandPanelOpen, orderedCommandItems])

  const canSend = useMemo(() => {
    if (disabled) return false
    if (isLoading) return false
    if (value.trim()) return true
    if (attachments.length > 0) return true
    return false
  }, [attachments.length, disabled, isLoading, value])

  const handleCommandPick = (item: SlashCommandItem) => {
    const args = item.argsHint?.trim()
    const commandDraft = args ? `${item.command} ${args}` : `${item.command} `
    setValue(commandDraft)
    closeCommandPanel()
    recordSlashCommandUse(item.command)

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      const cursorPos = commandDraft.length
      textarea.setSelectionRange(cursorPos, cursorPos)
    })
  }

  const buildContent = () => {
    const trimmed = value.trim()
    let content = trimmed

    if (thinkingEnabled) {
      content = `请进行更深入的推理和分析后再回答。\n\n${content}`.trim()
    }

    if (attachments.length > 0) {
      const blocks = attachments.map(a => {
        const header = `### ${a.name} (${formatBytes(a.size)})${a.truncated ? ' [truncated]' : ''}`
        return `${header}\n\n\`\`\`text\n${a.content}\n\`\`\``
      })

      const section = ['\n\n---\n\n## 附件内容', ...blocks].join('\n\n')
      content = `${content}${section}`.trim()
    }

    return content
  }

  const buildSendPayload = (): MessageInputSendPayload | null => {
    const content = buildContent()
    if (!content) return null

    const invocation = parseSlashInvocation(value)
    if (!invocation) {
      return { content }
    }

    return {
      content,
      skillCommand: {
        command: invocation.command,
        input: invocation.remainder || undefined,
        rawInput: value.trim() || undefined
      }
    }
  }

  const handleSend = async () => {
    if (!canSend) return
    const payload = buildSendPayload()
    if (!payload) return

    const prevDraft: DraftState = {
      value,
      thinkingEnabled,
      attachments,
      selectedAgent
    }

    setValue('')
    setAttachments([])
    closeCommandPanel()
    if (textareaRef.current) textareaRef.current.value = ''

    const key = draftKeyRef.current
    if (key) {
      const clearedDraft = { value: '', attachments: [], thinkingEnabled, selectedAgent }
      draftsRef.current[key] = clearedDraft
      sharedDraftCache.set(key, clearedDraft)
    }

    try {
      const ok = await onSend(payload, selectedAgent)
      if (ok) {
        return
      }

      setValue(prevDraft.value)
      setThinkingEnabled(prevDraft.thinkingEnabled)
      setAttachments(prevDraft.attachments)
      setSelectedAgent(prevDraft.selectedAgent)
      if (key) {
        draftsRef.current[key] = prevDraft
        sharedDraftCache.set(key, prevDraft)
      }
    } catch {
      setValue(prevDraft.value)
      setThinkingEnabled(prevDraft.thinkingEnabled)
      setAttachments(prevDraft.attachments)
      setSelectedAgent(prevDraft.selectedAgent)
      if (key) {
        draftsRef.current[key] = prevDraft
        sharedDraftCache.set(key, prevDraft)
      }
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  const onPickFiles = () => {
    if (isLoading || disabled) return
    fileInputRef.current?.click()
  }

  const onFilesSelected = async (files: FileList | null) => {
    if (disabled) return
    if (!files) return

    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length)
    if (remainingSlots === 0) return

    const selected = Array.from(files).slice(0, remainingSlots)

    const newOnes: Attachment[] = []
    for (const f of selected) {
      try {
        let text = await f.text()
        if (text.includes('\u0000')) {
          text = `[Binary file: ${f.name}, ${formatBytes(f.size)}]`
        }

        let truncated = false
        if (text.length > MAX_ATTACHMENT_CHARS) {
          text = text.slice(0, MAX_ATTACHMENT_CHARS)
          truncated = true
        }

        newOnes.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: f.name,
          size: f.size,
          content: text,
          truncated
        })
      } catch {
        newOnes.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: f.name,
          size: f.size,
          content: `[Failed to read file: ${f.name}]`,
          truncated: false
        })
      }
    }

    setAttachments(prev => [...prev, ...newOnes])

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className={panelClass}>
      <div className="flex items-stretch gap-3">
        <div className={['flex-1', inputShellClass].join(' ')}>
          {disabled && (
            <div className="px-4 pt-3 text-xs text-[var(--text-muted)]">{disabledHint ?? '请先选择一个对话'}</div>
          )}

          {attachments.length > 0 && (
            <div className="px-3 pt-3 flex flex-wrap gap-2">
              {attachments.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  title={a.truncated ? '内容已截断' : a.name}
                >
                  <Paperclip className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <span className="max-w-[240px] truncate">{a.name}</span>
                  <span className="text-[var(--text-muted)]">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="ml-1 rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    aria-label="Remove attachment"
                    disabled={isLoading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 pt-3">
            <textarea
              ref={textareaRef}
              className={textareaClass}
              placeholder={placeholder ?? 'Type your message...'}
              rows={1}
              value={value}
              disabled={isLoading || disabled}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (commandPanelOpen) {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    closeCommandPanel()
                    return
                  }

                  if (event.key === 'ArrowDown' && orderedCommandItems.length > 0) {
                    event.preventDefault()
                    setCommandSelectedIndex(current => (current + 1) % orderedCommandItems.length)
                    return
                  }

                  if (event.key === 'ArrowUp' && orderedCommandItems.length > 0) {
                    event.preventDefault()
                    setCommandSelectedIndex(current =>
                      current === 0 ? orderedCommandItems.length - 1 : current - 1
                    )
                    return
                  }

                  if (event.key === 'Enter' && !event.shiftKey && orderedCommandItems.length > 0) {
                    event.preventDefault()
                    handleCommandPick(orderedCommandItems[commandSelectedIndex])
                    return
                  }
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSend()
                }
              }}
            />
          </div>

          {commandPanelOpen && (
            <div className="mx-3 mt-2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2">
              {orderedCommandItems.length > 0 ? (
                <ul className="max-h-52 overflow-y-auto space-y-1">
                  {orderedCommandItems.map((item, index) => {
                    const selected = index === commandSelectedIndex
                    return (
                      <li key={item.command}>
                        <button
                          type="button"
                          className={[
                            'w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--text-primary)] border transition-colors',
                            selected
                              ? 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]'
                              : 'border-transparent hover:border-[var(--border-secondary)]'
                          ].join(' ')}
                          onMouseEnter={() => setCommandSelectedIndex(index)}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleCommandPick(item)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--text-primary)]">{item.command}</span>
                            <span className="text-[var(--text-muted)]">{item.label}</span>
                          </div>
                          <div className="mt-1 text-[var(--text-muted)]">{item.description}</div>
                          {item.argsHint && <div className="mt-1 text-[var(--text-muted)]">参数: {item.argsHint}</div>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="px-3 py-2 text-xs text-[var(--text-muted)]">{COMMAND_EMPTY_STATE_TEXT}</div>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                id={`${inputId}-file`}
                type="file"
                className="hidden"
                multiple
                onChange={e => void onFilesSelected(e.target.files)}
              />
              <button
                type="button"
                onClick={onPickFiles}
                className={iconButtonBase}
                title="添加文件"
                disabled={isLoading || disabled || attachments.length >= MAX_ATTACHMENTS}
              >
                <Paperclip className="h-4 w-4" />
                <span className="text-xs">文件</span>
                {attachments.length > 0 && (
                  <span className="ml-1 text-[10px] text-[var(--text-muted)]">{attachments.length}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setThinkingEnabled(v => !v)}
                className={[
                  iconButtonBase,
                  thinkingEnabled
                    ? 'bg-sky-500/10 text-sky-700 dark:text-sky-200 border border-sky-500/30 hover:bg-sky-500/15'
                    : ''
                ].join(' ')}
                title={thinkingEnabled ? '关闭深度思考' : '开启深度思考'}
                disabled={isLoading || disabled}
              >
                <Atom className="h-4 w-4" />
                <span className="text-xs">深度思考</span>
              </button>

              <AgentSelector
                selectedAgent={selectedAgent}
                onAgentChange={setSelectedAgent}
                disabled={isLoading || disabled}
              />
            </div>

            {isLoading && onStop ? (
              <button
                type="button"
                onClick={() => void onStop()}
                disabled={disabled}
                className={[
                  'h-9 px-3 flex items-center justify-center gap-1 rounded-lg transition-all duration-150 text-xs font-medium',
                  disabled
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                    : 'bg-rose-500 text-white hover:bg-rose-400 active:scale-95'
                ].join(' ')}
                aria-label="Stop generating response"
                title="停止"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className={[
                  'h-9 w-9 flex items-center justify-center rounded-lg transition-all duration-150',
                  canSend
                    ? 'bg-sky-500 text-white hover:bg-sky-400 active:scale-95'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                ].join(' ')}
                aria-label={thinkingEnabled ? 'Send message (Deep Thinking)' : 'Send message'}
                title={thinkingEnabled ? '发送 (深度思考)' : '发送'}
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {afterSend && (
          <div className="flex flex-col justify-between items-center self-stretch">
            {afterSend}
          </div>
        )}
      </div>
    </section>
  )
}

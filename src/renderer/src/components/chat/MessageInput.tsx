import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Atom, Paperclip, Send, X } from 'lucide-react'

export interface MessageInputProps {
  isLoading?: boolean
  onSend: (message: string) => void
  placeholder?: string
  afterSend?: React.ReactNode
}

const panelClass = [
  'rounded-2xl border border-slate-800/70 bg-slate-950/70',
  'px-4 py-4 text-slate-100 shadow-[0_0_24px_rgba(15,23,42,0.35)]',
  'backdrop-blur'
].join(' ')

const inputShellClass = [
  'rounded-2xl border border-slate-700/60',
  'bg-slate-900/60 shadow-[0_0_18px_rgba(15,23,42,0.25)]',
  'backdrop-blur'
].join(' ')

const textareaClass = [
  'w-full resize-none bg-transparent text-sm leading-relaxed text-slate-100',
  'placeholder:text-slate-500 focus:outline-none'
].join(' ')

const iconButtonBase = [
  'h-9 flex items-center gap-1.5 px-2.5 rounded-lg border border-transparent',
  'text-slate-300/80 hover:text-slate-200 hover:bg-slate-800/40',
  'transition-colors duration-150',
  'disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent'
].join(' ')

const MAX_HEIGHT = 200
const MAX_ATTACHMENTS = 8
const MAX_ATTACHMENT_CHARS = 80_000

type Attachment = {
  id: string
  name: string
  size: number
  content: string
  truncated: boolean
}

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

export function MessageInput({
  isLoading = false,
  onSend,
  placeholder,
  afterSend
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()

  const resizeTextarea = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
  }

  useEffect(() => {
    resizeTextarea()
  }, [value])

  const canSend = useMemo(() => {
    if (isLoading) return false
    if (value.trim()) return true
    if (attachments.length > 0) return true
    return false
  }, [attachments.length, isLoading, value])

  const buildPayload = () => {
    const trimmed = value.trim()
    let content = trimmed

    if (thinkingEnabled) {
      // Hint only; backend currently only accepts "content".
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

  const handleSend = () => {
    if (!canSend) return
    const payload = buildPayload()
    if (!payload) return
    onSend(payload)
    setValue('')
    setAttachments([])
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  const onPickFiles = () => {
    if (isLoading) return
    fileInputRef.current?.click()
  }

  const onFilesSelected = async (files: FileList | null) => {
    if (!files) return

    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length)
    if (remainingSlots === 0) return

    const selected = Array.from(files).slice(0, remainingSlots)

    const newOnes: Attachment[] = []
    for (const f of selected) {
      try {
        let text = await f.text()
        // Heuristic: treat files with NUL chars as binary.
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

    // Reset input so selecting the same file again still triggers change.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <section className={panelClass}>
      <div className="flex items-stretch gap-3">
        <div className={['flex-1', inputShellClass].join(' ')}>
          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-3 pt-3 flex flex-wrap gap-2">
              {attachments.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-200"
                  title={a.truncated ? '内容已截断' : a.name}
                >
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  <span className="max-w-[240px] truncate">{a.name}</span>
                  <span className="text-slate-500">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    className="ml-1 rounded-md p-1 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    aria-label="Remove attachment"
                    disabled={isLoading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className="px-4 pt-3">
          <textarea
            ref={textareaRef}
            className={textareaClass}
            placeholder={placeholder ?? 'Type your message...'}
            rows={1}
            value={value}
            disabled={isLoading}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
          />
          </div>

          {/* Bottom toolbar */}
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
                disabled={isLoading || attachments.length >= MAX_ATTACHMENTS}
              >
                <Paperclip className="h-4 w-4" />
                <span className="text-xs">文件</span>
                {attachments.length > 0 && (
                  <span className="ml-1 text-[10px] text-slate-400">{attachments.length}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setThinkingEnabled(v => !v)}
                className={[
                  iconButtonBase,
                  thinkingEnabled
                    ? 'bg-sky-500/10 text-sky-200 border border-sky-500/30 hover:bg-sky-500/15'
                    : ''
                ].join(' ')}
                title={thinkingEnabled ? '关闭深度思考' : '开启深度思考'}
                disabled={isLoading}
              >
                <Atom className="h-4 w-4" />
                <span className="text-xs">深度思考</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={[
                'h-9 w-9 flex items-center justify-center rounded-lg transition-all duration-150',
                canSend
                  ? 'bg-sky-500 text-white hover:bg-sky-400 active:scale-95'
                  : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
              ].join(' ')}
              aria-label={thinkingEnabled ? 'Send message (Deep Thinking)' : 'Send message'}
              title={thinkingEnabled ? '发送 (深度思考)' : '发送'}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* External actions (e.g. open Task/Browser panels) */}
        {afterSend && (
          <div className="flex flex-col justify-between items-center self-stretch">
            {afterSend}
          </div>
        )}
      </div>
    </section>
  )
}

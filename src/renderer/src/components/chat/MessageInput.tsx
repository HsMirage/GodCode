import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'

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
  'flex-1 rounded-2xl border border-slate-700/60',
  'bg-slate-900/60 shadow-[0_0_18px_rgba(15,23,42,0.25)]',
  'px-4 py-3 backdrop-blur'
].join(' ')

const textareaClass = [
  'w-full resize-none bg-transparent text-sm leading-relaxed text-slate-100',
  'placeholder:text-slate-500 focus:outline-none'
].join(' ')

const buttonClass = [
  'flex h-12 w-12 items-center justify-center rounded-2xl border',
  'border-sky-500/40 bg-sky-500/15 text-sky-100',
  'shadow-[0_0_22px_rgba(56,189,248,0.2)]',
  'transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-sky-500/25',
  'disabled:cursor-not-allowed disabled:border-slate-700/50',
  'disabled:bg-slate-900/40 disabled:text-slate-500 disabled:shadow-none'
].join(' ')

const MAX_HEIGHT = 200

export function MessageInput({
  isLoading = false,
  onSend,
  placeholder,
  afterSend
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setValue('')
  }

  return (
    <section className={panelClass}>
      <div className='flex items-end gap-3'>
        <div className={inputShellClass}>
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
        <button
          type='button'
          className={buttonClass}
          onClick={handleSend}
          disabled={isLoading || !value.trim()}
          aria-label='Send message'
        >
          <Send className='h-5 w-5' />
        </button>
        {afterSend && <div className="flex items-center gap-2">{afterSend}</div>}
      </div>
    </section>
  )
}

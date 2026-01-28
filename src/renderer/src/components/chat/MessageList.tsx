import { useEffect, useRef } from 'react'

export interface ChatMessage {
  id?: string | number
  role: 'user' | 'assistant'
  content: string
}

export interface MessageListProps {
  messages: ChatMessage[]
}

const panelClass = [
  'flex h-full flex-col rounded-2xl border border-slate-800/70',
  'bg-slate-950/70 text-slate-100 shadow-[0_0_24px_rgba(15,23,42,0.35)]',
  'backdrop-blur'
].join(' ')

const scrollAreaClass = [
  'flex-1 overflow-y-auto px-4 py-5',
  'space-y-4'
].join(' ')

const bubbleBaseClass = [
  'max-w-[70%] whitespace-pre-wrap rounded-2xl border px-4 py-3',
  'text-sm leading-relaxed shadow-[0_0_18px_rgba(15,23,42,0.25)]'
].join(' ')

const userBubbleClass = [
  bubbleBaseClass,
  'rounded-br-md border-sky-500/30 bg-sky-500/10 text-sky-100',
  'shadow-[0_0_22px_rgba(56,189,248,0.18)]'
].join(' ')

const assistantBubbleClass = [
  bubbleBaseClass,
  'rounded-bl-md border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  'shadow-[0_0_22px_rgba(16,185,129,0.18)]'
].join(' ')

export function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <section className={panelClass}>
      <div className={scrollAreaClass}>
        {messages.map((message, index) => {
          const isUser = message.role === 'user'
          return (
            <div
              key={message.id ?? `${message.role}-${index}`}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={isUser ? userBubbleClass : assistantBubbleClass}>
                {message.content}
              </div>
            </div>
          )
        })}
        <div ref={endRef} className='h-1' />
      </div>
    </section>
  )
}

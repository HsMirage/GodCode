import { useEffect, useRef } from 'react'
import { Message, MessageCard } from './MessageCard'
import { cn } from '../../utils'

interface MessageListProps {
  messages: Message[]
  className?: string
}

export function MessageList({ messages, className }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className={cn('flex flex-col space-y-6 pb-4', className)}>
      {messages.map(msg => (
        <MessageCard key={msg.id} message={msg} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

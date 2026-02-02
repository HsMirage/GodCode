import { Bot, User, Terminal } from 'lucide-react'
import { cn } from '../../utils'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date | string | number
  isStreaming?: boolean
}

interface MessageCardProps {
  message: Message
}

export function MessageCard({ message }: MessageCardProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const timestamp = message.createdAt ? new Date(message.createdAt).toLocaleString() : ''

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-slate-500">
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
            : 'bg-gradient-to-br from-emerald-500 to-emerald-600'
        )}
      >
        {isUser ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
      </div>

      <div className="flex flex-col gap-1 max-w-[85%]">
        <div
          className={cn(
            'flex items-center gap-2 text-xs text-slate-500',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          <span className="font-medium text-slate-300">{isUser ? 'You' : 'CodeAll'}</span>
          {timestamp && <span>• {timestamp}</span>}
        </div>

        <div
          className={cn(
            'rounded-2xl p-4 text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words',
            isUser
              ? 'bg-indigo-500/10 text-indigo-100 border border-indigo-500/20 rounded-tr-sm'
              : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-sm'
          )}
        >
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Send, Paperclip, Bot, User } from 'lucide-react'
import { cn } from '../../utils'

export function ChatView() {
  const [input, setInput] = useState('')

  const [messages, setMessages] = useState([
    { id: '1', role: 'assistant', content: 'Hello! I am CodeAll. How can I help you today?' }
  ])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: input }])
    setInput('')
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-4 max-w-3xl mx-auto',
              msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                msg.role === 'user' ? 'bg-indigo-600' : 'bg-emerald-600'
              )}
            >
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>

            <div
              className={cn(
                'rounded-lg p-3 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-indigo-500/10 text-indigo-100 border border-indigo-500/20'
                  : 'bg-slate-900 text-slate-200 border border-slate-800'
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="max-w-3xl mx-auto relative">
          <form onSubmit={handleSend} className="relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-4 pr-24 py-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
          <div className="text-xs text-center text-slate-500 mt-2">
            CodeAll can make mistakes. Please verify generated code.
          </div>
        </div>
      </div>
    </div>
  )
}

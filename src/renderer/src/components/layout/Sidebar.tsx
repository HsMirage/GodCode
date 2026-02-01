import { Plus, MessageSquare } from 'lucide-react'
import { useDataStore } from '../../store/data.store'
import { cn } from '../../utils'

export function Sidebar() {
  const { sessions, currentSessionId, currentSpaceId, setCurrentSession, createSession } =
    useDataStore()

  const handleCreateSession = () => {
    if (currentSpaceId) {
      createSession(currentSpaceId, `New Chat ${sessions.length + 1}`)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sessions</h2>
        <button
          type="button"
          onClick={handleCreateSession}
          disabled={!currentSpaceId}
          className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded transition-colors disabled:opacity-50"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">No active sessions</div>
        ) : (
          sessions.map(session => (
            <button
              type="button"
              key={session.id}
              onClick={() => setCurrentSession(session.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors group',
                currentSessionId === session.id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              )}
            >
              <MessageSquare
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  currentSessionId === session.id
                    ? 'text-indigo-400'
                    : 'text-slate-600 group-hover:text-slate-500'
                )}
              />
              <span className="truncate">{session.title || 'Untitled Session'}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, MessageSquare, Pencil, Plus, X } from 'lucide-react'
import { useDataStore } from '../../store/data.store'
import { safeInvoke } from '../../api'
import { cn } from '../../utils'
import { getLastPathSegment } from '../../utils/path'

export function Sidebar() {
  const {
    spaces,
    sessionsBySpaceId,
    currentSessionId,
    currentSpaceId,
    fetchSessions,
    setCurrentSpace,
    selectSession,
    createSpace,
    updateSpace,
    createSession
  } = useDataStore()

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [isCreatingSpace, setIsCreatingSpace] = useState(false)
  const [pendingWorkDir, setPendingWorkDir] = useState<string | null>(null)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null)
  const [renameSpaceName, setRenameSpaceName] = useState('')

  useEffect(() => {
    if (!currentSpaceId) return
    setExpanded(prev => ({ ...prev, [currentSpaceId]: true }))
  }, [currentSpaceId])

  const currentSpaceName = useMemo(() => {
    const current = spaces.find(s => s.id === currentSpaceId)
    return current?.name ?? ''
  }, [spaces, currentSpaceId])

  const handleToggleSpace = async (spaceId: string) => {
    setExpanded(prev => ({ ...prev, [spaceId]: !prev[spaceId] }))
    if (!sessionsBySpaceId[spaceId]) {
      await fetchSessions(spaceId)
    }
  }

  const handleSelectSpace = (spaceId: string) => {
    setCurrentSpace(spaceId)
  }

  const handleCreateSpaceStart = async () => {
    const folder = await safeInvoke<string | null>('dialog:select-folder')
    if (!folder) return

    setPendingWorkDir(folder)
    setNewSpaceName(getLastPathSegment(folder) || 'New Space')
    setIsCreatingSpace(true)
  }

  const handleCreateSpaceCancel = () => {
    setIsCreatingSpace(false)
    setPendingWorkDir(null)
    setNewSpaceName('')
  }

  const handleCreateSpaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingWorkDir) return
    if (!newSpaceName.trim()) return

    await createSpace(newSpaceName.trim(), pendingWorkDir)
    handleCreateSpaceCancel()
  }

  const handleRenameStart = (spaceId: string, currentName: string) => {
    setRenamingSpaceId(spaceId)
    setRenameSpaceName(currentName)
    setExpanded(prev => ({ ...prev, [spaceId]: true }))
  }

  const handleRenameCancel = () => {
    setRenamingSpaceId(null)
    setRenameSpaceName('')
  }

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renamingSpaceId) return
    if (!renameSpaceName.trim()) return

    await updateSpace(renamingSpaceId, { name: renameSpaceName.trim() })
    handleRenameCancel()
  }

  const handleCreateSession = async (spaceId: string) => {
    const list = sessionsBySpaceId[spaceId] ?? []
    await createSession(spaceId, `New Chat ${list.length + 1}`)
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Spaces</h2>
          {currentSpaceName && (
            <p className="mt-1 text-xs text-slate-600 truncate" title={currentSpaceName}>
              Current: {currentSpaceName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleCreateSpaceStart}
          className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-900 rounded transition-colors"
          title="New Space"
          aria-label="Create new space"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isCreatingSpace && (
          <form
            onSubmit={handleCreateSpaceSubmit}
            className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2"
          >
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <input
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                placeholder="Space name..."
                className="flex-1 min-w-0 bg-slate-950/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateSpaceCancel}
                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {pendingWorkDir && (
              <p className="mt-2 text-xs text-slate-600 truncate" title={pendingWorkDir}>
                {pendingWorkDir}
              </p>
            )}
          </form>
        )}

        {spaces.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">No spaces yet</div>
        ) : (
          spaces.map(space => {
            const isExpanded = !!expanded[space.id]
            const isCurrent = currentSpaceId === space.id
            const sessions = sessionsBySpaceId[space.id] ?? []
            const isRenaming = renamingSpaceId === space.id

            return (
              <div
                key={space.id}
                className={cn(
                  'rounded-lg border transition-colors',
                  isCurrent
                    ? 'border-slate-700/70 bg-slate-900/30'
                    : 'border-slate-900/0 hover:border-slate-800/60'
                )}
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => void handleToggleSpace(space.id)}
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    aria-label={isExpanded ? 'Collapse space' : 'Expand space'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSpace(space.id)}
                    className={cn(
                      'flex-1 min-w-0 flex items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors',
                      isCurrent ? 'text-slate-100' : 'text-slate-300 hover:bg-slate-900/60'
                    )}
                    title={space.workDir}
                  >
                    <Folder
                      className={cn(
                        'h-4 w-4 flex-shrink-0',
                        isCurrent ? 'text-indigo-400' : 'text-slate-600'
                      )}
                    />
                    {isRenaming ? (
                      <span className="truncate text-slate-500">Renaming...</span>
                    ) : (
                      <span className="truncate">{space.name}</span>
                    )}
                    <span className="ml-auto text-xs text-slate-600">{sessions.length}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRenameStart(space.id, space.name)}
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                    title="Rename space"
                    aria-label="Rename space"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-2 pb-2">
                    {isRenaming && (
                      <form onSubmit={handleRenameSubmit} className="mb-2 flex items-center gap-2">
                        <input
                          value={renameSpaceName}
                          onChange={e => setRenameSpaceName(e.target.value)}
                          className="flex-1 min-w-0 bg-slate-950/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleRenameCancel}
                          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleCreateSession(space.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                      title="New Chat"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Chat
                    </button>

                    <div className="mt-1 space-y-1">
                      {sessions.length === 0 ? (
                        <div className="text-center py-3 text-slate-600 text-xs">
                          No active sessions
                        </div>
                      ) : (
                        sessions.map(session => (
                          <button
                            type="button"
                            key={session.id}
                            onClick={() => void selectSession(space.id, session.id)}
                            className={cn(
                              'w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-left transition-colors group',
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
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

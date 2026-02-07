import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X
} from 'lucide-react'
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
    fetchSpaces,
    fetchSessions,
    setCurrentSpace,
    selectSession,
    createSpace,
    updateSpace,
    deleteSpace,
    createSession,
    updateSessionTitle,
    deleteSession
  } = useDataStore()

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null)
  const [renameSpaceName, setRenameSpaceName] = useState('')
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameSessionTitle, setRenameSessionTitle] = useState('')


  useEffect(() => {
    if (!currentSpaceId) return
    setExpanded(prev => ({ ...prev, [currentSpaceId]: true }))
  }, [currentSpaceId])

  // Defensive: if the store gets reset (HMR/reload quirks), ensure we re-fetch spaces when Sidebar mounts.
  useEffect(() => {
    if (!window.codeall) return
    if (spaces.length > 0) return
    void fetchSpaces()
  }, [fetchSpaces, spaces.length])

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

    const name = getLastPathSegment(folder) || 'New Space'
    const created = await createSpace(name, folder)
    if (created) setExpanded(prev => ({ ...prev, [created.id]: true }))
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
    await createSession(spaceId, `新对话 ${list.length + 1}`)
  }

  const handleDeleteSpace = async (spaceId: string, spaceName: string) => {
    const ok = window.confirm(
      `确定删除空间“${spaceName}”吗？\n\n这将同时删除该空间下的所有对话、消息、任务和产物，且无法撤销。`
    )
    if (!ok) return
    await deleteSpace(spaceId)
  }

  const handleSessionRenameStart = (sessionId: string, currentTitle: string) => {
    setRenamingSessionId(sessionId)
    setRenameSessionTitle(currentTitle || '未命名对话')
  }

  const handleSessionRenameCancel = () => {
    setRenamingSessionId(null)
    setRenameSessionTitle('')
  }

  const handleSessionRenameSubmit = async (spaceId: string, sessionId: string) => {
    const next = renameSessionTitle.trim()
    if (!next) return
    await updateSessionTitle(spaceId, sessionId, next)
    handleSessionRenameCancel()
  }

  const handleDeleteSession = async (spaceId: string, sessionId: string, title: string) => {
    const ok = window.confirm(`确定删除对话“${title || '未命名对话'}”吗？\n\n该操作无法撤销。`)
    if (!ok) return
    await deleteSession(spaceId, sessionId)
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

                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <form
                        onSubmit={handleRenameSubmit}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors',
                          isCurrent ? 'text-slate-100' : 'text-slate-300'
                        )}
                        title={space.workDir}
                      >
                        <Folder
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            isCurrent ? 'text-indigo-400' : 'text-slate-600'
                          )}
                        />
                        <input
                          value={renameSpaceName}
                          onChange={e => setRenameSpaceName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') handleRenameCancel()
                          }}
                          className="flex-1 min-w-0 bg-slate-950/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                          autoFocus
                        />
                        <span className="flex-shrink-0 text-xs text-slate-600">{sessions.length}</span>
                        <button
                          type="button"
                          onClick={handleRenameCancel}
                          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                          title="Cancel"
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectSpace(space.id)}
                        className={cn(
                          'w-full min-w-0 flex items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors',
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
                        <span className="truncate">{space.name}</span>
                        <span className="ml-auto text-xs text-slate-600">{sessions.length}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRenameStart(space.id, space.name)}
                    disabled={isRenaming}
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                    title="Rename space"
                    aria-label="Rename space"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteSpace(space.id, space.name)}
                    className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    title="Delete space"
                    aria-label="Delete space"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Always-visible action under each space item (not hidden behind expand) */}
                <div className="px-2 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(prev => ({ ...prev, [space.id]: true }))
                      void handleCreateSession(space.id)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                    title="新对话"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新对话
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-2 pb-2 pt-0">
                    <div className="mt-1 space-y-1">
                      {sessions.length === 0 ? (
                        <div className="text-center py-3 text-slate-600 text-xs">
                          No active sessions
                        </div>
                      ) : (
                        sessions.map(session => {
                          const isRenamingSession = renamingSessionId === session.id
                          const title = session.title || '未命名对话'

                          if (isRenamingSession) {
                            return (
                              <form
                                key={session.id}
                                onSubmit={e => {
                                  e.preventDefault()
                                  void handleSessionRenameSubmit(space.id, session.id)
                                }}
                                className="flex items-center gap-2 px-2 py-2 rounded-md bg-slate-900/50 border border-slate-800/70"
                              >
                                <input
                                  value={renameSessionTitle}
                                  onChange={e => setRenameSessionTitle(e.target.value)}
                                  className="flex-1 min-w-0 bg-slate-950/40 border border-slate-800 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={handleSessionRenameCancel}
                                  className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </form>
                            )
                          }

                          return (
                            <div
                              key={session.id}
                              className={cn(
                                'w-full flex items-center gap-2 px-1 rounded-md transition-colors group',
                                currentSessionId === session.id
                                  ? 'bg-slate-800 text-slate-100'
                                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => void selectSession(space.id, session.id)}
                                className="flex-1 min-w-0 flex items-center gap-3 px-1.5 py-2 text-sm text-left"
                              >
                                <MessageSquare
                                  className={cn(
                                    'w-4 h-4 flex-shrink-0',
                                    currentSessionId === session.id
                                      ? 'text-indigo-400'
                                      : 'text-slate-600 group-hover:text-slate-500'
                                  )}
                                />
                                <span className="truncate">{title}</span>
                              </button>

                              <div className="flex items-center gap-1 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => handleSessionRenameStart(session.id, title)}
                                  className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-900 transition-colors"
                                  title="Rename"
                                  aria-label="Rename session"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSession(space.id, session.id, title)}
                                  className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                  title="Delete"
                                  aria-label="Delete session"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })
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

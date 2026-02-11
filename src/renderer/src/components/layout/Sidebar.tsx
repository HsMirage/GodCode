import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
  X
} from 'lucide-react'
import { useDataStore } from '../../store/data.store'
import { useUIStore } from '../../store/ui.store'
import { safeInvoke } from '../../api'
import { cn } from '../../utils'
import { getLastPathSegment } from '../../utils/path'

import { LocalFileExplorer } from '../sidebar/LocalFileExplorer'

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

  const { theme, toggleTheme } = useUIStore()

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
    <div className="h-full flex flex-col ui-bg-panel border-r ui-border">
      <div className="p-3 border-b ui-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Spaces</h2>
          {currentSpaceName && (
            <p className="mt-1 text-xs text-[var(--text-secondary)] truncate" title={currentSpaceName}>
              Current: {currentSpaceName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleCreateSpaceStart}
          className="p-1 text-[var(--text-secondary)] hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          title="New Space"
          aria-label="Create new space"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {currentSpaceId && (
          <LocalFileExplorer className="mb-4" />
        )}

        {spaces.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">No spaces yet</div>
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
                  'rounded-xl border transition-colors',
                  isCurrent
                    ? 'border-indigo-500/30 bg-indigo-500/5 shadow-[0_0_18px_rgba(99,102,241,0.10)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                <div className="flex items-center gap-1 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleSpace(space.id)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
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
                          isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                        )}
                        title={space.workDir}
                      >
                        <Folder
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            isCurrent ? 'text-indigo-500 dark:text-indigo-400' : 'text-[var(--text-secondary)]'
                          )}
                        />
                        <input
                          value={renameSpaceName}
                          onChange={e => setRenameSpaceName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') handleRenameCancel()
                          }}
                          className="flex-1 min-w-0 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                          autoFocus
                        />
                        <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">
                          {sessions.length}
                        </span>
                        <button
                          type="button"
                          onClick={handleRenameCancel}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
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
                          isCurrent
                            ? 'text-[var(--text-primary)]'
                            : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                        )}
                        title={space.workDir}
                      >
                        <Folder
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            isCurrent ? 'text-indigo-500 dark:text-indigo-400' : 'text-[var(--text-secondary)]'
                          )}
                        />
                        <span className="truncate">{space.name}</span>
                        <span className="ml-auto text-[11px] text-[var(--text-muted)] tabular-nums">
                          {sessions.length}
                        </span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRenameStart(space.id, space.name)}
                    disabled={isRenaming}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    title="Rename space"
                    aria-label="Rename space"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteSpace(space.id, space.name)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    title="Delete space"
                    aria-label="Delete space"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-0">
                    <div className="mt-1 ml-2 pl-3 border-l ui-border">
                      <button
                        type="button"
                        onClick={() => void handleCreateSession(space.id)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        title="新对话"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新对话
                      </button>

                      <div className="mt-2 space-y-1">
                        {sessions.length === 0 ? (
                          <div className="text-center py-3 text-[var(--text-muted)] text-xs">
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
                                  className="flex items-center gap-2 px-2 py-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-primary)]"
                                >
                                  <input
                                    value={renameSessionTitle}
                                    onChange={e => setRenameSessionTitle(e.target.value)}
                                    className="flex-1 min-w-0 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={handleSessionRenameCancel}
                                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
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
                                  'w-full flex items-center gap-2 px-1 rounded-lg transition-colors group',
                                  currentSessionId === session.id
                                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => void selectSession(space.id, session.id)}
                                  className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-sm text-left"
                                >
                                  <MessageSquare
                                    className={cn(
                                      'w-4 h-4 flex-shrink-0',
                                      currentSessionId === session.id
                                        ? 'text-indigo-500 dark:text-indigo-400'
                                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                                    )}
                                  />
                                  <span className="truncate">{title}</span>
                                </button>

                                <div className="flex items-center gap-1 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => handleSessionRenameStart(session.id, title)}
                                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                                    title="Rename"
                                    aria-label="Rename session"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteSession(space.id, session.id, title)
                                    }
                                    className="p-1 rounded text-[var(--text-muted)] hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
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
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Theme Toggle Button */}
      <div className="p-3 border-t ui-border">
        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
          )}
          title={theme === 'dark' ? '切换到亮色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-4 w-4" />
              <span>亮色模式</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              <span>深色模式</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

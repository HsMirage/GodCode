import React, { useState } from 'react'
import { BrowserViewer } from './BrowserViewer'
import { useCanvasLifecycle } from '../../hooks/useCanvasLifecycle'
import { useArtifactStore } from '../../store/artifact.store'
import { useDataStore } from '../../store/data.store'
import { useUIStore } from '../../store/ui.store'
import { api } from '../../api'
import { X, Globe, Copy, Download, Trash2, Maximize2, Loader2, Save } from 'lucide-react'
import { CodePreview } from '../artifact/previews/CodePreview'
import { MarkdownPreview } from '../artifact/previews/MarkdownPreview'
import { ImagePreview } from '../artifact/previews/ImagePreview'
import { JsonPreview } from '../artifact/previews/JsonPreview'
import { Artifact } from '../../types/domain'

export function ContentCanvas() {
  const { tabs, activeTab, closeTab, setOpen, switchTab, updateTabContent, markTabSaved } =
    useCanvasLifecycle()
  const { selectedArtifact, downloadArtifact, deleteArtifact, loadArtifacts } = useArtifactStore()
  const { currentSpaceId, currentSessionId } = useDataStore()
  const { showContentCanvas, toggleContentCanvas } = useUIStore()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflictState, setConflictState] = useState<{
    currentContent: string
    currentMtimeMs: number
    attemptedContent: string
  } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleClose = () => {
    setOpen(false)
    if (showContentCanvas) {
      toggleContentCanvas()
    }
  }

  const handleCopy = async () => {
    if (!selectedArtifact?.content) return
    try {
      await navigator.clipboard.writeText(selectedArtifact.content)
    } catch (err) {
      console.error('Failed to copy content:', err)
    }
  }

  const handleDownload = async () => {
    if (!selectedArtifact || !currentSpaceId) return
    try {
      await downloadArtifact(selectedArtifact, currentSpaceId)
    } catch (err) {
      console.error('Failed to download artifact:', err)
    }
  }

  const handleDelete = async () => {
    if (!selectedArtifact) return
    if (!confirm('Are you sure you want to delete this artifact?')) return

    try {
      await deleteArtifact(selectedArtifact)
    } catch (err) {
      console.error('Failed to delete artifact:', err)
    }
  }

  const artifactName = selectedArtifact ? selectedArtifact.path.split('/').pop() : 'Browser Preview'

  const handleSaveTab = async (tabId: string, forceOverwrite = false) => {
    const tab = tabs.find(item => item.id === tabId)
    if (!tab?.path || !currentSessionId) return

    const nextContent = tab.content || ''
    const expectedMtimeMs = forceOverwrite ? undefined : tab.mtimeMs

    setIsSaving(true)
    setSaveError(null)

    try {
      const result = await api.writeArtifactContent({
        filePath: tab.path,
        sessionId: currentSessionId,
        content: nextContent,
        expectedMtimeMs
      })

      if (result.success === false) {
        if (result.conflict) {
          setConflictState({
            currentContent: result.conflict.currentContent,
            currentMtimeMs: result.conflict.currentMtimeMs,
            attemptedContent: nextContent
          })
          return
        }
        throw new Error(result.error || 'Failed to save file')
      }

      markTabSaved(tabId, nextContent, result.mtimeMs)
      setConflictState(null)
      if (currentSessionId) {
        await loadArtifacts(currentSessionId)
      }
    } catch (error) {
      setSaveError((error as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReloadFromDisk = () => {
    if (!activeTab?.id || !conflictState) return
    updateTabContent(activeTab.id, conflictState.currentContent)
    markTabSaved(activeTab.id, conflictState.currentContent, conflictState.currentMtimeMs)
    setConflictState(null)
  }

  const handleMergeAfterConflict = () => {
    if (!activeTab?.id || !conflictState) return

    const mergedContent = [
      '<<<<<<< Disk version',
      conflictState.currentContent,
      '=======',
      conflictState.attemptedContent,
      '>>>>>>> Your edits'
    ].join('\n')

    markTabSaved(activeTab.id, mergedContent, conflictState.currentMtimeMs)
    updateTabContent(activeTab.id, mergedContent)
    setConflictState(null)
    setSaveError('Conflict merged with markers. Please review and save.')
  }

  if (selectedArtifact) {
    return (
      <div className="h-full flex flex-col ui-bg-panel border-l ui-border">
        <div className="h-10 bg-[var(--bg-tertiary)] border-b ui-border flex items-center justify-between px-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] overflow-hidden">
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span className="truncate" title={selectedArtifact?.path}>
              {artifactName}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
              title="Copy content"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
              title="Delete file"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-[var(--border-secondary)] mx-1" />

            <button
              type="button"
              onClick={() => {
                if (activeTab?.id) {
                  void handleSaveTab(activeTab.id)
                }
              }}
              disabled={!activeTab?.isDirty || isSaving}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Save file"
            >
              <Save className={`w-4 h-4 ${isSaving ? 'animate-pulse' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative bg-[var(--bg-primary)]">
          {renderContent(selectedArtifact)}
        </div>
      </div>
    )
  }

  if (!activeTab) {
    return (
      <div className="h-full flex items-center justify-center ui-bg-panel border-l ui-border text-[var(--text-muted)]">
        <div className="flex flex-col items-center gap-2">
          <p>No active content</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-l ui-border ui-bg-panel">
      <div className="flex items-center gap-2 px-3 py-2 border-b ui-border bg-[var(--bg-tertiary)]">
        <div className="flex-1 flex items-center gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  switchTab(tab.id)
                }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer ${
                tab.id === activeTab.id
                  ? 'bg-[var(--bg-secondary)] text-sky-700 dark:text-sky-400'
                  : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => switchTab(tab.id)}
            >
              <span className="text-sm truncate max-w-[150px]">
                {tab.title}
                {tab.isDirty ? ' *' : ''}
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="p-0.5 rounded hover:bg-[var(--bg-tertiary)]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab.type === 'browser' && <BrowserViewer tab={activeTab} />}
        {activeTab.type !== 'browser' && (
          <div className="h-full flex flex-col">
            {(saveError || conflictState) && (
              <div className="border-b ui-border px-3 py-2 text-xs">
                {saveError && <p className="text-red-500">{saveError}</p>}
                {conflictState && (
                  <div className="flex items-center justify-between gap-2 text-amber-500">
                    <span>File modified externally.</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleMergeAfterConflict}
                        className="px-2 py-1 rounded bg-violet-500/10 hover:bg-violet-500/20"
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        onClick={handleReloadFromDisk}
                        className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20"
                      >
                        Reload
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <textarea
              value={activeTab.content || ''}
              onChange={e => {
                updateTabContent(activeTab.id, e.target.value)
                setConflictState(null)
                setSaveError(null)
              }}
              className="flex-1 w-full resize-none bg-[var(--bg-primary)] text-[var(--text-primary)] p-3 font-mono text-sm outline-none"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function renderContent(artifact: Artifact | null) {
  if (!artifact) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-[var(--text-muted)] bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <Maximize2 className="w-12 h-12 opacity-20" />
          <div className="text-center">
            <p className="font-medium">No artifact selected</p>
            <p className="text-xs opacity-70 mt-1">Select a file from the artifact rail</p>
          </div>
        </div>
      </div>
    )
  }

  if (
    !artifact.content &&
    artifact.type !== 'image' &&
    artifact.type !== 'data' &&
    !artifact.path.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)
  ) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span>Loading content...</span>
        </div>
      </div>
    )
  }

  const ext = artifact.path.split('.').pop()?.toLowerCase() || ''

  if (artifact.type === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
    return <ImagePreview content={artifact.content || ''} />
  }

  if (ext === 'md' || ext === 'txt') {
    return <MarkdownPreview content={artifact.content || ''} />
  }

  if (ext === 'json' || artifact.type === 'data') {
    return <JsonPreview content={artifact.content || ''} />
  }

  return <CodePreview content={artifact.content || ''} language={ext || 'text'} />
}

import React from 'react'
import { BrowserViewer } from './BrowserViewer'
import { useCanvasLifecycle } from '../../hooks/useCanvasLifecycle'
import { useArtifactStore } from '../../store/artifact.store'
import { useDataStore } from '../../store/data.store'
import { useUIStore } from '../../store/ui.store'
import {
  X,
  Globe,
  Copy,
  Download,
  Trash2,
  Maximize2,
  Loader2,
  PanelRight,
  PanelBottom
} from 'lucide-react'
import { CodePreview } from '../artifact/previews/CodePreview'
import { MarkdownPreview } from '../artifact/previews/MarkdownPreview'
import { ImagePreview } from '../artifact/previews/ImagePreview'
import { JsonPreview } from '../artifact/previews/JsonPreview'
import { Artifact } from '../../types/domain'

export function ContentCanvas() {
  const { tabs, activeTab, isOpen, closeTab, setOpen, switchTab } = useCanvasLifecycle()
  const { selectedArtifact, downloadArtifact, deleteArtifact } = useArtifactStore()
  const { currentSpaceId } = useDataStore()
  const { showContentCanvas, toggleContentCanvas, activeView } = useUIStore()

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
              <span className="text-sm truncate max-w-[150px]">{tab.title}</span>
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

      <div className="flex-1 min-h-0">
        {activeTab.type === 'browser' && <BrowserViewer tab={activeTab} />}
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

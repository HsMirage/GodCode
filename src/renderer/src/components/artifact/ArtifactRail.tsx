import React, { useState, useEffect, useCallback } from 'react'
import { Artifact, Session, Space } from '../../../../types/domain'
import { FileTree } from './FileTree'
import { CodePreview } from './previews/CodePreview'
import { MarkdownPreview } from './previews/MarkdownPreview'
import { ImagePreview } from './previews/ImagePreview'
import { JsonPreview } from './previews/JsonPreview'
import { Copy, Download, Trash2, Maximize2, Loader2, AlertCircle } from 'lucide-react'

interface ArtifactRailProps {
  sessionId: string
  className?: string
}

export const ArtifactRail: React.FC<ArtifactRailProps> = ({ sessionId, className = '' }) => {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchArtifacts = useCallback(async () => {
    if (!sessionId) return
    try {
      setLoading(true)
      setError(null)
      const result = await window.codeall.invoke('artifact:list', sessionId)
      if (Array.isArray(result)) {
        setArtifacts(result)
      } else {
        console.error('Expected array of artifacts, got:', result)
        setArtifacts([])
      }
    } catch (err) {
      console.error('Failed to fetch artifacts:', err)
      setError('Failed to load artifacts')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchArtifacts()
  }, [fetchArtifacts])

  const handleCopy = async () => {
    if (!selectedArtifact?.content) return
    try {
      await navigator.clipboard.writeText(selectedArtifact.content)
    } catch (err) {
      console.error('Failed to copy content:', err)
    }
  }

  const handleDownload = async () => {
    if (!selectedArtifact) return
    try {
      const session = (await window.codeall.invoke('session:get', sessionId)) as Session
      if (!session || !session.spaceId) throw new Error('Session not found')

      const space = (await window.codeall.invoke('space:get', session.spaceId)) as Space
      if (!space || !space.workDir) throw new Error('Space not found')

      await window.codeall.invoke('artifact:download', selectedArtifact.id, space.workDir)
    } catch (err) {
      console.error('Failed to download artifact:', err)
    }
  }

  const handleDelete = async () => {
    if (!selectedArtifact) return
    if (!confirm('Are you sure you want to delete this artifact?')) return

    try {
      await window.codeall.invoke('artifact:delete', selectedArtifact.id)
      setSelectedArtifact(null)
      fetchArtifacts()
    } catch (err) {
      console.error('Failed to delete artifact:', err)
    }
  }

  const renderPreview = (artifact: Artifact) => {
    if (!artifact.content && artifact.type !== 'image') {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          No content available
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

  return (
    <div className={`flex h-full gap-4 overflow-hidden ${className}`}>
      <div className="w-[30%] min-w-[200px] flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-lg">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 p-4 text-center">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm">{error}</span>
            <button
              type="button"
              onClick={() => fetchArtifacts()}
              className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <FileTree artifacts={artifacts} onFileClick={setSelectedArtifact} className="h-full" />
        )}
      </div>

      <div className="w-[70%] flex flex-col bg-white/5 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden relative group">
        {selectedArtifact ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
              <div
                className="text-xs font-mono text-white/70 truncate max-w-[300px]"
                title={selectedArtifact.path}
              >
                {selectedArtifact.path}
              </div>
              <div className="flex items-center gap-1 opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                  title="Copy content"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
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
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-black/20">
              {renderPreview(selectedArtifact)}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
            <Maximize2 className="w-12 h-12 opacity-20" />
            <div className="text-sm font-medium">Select an artifact to preview</div>
          </div>
        )}
      </div>
    </div>
  )
}

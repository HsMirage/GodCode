import React, { useEffect } from 'react'
import { Artifact } from '../../types/domain'
import { FileTree } from './FileTree'
import { Loader2, AlertCircle } from 'lucide-react'
import { useArtifactStore } from '../../store/artifact.store'
import { useDataStore } from '../../store/data.store'
import { useUIStore } from '../../store/ui.store'

interface ArtifactRailProps {
  sessionId?: string | null
  className?: string
}

export const ArtifactRail: React.FC<ArtifactRailProps> = ({ sessionId, className = '' }) => {
  const { currentSessionId } = useDataStore()
  const activeSessionId = sessionId ?? currentSessionId
  const { setView } = useUIStore()
  const { artifacts, isLoading, error, loadArtifacts, selectArtifact } = useArtifactStore()

  useEffect(() => {
    if (activeSessionId) {
      loadArtifacts(activeSessionId)
    }
  }, [activeSessionId, loadArtifacts])

  const handleArtifactSelect = async (artifact: Artifact) => {
    await selectArtifact(artifact)
    // Switch to canvas view to show the preview
    setView('canvas')
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      <div className="flex-1 min-h-0 relative">
        {isLoading && artifacts.length === 0 && (
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
              onClick={() => activeSessionId && loadArtifacts(activeSessionId)}
              className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <FileTree
            artifacts={artifacts}
            onFileClick={handleArtifactSelect}
            className="h-full border-0 rounded-none bg-transparent"
          />
        )}
      </div>
    </div>
  )
}

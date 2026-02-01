import { X, Globe } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { CodePreview } from '../artifacts/CodePreview'
import { MarkdownPreview } from '../artifacts/MarkdownPreview'
import { MediaPreview } from '../artifacts/MediaPreview'

const useArtifactStore = () => {
  return {
    selectedArtifact: null as any
  }
}

export function ContentCanvas() {
  const { toggleContentCanvas } = useUIStore()
  const selectedArtifact = null as any

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800">
      <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Globe className="w-4 h-4" />
          <span>{selectedArtifact ? selectedArtifact.name : 'Browser Preview'}</span>
        </div>
        <button
          type="button"
          onClick={toggleContentCanvas}
          className="text-slate-400 hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">{renderContent(selectedArtifact)}</div>
    </div>
  )
}

function renderContent(artifact: any) {
  if (!artifact) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-slate-500 bg-slate-900">
        <div className="text-center">
          <p>Preview Content</p>
          <p className="text-xs opacity-70">No artifact selected</p>
        </div>
      </div>
    )
  }

  switch (artifact.type) {
    case 'code':
      return <CodePreview content={artifact.content} fileName={artifact.name} />
    case 'markdown':
      return <MarkdownPreview content={artifact.content} />
    case 'image':
    case 'html':
      return <MediaPreview artifact={artifact} />
    default:
      return (
        <div className="flex items-center justify-center h-full text-slate-500">
          Unsupported file type
        </div>
      )
  }
}

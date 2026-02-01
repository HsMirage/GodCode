import { FileCode, X } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'

export function ArtifactRail() {
  const { toggleArtifactRail } = useUIStore()

  const artifacts = [
    { id: '1', name: 'App.tsx', type: 'code', path: 'src/App.tsx' },
    { id: '2', name: 'styles.css', type: 'code', path: 'src/styles.css' },
    { id: '3', name: 'README.md', type: 'file', path: 'README.md' }
  ]

  return (
    <div className="h-full flex flex-col bg-slate-950 border-l border-slate-800">
      <div className="h-10 border-b border-slate-800 flex items-center justify-between px-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Artifacts
        </span>
        <button
          type="button"
          onClick={toggleArtifactRail}
          className="text-slate-400 hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {artifacts.map(artifact => (
          <button
            type="button"
            key={artifact.id}
            className="w-full flex items-center gap-2 px-2 py-2 rounded text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors text-left"
          >
            <FileCode className="w-4 h-4" />
            <div className="flex-1 truncate">
              <div className="text-slate-200">{artifact.name}</div>
              <div className="text-xs text-slate-600 truncate">{artifact.path}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

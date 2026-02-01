import { X } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { FileTree, FileNode } from '../artifacts/FileTree'

export function ArtifactRail() {
  const { toggleArtifactRail } = useUIStore()

  const artifacts: FileNode[] = [
    {
      id: '1',
      name: 'src',
      path: 'src',
      type: 'folder',
      children: [
        { id: '2', name: 'App.tsx', path: 'src/App.tsx', type: 'file', fileType: 'code' },
        { id: '3', name: 'styles.css', path: 'src/styles.css', type: 'file', fileType: 'code' }
      ]
    },
    { id: '4', name: 'README.md', path: 'README.md', type: 'file', fileType: 'markdown' },
    { id: '5', name: 'package.json', path: 'package.json', type: 'file', fileType: 'json' }
  ]

  const handleSelect = (node: FileNode) => {
    console.log('Selected:', node)
  }

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

      <div className="flex-1 overflow-y-auto p-2">
        <FileTree nodes={artifacts} onSelect={handleSelect} />
      </div>
    </div>
  )
}

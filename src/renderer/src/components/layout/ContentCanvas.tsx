import { X, Globe } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'

export function ContentCanvas() {
  const { toggleContentCanvas } = useUIStore()

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800">
      <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Globe className="w-4 h-4" />
          <span>Browser Preview</span>
        </div>
        <button
          type="button"
          onClick={toggleContentCanvas}
          className="text-slate-400 hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center text-slate-500 bg-white">
        <div className="text-center">
          <p>Preview Content</p>
          <p className="text-xs opacity-70">No content loaded</p>
        </div>
      </div>
    </div>
  )
}

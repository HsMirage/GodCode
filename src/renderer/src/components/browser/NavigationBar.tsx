import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'

interface NavigationBarProps {
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
}

export function NavigationBar({ onBack, onForward, onReload, onStop }: NavigationBarProps) {
  const { canGoBack, canGoForward, isBrowserLoading } = useUIStore()

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!canGoBack}
        onClick={onBack}
        className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Go Back"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      <button
        type="button"
        disabled={!canGoForward}
        onClick={onForward}
        className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Go Forward"
      >
        <ArrowRight className="w-4 h-4" />
      </button>

      {isBrowserLoading ? (
        <button
          type="button"
          onClick={onStop}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Stop Loading"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onReload}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Reload Page"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

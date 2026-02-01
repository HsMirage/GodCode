import { Camera, Bug, ZoomIn, ZoomOut, Maximize } from 'lucide-react'

interface ToolbarProps {
  onScreenshot: () => void
  onToggleDevTools: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  zoomLevel: number
}

export function Toolbar({
  onScreenshot,
  onToggleDevTools,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  zoomLevel
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 pl-2 border-l border-slate-700/50">
      <div className="flex items-center gap-0.5 mr-2">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="px-1 text-xs text-slate-500 hover:text-slate-300 min-w-[3ch] text-center font-mono"
          title="Reset Zoom"
        >
          {Math.round(zoomLevel * 100)}%
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onScreenshot}
        className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        title="Take Screenshot"
      >
        <Camera className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onToggleDevTools}
        className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        title="Toggle Developer Tools"
      >
        <Bug className="w-4 h-4" />
      </button>
    </div>
  )
}

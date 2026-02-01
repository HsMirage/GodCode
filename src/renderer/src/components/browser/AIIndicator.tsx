import { Loader2, Sparkles } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'

export function AIIndicator() {
  const { isAIOperating } = useUIStore()

  if (!isAIOperating) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-lg animate-pulse">
      <div className="relative">
        <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
        <div className="absolute inset-0 bg-indigo-400/20 blur-sm rounded-full animate-pulse" />
      </div>
      <span className="text-xs font-medium text-indigo-300 flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        AI Navigating...
      </span>
    </div>
  )
}

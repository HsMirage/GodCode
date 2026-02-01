import { useState, useEffect } from 'react'
import { Lock, AlertTriangle, Search } from 'lucide-react'
import { useUIStore } from '../../store/ui.store'

interface AddressBarProps {
  onNavigate: (url: string) => void
}

export function AddressBar({ onNavigate }: AddressBarProps) {
  const { browserUrl, isBrowserLoading } = useUIStore()
  const [inputUrl, setInputUrl] = useState(browserUrl)

  // Sync input with store when not editing or when changed externally
  useEffect(() => {
    setInputUrl(browserUrl)
  }, [browserUrl])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputUrl.trim()) {
      onNavigate(inputUrl)
    }
  }

  const isSecure = browserUrl.startsWith('https://') || browserUrl.startsWith('file://')

  return (
    <form onSubmit={handleSubmit} className="flex-1">
      <div
        className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors
        ${isBrowserLoading ? 'bg-slate-800/50 border-indigo-500/30' : 'bg-slate-900 border-slate-700'}
        focus-within:border-indigo-500/50 focus-within:bg-slate-900
      `}
      >
        {browserUrl ? (
          isSecure ? (
            <Lock className="w-3.5 h-3.5 text-green-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          )
        ) : (
          <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        )}

        <input
          type="text"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onFocus={e => e.target.select()}
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none min-w-0"
          placeholder="Enter URL or search..."
        />

        {/* Optional: Add clear button if needed, keeping it minimal for now */}
      </div>
    </form>
  )
}

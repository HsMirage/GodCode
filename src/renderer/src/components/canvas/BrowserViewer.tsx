import { useRef, useEffect, useCallback, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Home, X } from 'lucide-react'
import { canvasLifecycle, type TabState } from '../../services/canvas-lifecycle'
import { useBrowserState } from '../../hooks/useCanvasLifecycle'
import { api } from '../../api'

interface BrowserViewerProps {
  tab: TabState
}

export function BrowserViewer({ tab }: BrowserViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [addressBarValue, setAddressBarValue] = useState(tab.url || '')
  const browserState = useBrowserState(tab.id)

  useEffect(() => {
    const getBounds = () => containerRef.current?.getBoundingClientRect() || null
    canvasLifecycle.setContainerBoundsGetter(getBounds)

    if (containerRef.current && tab.browserViewId) {
      canvasLifecycle.ensureActiveBrowserViewShown()
    }
  }, [tab.browserViewId])

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (tab.browserViewId) {
        canvasLifecycle.updateActiveBounds()
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [tab.browserViewId])

  useEffect(() => {
    if (tab.url) {
      setAddressBarValue(tab.url)
    }
  }, [tab.url])

  const handleNavigate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!tab.browserViewId) return

      let url = addressBarValue.trim()
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`
      }

      await api.navigateBrowserView(tab.browserViewId, url)
    },
    [tab.browserViewId, addressBarValue]
  )

  const handleBack = useCallback(async () => {
    if (tab.browserViewId && browserState.canGoBack) {
      await api.browserGoBack(tab.browserViewId)
    }
  }, [tab.browserViewId, browserState.canGoBack])

  const handleForward = useCallback(async () => {
    if (tab.browserViewId && browserState.canGoForward) {
      await api.browserGoForward(tab.browserViewId)
    }
  }, [tab.browserViewId, browserState.canGoForward])

  const handleReload = useCallback(async () => {
    if (!tab.browserViewId) return
    if (browserState.isLoading) {
      await api.browserStop(tab.browserViewId)
    } else {
      await api.browserReload(tab.browserViewId)
    }
  }, [tab.browserViewId, browserState.isLoading])

  const handleHome = useCallback(async () => {
    if (tab.browserViewId) {
      await api.navigateBrowserView(tab.browserViewId, 'https://www.google.com')
    }
  }, [tab.browserViewId])

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/50">
        <button
          type="button"
          onClick={handleBack}
          disabled={!browserState.canGoBack}
          className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="后退"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleForward}
          disabled={!browserState.canGoForward}
          className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="前进"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleReload}
          className="p-1.5 rounded hover:bg-slate-800 transition-colors"
          title={browserState.isLoading ? '停止' : '刷新'}
        >
          {browserState.isLoading ? <X className="w-4 h-4" /> : <RotateCw className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={handleHome}
          className="p-1.5 rounded hover:bg-slate-800 transition-colors"
          title="主页"
        >
          <Home className="w-4 h-4" />
        </button>

        <form onSubmit={handleNavigate} className="flex-1">
          <input
            type="text"
            value={addressBarValue}
            onChange={e => setAddressBarValue(e.target.value)}
            placeholder="输入URL..."
            className="w-full px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700 text-sm outline-none focus:border-sky-500 transition-colors"
          />
        </form>
      </div>

      <div ref={containerRef} className="flex-1 relative bg-white" style={{ minHeight: '200px' }}>
        {!tab.browserViewId && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-400">正在打开...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui.store'
import { AddressBar } from './AddressBar'
import { NavigationBar } from './NavigationBar'
import { Toolbar } from './Toolbar'
import { AIIndicator } from './AIIndicator'

export function BrowserShell() {
  const browserRef = useRef<HTMLDivElement>(null)
  const { setBrowserUrl, setBrowserNavState, setAIOperating } = useUIStore()

  const [zoomLevel, setZoomLevel] = useState(1)
  const viewId = 'main-browser' // Single view for now

  // Initialize browser view
  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[BrowserShell] window.codeall not available, browser will be disabled')
      return
    }

    const initBrowser = async () => {
      // Create browser view
      await window.codeall.invoke('browser:create', { viewId, url: 'https://google.com' })

      // Setup state listener
      const removeListener = window.codeall.on('browser:state-changed' as any, (data: any) => {
        if (data.viewId === viewId) {
          const { url, canGoBack, canGoForward, isLoading, zoomLevel } = data.state
          setBrowserUrl(url)
          setBrowserNavState({ canGoBack, canGoForward, isLoading })
          if (zoomLevel) setZoomLevel(zoomLevel)
        }
      })

      return removeListener
    }

    const cleanup = initBrowser()

    return () => {
      cleanup.then(remove => remove && remove())
      window.codeall?.invoke('browser:destroy', { viewId })
    }
  }, [setBrowserUrl, setBrowserNavState])

  // Handle Resize
  useEffect(() => {
    if (!browserRef.current || !window.codeall) return

    const updateBounds = () => {
      if (!browserRef.current || !window.codeall) return
      const rect = browserRef.current.getBoundingClientRect()
      window.codeall.invoke('browser:show', {
        viewId,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      })
    }

    const observer = new ResizeObserver(updateBounds)
    observer.observe(browserRef.current)

    // Initial show
    updateBounds()

    return () => observer.disconnect()
  }, [])

  // Actions
  const handleNavigate = useCallback((url: string) => {
    window.codeall?.invoke('browser:navigate', { viewId, url })
  }, [])

  const handleBack = useCallback(() => window.codeall?.invoke('browser:go-back', { viewId }), [])
  const handleForward = useCallback(
    () => window.codeall?.invoke('browser:go-forward', { viewId }),
    []
  )
  const handleReload = useCallback(() => window.codeall?.invoke('browser:reload', { viewId }), [])
  const handleStop = useCallback(() => window.codeall?.invoke('browser:stop', { viewId }), [])

  const handleScreenshot = useCallback(async () => {
    const result = await window.codeall?.invoke('browser:capture', { viewId })
    console.log('Screenshot taken', result)
    // TODO: Show preview or save
  }, [])

  const handleToggleDevTools = useCallback(
    () => window.codeall?.invoke('browser:toggle-devtools', { viewId }),
    []
  )

  const handleZoom = useCallback((level: number) => {
    window.codeall?.invoke('browser:zoom', { viewId, level })
    setZoomLevel(level)
  }, [])

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-950">
        <NavigationBar
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onStop={handleStop}
        />

        <AddressBar onNavigate={handleNavigate} />

        <AIIndicator />

        <Toolbar
          onScreenshot={handleScreenshot}
          onToggleDevTools={handleToggleDevTools}
          onZoomIn={() => handleZoom(zoomLevel + 0.1)}
          onZoomOut={() => handleZoom(zoomLevel - 0.1)}
          onResetZoom={() => handleZoom(1)}
          zoomLevel={zoomLevel}
        />
      </div>

      {/* Browser View Container */}
      <div className="flex-1 relative bg-white" ref={browserRef}>
        {/* Electron BrowserView will be overlayed here */}
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 bg-slate-100">
          <span className="animate-pulse">Loading Browser View...</span>
        </div>
      </div>
    </div>
  )
}

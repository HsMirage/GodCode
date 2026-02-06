import { useEffect, useRef, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui.store'
import { AddressBar } from './AddressBar'
import { NavigationBar } from './NavigationBar'
import { Toolbar } from './Toolbar'
import { AIIndicator } from './AIIndicator'
import { Plus, X } from 'lucide-react'
import { cn } from '../../utils'

export function BrowserShell() {
  const browserRef = useRef<HTMLDivElement>(null)
  const {
    setBrowserUrl,
    setBrowserNavState,
    setAIOperation,
    browserTabs,
    activeBrowserTabId,
    setBrowserTabs,
    setActiveBrowserTab
  } = useUIStore()

  const [zoomLevel, setZoomLevel] = useState(1)

  // Sync tabs from backend
  const syncTabs = useCallback(async () => {
    if (!window.codeall) return
    try {
      const result = (await window.codeall.invoke('browser:list-tabs')) as any
      if (result.success) {
        setBrowserTabs(result.data)
        // If no active tab but we have tabs, set first as active
        if (!activeBrowserTabId && result.data.length > 0) {
          setActiveBrowserTab(result.data[0].id)
        }
      }
    } catch (e) {
      console.error('Failed to sync tabs:', e)
    }
  }, [setBrowserTabs, activeBrowserTabId, setActiveBrowserTab])

  // Initial tab creation
  useEffect(() => {
    if (!window.codeall) return

    const init = async () => {
      // Get initial tabs
      await syncTabs()

      // If no tabs exist, create one
      if (browserTabs.length === 0) {
        const viewId = `tab-${Date.now()}`
        await window.codeall.invoke('browser:create', { viewId, url: 'https://google.com' })
        setActiveBrowserTab(viewId)
        await syncTabs()
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle active tab view management
  useEffect(() => {
    if (!activeBrowserTabId || !window.codeall) return

    const setupTab = async () => {
      // Ensure the view exists or create it if missing (recovery)
      await window.codeall.invoke('browser:create', {
        viewId: activeBrowserTabId,
        url: undefined // Reuse existing URL if alive
      })

      // Show the active view
      if (browserRef.current) {
        const rect = browserRef.current.getBoundingClientRect()
        window.codeall.invoke('browser:show', {
          viewId: activeBrowserTabId,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        })
      }

      // Update local state from backend
      const stateResult = (await window.codeall.invoke('browser:get-state', {
        viewId: activeBrowserTabId
      })) as any
      if (stateResult.success) {
        const { url, canGoBack, canGoForward, isLoading, zoomLevel } = stateResult.data
        setBrowserUrl(url)
        setBrowserNavState({ canGoBack, canGoForward, isLoading })
        if (zoomLevel) setZoomLevel(zoomLevel)
      }
    }

    setupTab()

    // Setup listeners
    const removeStateListener = window.codeall.on('browser:state-changed' as any, (data: any) => {
      // Update tabs list data
      syncTabs()

      // Update active tab state
      if (data.viewId === activeBrowserTabId) {
        const { url, canGoBack, canGoForward, isLoading, zoomLevel } = data.state
        setBrowserUrl(url)
        setBrowserNavState({ canGoBack, canGoForward, isLoading })
        if (zoomLevel) setZoomLevel(zoomLevel)
      }
    })

    const removeAIListener = window.codeall.on('browser:ai-operation', data => {
      setAIOperation(data.toolName, data.status)
      if (data.status === 'completed' || data.status === 'error') {
        setTimeout(() => {
          setAIOperation(null, 'idle')
        }, 2000)
      }
    })

    return () => {
      removeStateListener()
      removeAIListener()
    }
  }, [activeBrowserTabId, setBrowserUrl, setBrowserNavState, setAIOperation, syncTabs])

  // Handle Resize
  useEffect(() => {
    if (!browserRef.current || !window.codeall || !activeBrowserTabId) return

    const updateBounds = () => {
      if (!browserRef.current || !window.codeall || !activeBrowserTabId) return
      const rect = browserRef.current.getBoundingClientRect()
      window.codeall.invoke('browser:resize', {
        viewId: activeBrowserTabId,
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
    updateBounds()

    return () => observer.disconnect()
  }, [activeBrowserTabId])

  // Actions
  const handleNewTab = async () => {
    const viewId = `tab-${Date.now()}`
    await window.codeall?.invoke('browser:create', { viewId, url: 'https://google.com' })
    await syncTabs()
    setActiveBrowserTab(viewId)
  }

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    await window.codeall?.invoke('browser:destroy', { viewId: tabId })
    await syncTabs()

    if (activeBrowserTabId === tabId) {
      // Select next available tab
      const remaining = browserTabs.filter(t => t.id !== tabId)
      if (remaining.length > 0) {
        setActiveBrowserTab(remaining[remaining.length - 1].id)
      } else {
        setActiveBrowserTab(null as any)
      }
    }
  }

  const handleTabClick = (tabId: string) => {
    setActiveBrowserTab(tabId)
  }

  const handleNavigate = useCallback(
    (url: string) => {
      if (activeBrowserTabId) {
        window.codeall?.invoke('browser:navigate', { viewId: activeBrowserTabId, url })
      }
    },
    [activeBrowserTabId]
  )

  const handleBack = useCallback(
    () =>
      activeBrowserTabId &&
      window.codeall?.invoke('browser:go-back', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )
  const handleForward = useCallback(
    () =>
      activeBrowserTabId &&
      window.codeall?.invoke('browser:go-forward', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )
  const handleReload = useCallback(
    () =>
      activeBrowserTabId &&
      window.codeall?.invoke('browser:reload', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )
  const handleStop = useCallback(
    () =>
      activeBrowserTabId && window.codeall?.invoke('browser:stop', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )

  const handleScreenshot = useCallback(async () => {
    if (!activeBrowserTabId) return
    const result = await window.codeall?.invoke('browser:capture', { viewId: activeBrowserTabId })
    console.log('Screenshot taken', result)
  }, [activeBrowserTabId])

  const handleToggleDevTools = useCallback(
    () =>
      activeBrowserTabId &&
      window.codeall?.invoke('browser:toggle-devtools', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )

  const handleZoom = useCallback(
    (level: number) => {
      if (activeBrowserTabId) {
        window.codeall?.invoke('browser:zoom', { viewId: activeBrowserTabId, level })
        setZoomLevel(level)
      }
    },
    [activeBrowserTabId]
  )

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Tabs Bar */}
      <div className="flex items-center bg-slate-900 border-b border-slate-800 pt-1 px-1 gap-1 overflow-x-auto no-scrollbar">
        {browserTabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'group flex items-center gap-2 px-3 py-1.5 min-w-[120px] max-w-[200px] text-xs rounded-t-md cursor-pointer select-none transition-colors relative',
              activeBrowserTabId === tab.id
                ? 'bg-slate-800 text-slate-200'
                : 'bg-slate-950 text-slate-500 hover:bg-slate-900 hover:text-slate-400'
            )}
          >
            <div className="flex-1 truncate">{tab.title || 'New Tab'}</div>
            <button
              onClick={e => handleCloseTab(e, tab.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded transition-opacity"
            >
              <X size={12} />
            </button>
            {activeBrowserTabId === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </div>
        ))}
        <button
          onClick={handleNewTab}
          className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

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
          {!activeBrowserTabId ? (
            <div className="flex flex-col items-center gap-4">
              <span>No tabs open</span>
              <button
                onClick={handleNewTab}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Open New Tab
              </button>
            </div>
          ) : (
            <span className="animate-pulse">Loading Browser View...</span>
          )}
        </div>
      </div>
    </div>
  )
}

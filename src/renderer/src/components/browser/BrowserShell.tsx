import { useEffect, useRef, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui.store'
import { AddressBar } from './AddressBar'
import { NavigationBar } from './NavigationBar'
import { Toolbar } from './Toolbar'
import { AIIndicator } from './AIIndicator'
import { Plus, X, List, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../../utils'
import { OperationLogEntry } from '../../store/ui.store'

export function BrowserShell() {
  const browserRef = useRef<HTMLDivElement>(null)
  const {
    setBrowserUrl,
    setBrowserNavState,
    setAIOperation,
    browserTabs,
    activeBrowserTabId,
    setBrowserTabs,
    setActiveBrowserTab,
    isBrowserPanelOpen,
    openBrowserPanel,
    browserOperationHistory,
    addBrowserOperation
  } = useUIStore()

  const [zoomLevel, setZoomLevel] = useState(1)
  const [showLogs, setShowLogs] = useState(false)

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

      // Show the active view (only if panel is currently open)
      if (isBrowserPanelOpen && browserRef.current) {
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

      // Auto open panel and add log
      if (data.status === 'running') {
        openBrowserPanel()
        // Ensure logs are visible when AI is operating
        setShowLogs(true)
      }

      // Add operation to history
      addBrowserOperation({
        id: Date.now().toString(),
        timestamp: Date.now(),
        action: data.toolName,
        target: ((data as any).args && JSON.stringify((data as any).args)) || undefined,
        status: data.status === 'error' ? 'failed' : data.status
      })

      if (data.status === 'completed' || data.status === 'error') {
        setTimeout(() => {
          setAIOperation(null, 'idle')
        }, 2000)
      }
    })

    return () => {
      // Ensure BrowserView is detached on unmount / tab switch
      window.codeall?.invoke('browser:hide', { viewId: activeBrowserTabId })
      removeStateListener()
      removeAIListener()
    }
  }, [
    activeBrowserTabId,
    setBrowserUrl,
    setBrowserNavState,
    setAIOperation,
    syncTabs,
    addBrowserOperation,
    openBrowserPanel,
    isBrowserPanelOpen
  ])

  // Hide/show the BrowserView when panel is toggled
  useEffect(() => {
    if (!activeBrowserTabId || !window.codeall) return

    if (!isBrowserPanelOpen) {
      window.codeall.invoke('browser:hide', { viewId: activeBrowserTabId })
      return
    }

    if (browserRef.current) {
      const rect = browserRef.current.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
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
    }
  }, [activeBrowserTabId, isBrowserPanelOpen])

  // Handle visibility changes to hide browser view when overlays are present
  useEffect(() => {
    if (!activeBrowserTabId || !window.codeall) return

    // Function to check if any overlay is open
    const checkOverlays = () => {
      // Check for common overlay classes or attributes in React Portals
      // This is a heuristic - we might need to be more specific based on UI library
      const hasOverlay = document.querySelector(
        '[data-radix-portal], .dialog-overlay, .modal-overlay, [role="dialog"]'
      )

      if (hasOverlay) {
        // Temporarily hide browser view
        window.codeall.invoke('browser:hide', { viewId: activeBrowserTabId })
      } else {
        // Restore browser view
        if (browserRef.current) {
          const rect = browserRef.current.getBoundingClientRect()
          // Only show if we are actually in the browser tab and visible
          if (rect.width > 0 && rect.height > 0) {
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
        }
      }
    }

    // Set up a mutation observer to watch for body changes (portals usually append to body)
    const observer = new MutationObserver(checkOverlays)
    observer.observe(document.body, { childList: true, subtree: true })

    // Also check on mount
    checkOverlays()

    return () => observer.disconnect()
  }, [activeBrowserTabId])

  // Handle Resize
  useEffect(() => {
    if (!browserRef.current || !window.codeall || !activeBrowserTabId) return
    if (!isBrowserPanelOpen) return

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
  }, [activeBrowserTabId, isBrowserPanelOpen])

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
        <button
          onClick={() => setShowLogs(!showLogs)}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            showLogs
              ? 'text-blue-400 bg-blue-500/10'
              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
          )}
          title="Toggle Operation Logs"
        >
          <List size={16} />
        </button>
      </div>

      {/* Main Content Area: Browser + Logs */}
      <div className="flex-1 flex relative overflow-hidden">
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

        {/* Operation Logs Panel */}
        {showLogs && (
          <div className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
              <Clock size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Operation History</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {browserOperationHistory.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  No operations recorded
                </div>
              ) : (
                browserOperationHistory.map(entry => <LogItem key={entry.id} entry={entry} />)
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LogItem({ entry }: { entry: OperationLogEntry }) {
  const getIcon = () => {
    switch (entry.status) {
      case 'running':
        return <Loader2 size={14} className="text-blue-400 animate-spin" />
      case 'completed':
        return <CheckCircle2 size={14} className="text-emerald-400" />
      case 'failed':
        return <AlertCircle size={14} className="text-rose-400" />
      default:
        return <Clock size={14} className="text-slate-500" />
    }
  }

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="p-3 rounded bg-slate-900 border border-slate-800 flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="font-medium text-slate-200 capitalize">
            {entry.action.replace('browser_', '').replace(/_/g, ' ')}
          </span>
        </div>
        <span className="text-slate-500 text-[10px]">{formatTime(entry.timestamp)}</span>
      </div>

      {entry.target && (
        <div
          className="text-slate-400 font-mono bg-slate-950 p-1.5 rounded truncate"
          title={entry.target}
        >
          {entry.target}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui.store'
import { AddressBar } from './AddressBar'
import { NavigationBar } from './NavigationBar'
import { Toolbar } from './Toolbar'
import { AIIndicator } from './AIIndicator'
import { Plus, X, List, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../../utils'
import { UI_TEXT } from '../../constants/i18n'
import { OperationLogEntry } from '../../store/ui.store'
import {
  createBrowserPanelLifecycle,
  type BrowserLifecycleBounds
} from '../panels/browser-panel-lifecycle'

interface BrowserTabRecord {
  id: string
  title: string
  url: string
  isLoading: boolean
}

interface BrowserTabListResponse {
  success?: boolean
  data?: BrowserTabRecord[]
}

interface BrowserStatePayload {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  zoomLevel?: number
}

interface BrowserStateResponse {
  success?: boolean
  data?: BrowserStatePayload | null
}

interface BrowserStateChangedEvent {
  viewId: string
  state: BrowserStatePayload
}

interface BrowserAIOperationEvent {
  viewId?: string
  toolName: string
  status: 'idle' | 'running' | 'completed' | 'error'
  opId?: string
  timestamp?: number
  args?: Record<string, unknown>
  errorCode?: string
  durationMs?: number
}

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
    upsertBrowserOperation,
    browserHandoff,
    setBrowserManualControl
  } = useUIStore()

  const [zoomLevel, setZoomLevel] = useState(1)
  const [showLogs, setShowLogs] = useState(false)
  const [overlayBlocking, setOverlayBlocking] = useState(false)
  const activeTab = browserTabs.find(tab => tab.id === activeBrowserTabId) ?? null

  const browserLifecycleRef = useRef(
    createBrowserPanelLifecycle({
      create: async viewId => {
        await window.godcode?.invoke('browser:create', {
          viewId,
          url: undefined
        })
      },
      show: async (viewId, bounds) => {
        await window.godcode?.invoke('browser:show', {
          viewId,
          bounds
        })
      },
      hide: async viewId => {
        await window.godcode?.invoke('browser:hide', { viewId })
      },
      destroy: async viewId => {
        await window.godcode?.invoke('browser:destroy', { viewId })
      },
      resize: async (viewId, bounds) => {
        await window.godcode?.invoke('browser:resize', {
          viewId,
          bounds
        })
      }
    })
  )

  const getBrowserBounds = useCallback((): BrowserLifecycleBounds | null => {
    if (!browserRef.current) {
      return null
    }

    const rect = browserRef.current.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }
  }, [])

  const syncBrowserLifecycle = useCallback(async () => {
    if (!window.godcode) return

    await browserLifecycleRef.current.sync({
      panelOpen: isBrowserPanelOpen,
      activeViewId: activeBrowserTabId,
      bounds: getBrowserBounds(),
      canShow: !overlayBlocking
    })
  }, [activeBrowserTabId, getBrowserBounds, isBrowserPanelOpen, overlayBlocking])

  // Sync tabs from backend
  const syncTabs = useCallback(async () => {
    if (!window.godcode) return
    try {
      const result = (await window.godcode.invoke('browser:list-tabs')) as BrowserTabListResponse
      if (result.success) {
        const tabs = result.data ?? []
        setBrowserTabs(tabs)

        const hasActiveTab =
          !!activeBrowserTabId && tabs.some(tab => tab.id === activeBrowserTabId)

        if (!hasActiveTab) {
          setActiveBrowserTab(tabs[0]?.id ?? null)
        }
      }
    } catch (e) {
      console.error('Failed to sync tabs:', e)
    }
  }, [setBrowserTabs, activeBrowserTabId, setActiveBrowserTab])

  // Initial tab creation
  useEffect(() => {
    if (!window.godcode) return

    const init = async () => {
      // Read source-of-truth tabs list from backend (avoid stale closure on browserTabs)
      const result = (await window.godcode.invoke('browser:list-tabs')) as BrowserTabListResponse
      const tabs = result?.success ? (result.data ?? []) : []

      if (result?.success) {
        setBrowserTabs(tabs)
        if (!activeBrowserTabId && tabs.length > 0) {
          setActiveBrowserTab(tabs[0].id)
        }
      }

      // If no tabs exist in backend, create one
      if (tabs.length === 0) {
        const viewId = `tab-${Date.now()}`
        await window.godcode.invoke('browser:create', { viewId, url: 'https://google.com' })
        setActiveBrowserTab(viewId)
        await syncTabs()
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle active tab view management
  useEffect(() => {
    if (!window.godcode) return

    const setupTab = async () => {
      if (!activeBrowserTabId) {
        return
      }

      // Update local state from backend
      const stateResult = (await window.godcode.invoke('browser:get-state', {
        viewId: activeBrowserTabId
      })) as BrowserStateResponse
      if (stateResult.success && stateResult.data) {
        const { url, canGoBack, canGoForward, isLoading, zoomLevel } = stateResult.data
        setBrowserUrl(url)
        setBrowserNavState({ canGoBack, canGoForward, isLoading })
        if (zoomLevel) setZoomLevel(zoomLevel)
      }
    }

    setupTab()

    // Setup listeners
    const removeStateListener = window.godcode.on('browser:state-changed', (payload: unknown) => {
      const data = payload as BrowserStateChangedEvent

      syncTabs()

      if (data.viewId === activeBrowserTabId) {
        const { url, canGoBack, canGoForward, isLoading, zoomLevel } = data.state
        setBrowserUrl(url)
        setBrowserNavState({ canGoBack, canGoForward, isLoading })
        if (zoomLevel) setZoomLevel(zoomLevel)
      }
    })

    const removeAIListener = window.godcode.on('browser:ai-operation', (payload: unknown) => {
      const data = payload as BrowserAIOperationEvent
      setAIOperation(data.toolName, data.status)

      const hasManualControl =
        browserHandoff.isManualControl && browserHandoff.viewId && browserHandoff.viewId === activeBrowserTabId

      // Always switch to the BrowserView that AI is operating on unless user took manual control on this view
      if (data.viewId && data.viewId !== activeBrowserTabId && !hasManualControl) {
        setActiveBrowserTab(data.viewId)
      }

      // Auto open panel and add log
      if (data.status === 'running') {
        openBrowserPanel()
        // Ensure logs are visible when AI is operating
        setShowLogs(true)
      }

      if (data.status !== 'idle') {
        upsertBrowserOperation({
          id: data.opId || Date.now().toString(),
          timestamp: data.timestamp || Date.now(),
          action: data.toolName,
          target: (data.args && JSON.stringify(data.args)) || undefined,
          status: data.status === 'error' ? 'failed' : data.status,
          audit: {
            viewId: data.viewId,
            opId: data.opId,
            errorCode: data.errorCode,
            durationMs: data.durationMs,
            toolName: data.toolName,
            toolArgs: data.args,
            outcome: data.status
          }
        })
      }

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
  }, [
    activeBrowserTabId,
    setBrowserUrl,
    setBrowserNavState,
    setAIOperation,
    syncTabs,
    upsertBrowserOperation,
    openBrowserPanel,
    setActiveBrowserTab,
    browserHandoff
  ])

  useEffect(() => {
    void syncBrowserLifecycle()
  }, [syncBrowserLifecycle])

  // Handle visibility changes to hide browser view when overlays are present
  useEffect(() => {
    if (!window.godcode) return

    // Function to check if any overlay is open
    const checkOverlays = () => {
      // Check for common overlay classes or attributes in React Portals
      // This is a heuristic - we might need to be more specific based on UI library
      const hasOverlay = document.querySelector(
        '[data-radix-portal], .dialog-overlay, .modal-overlay, [role="dialog"]'
      )

      setOverlayBlocking(Boolean(hasOverlay))
    }

    // Set up a mutation observer to watch for body changes (portals usually append to body)
    const observer = new MutationObserver(checkOverlays)
    observer.observe(document.body, { childList: true, subtree: true })

    // Also check on mount
    checkOverlays()

    return () => observer.disconnect()
  }, [])

  // Handle Resize
  useEffect(() => {
    if (!browserRef.current || !window.godcode || !activeBrowserTabId) return
    if (!isBrowserPanelOpen) return

    const updateBounds = () => {
      void syncBrowserLifecycle()
    }

    const observer = new ResizeObserver(updateBounds)
    observer.observe(browserRef.current)
    updateBounds()

    return () => observer.disconnect()
  }, [activeBrowserTabId, isBrowserPanelOpen, syncBrowserLifecycle])

  useEffect(
    () => () => {
      void browserLifecycleRef.current.hideVisible('component-unmount')
    },
    []
  )

  // Actions
  const handleNewTab = async () => {
    const viewId = `tab-${Date.now()}`
    await window.godcode?.invoke('browser:create', { viewId, url: 'https://google.com' })
    await syncTabs()
    setActiveBrowserTab(viewId)
  }

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    await browserLifecycleRef.current.closeView(tabId)
    await syncTabs()

    if (activeBrowserTabId === tabId) {
      // Select next available tab
      const remaining = browserTabs.filter(t => t.id !== tabId)
      if (remaining.length > 0) {
        setActiveBrowserTab(remaining[remaining.length - 1].id)
      } else {
        setActiveBrowserTab(null)
      }
    }
  }

  const handleTabClick = (tabId: string) => {
    setActiveBrowserTab(tabId)
  }

  const handleNavigate = useCallback(
    (url: string) => {
      if (activeBrowserTabId) {
        window.godcode?.invoke('browser:navigate', { viewId: activeBrowserTabId, url })
      }
    },
    [activeBrowserTabId]
  )

  const handleBack = useCallback(
    () =>
      activeBrowserTabId &&
      window.godcode?.invoke('browser:go-back', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )
  const handleForward = useCallback(
    () =>
      activeBrowserTabId &&
      window.godcode?.invoke('browser:go-forward', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )
  const handleReload = useCallback(
    () =>
      activeBrowserTabId &&
      window.godcode?.invoke('browser:reload', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )
  const handleStop = useCallback(
    () =>
      activeBrowserTabId && window.godcode?.invoke('browser:stop', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )

  const handleScreenshot = useCallback(async () => {
    if (!activeBrowserTabId) return
    await window.godcode?.invoke('browser:capture', { viewId: activeBrowserTabId })
  }, [activeBrowserTabId])

  const handleTakeover = useCallback(() => {
    if (!activeBrowserTabId) return
    setBrowserManualControl(true, activeBrowserTabId)
  }, [activeBrowserTabId, setBrowserManualControl])

  const handleToggleDevTools = useCallback(
    () =>
      activeBrowserTabId &&
      window.godcode?.invoke('browser:toggle-devtools', { viewId: activeBrowserTabId }),
    [activeBrowserTabId]
  )

  const handleZoom = useCallback(
    (level: number) => {
      if (activeBrowserTabId) {
        window.godcode?.invoke('browser:zoom', { viewId: activeBrowserTabId, level })
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
            <div className="flex-1 truncate">{tab.title || UI_TEXT.browserShell.newTabFallbackTitle}</div>
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

        {browserHandoff.isManualControl && browserHandoff.viewId === activeBrowserTabId && (
          <div className="px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium">
            {UI_TEXT.browserShell.manualControlActive}
          </div>
        )}

        <AIIndicator />

        <Toolbar
          onScreenshot={handleScreenshot}
          onTakeover={handleTakeover}
          isManualControl={
            browserHandoff.isManualControl && browserHandoff.viewId === activeBrowserTabId
          }
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
          title={UI_TEXT.browserShell.toggleOperationLogs}
        >
          <List size={16} />
        </button>
      </div>

      {/* Main Content Area: Browser + Logs */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Browser View Container */}
        <div className="flex-1 relative bg-white" ref={browserRef}>
          {/* Electron BrowserView will be overlayed here */}
          {!activeBrowserTabId ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 bg-slate-100">
              <div className="flex flex-col items-center gap-4">
                <span>{UI_TEXT.browserShell.noTabsOpen}</span>
                <button
                  onClick={handleNewTab}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  {UI_TEXT.browserShell.openNewTab}
                </button>
              </div>
            </div>
          ) : activeTab?.isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 bg-slate-100">
              <span className="animate-pulse">{UI_TEXT.browserShell.loadingBrowserView}</span>
            </div>
          ) : null}
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

      {(entry.audit?.errorCode || entry.audit?.durationMs !== undefined || entry.audit?.viewId) && (
        <div className="text-[10px] text-slate-500 font-mono grid grid-cols-1 gap-0.5">
          {entry.audit?.viewId && <span>view: {entry.audit.viewId}</span>}
          {entry.audit?.errorCode && <span>error: {entry.audit.errorCode}</span>}
          {entry.audit?.durationMs !== undefined && <span>duration: {entry.audit.durationMs}ms</span>}
        </div>
      )}
    </div>
  )
}

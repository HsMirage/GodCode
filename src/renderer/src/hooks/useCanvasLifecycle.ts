import { useState, useEffect, useCallback } from 'react'
import {
  canvasLifecycle,
  type TabState,
  type BrowserState,
  type ContentType
} from '../services/canvas-lifecycle'

export function useCanvasLifecycle() {
  const [tabs, setTabs] = useState<TabState[]>(() => canvasLifecycle.getTabs())
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    canvasLifecycle.getActiveTabId()
  )
  const [isOpen, setIsOpen] = useState(() => canvasLifecycle.getIsOpen())

  useEffect(() => {
    const unsubTabs = canvasLifecycle.onTabsChange(setTabs)
    const unsubActive = canvasLifecycle.onActiveTabChange(setActiveTabId)
    const unsubOpen = canvasLifecycle.onOpenStateChange(setIsOpen)

    return () => {
      unsubTabs()
      unsubActive()
      unsubOpen()
    }
  }, [])

  const activeTab = activeTabId ? tabs.find(t => t.id === activeTabId) : undefined

  const openUrl = useCallback(
    (url: string, title?: string) => canvasLifecycle.openUrl(url, title),
    []
  )

  const closeTab = useCallback((tabId: string) => canvasLifecycle.closeTab(tabId), [])

  const switchTab = useCallback((tabId: string) => canvasLifecycle.switchTab(tabId), [])

  const setOpen = useCallback((open: boolean) => canvasLifecycle.setOpen(open), [])
  const updateTabContent = useCallback(
    (tabId: string, content: string) => canvasLifecycle.updateTabContent(tabId, content),
    []
  )
  const markTabSaved = useCallback(
    (tabId: string, content?: string, mtimeMs?: number) =>
      canvasLifecycle.markTabSaved(tabId, content, mtimeMs),
    []
  )
  return {
    tabs,
    activeTabId,
    activeTab,
    isOpen,
    openUrl,
    closeTab,
    switchTab,
    setOpen,
    updateTabContent,
    markTabSaved
  }
}

export function useBrowserState(tabId: string | undefined) {
  const [browserState, setBrowserState] = useState<BrowserState>({
    isLoading: false,
    canGoBack: false,
    canGoForward: false
  })

  useEffect(() => {
    if (!tabId) return

    const tab = canvasLifecycle.getTab(tabId)
    if (tab?.browserState) {
      setBrowserState(tab.browserState)
    }

    const unsub = canvasLifecycle.onBrowserStateChange((id, state) => {
      if (id === tabId) {
        setBrowserState(state)
      }
    })

    return unsub
  }, [tabId])

  return browserState
}

export type { TabState, BrowserState, ContentType }

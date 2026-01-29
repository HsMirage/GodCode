/**
 * BrowserView Service - Manages embedded browser views
 *
 * Adapted from hello-halo (https://github.com/openkursar/halo)
 * Copyright (c) OpenKursar
 * Licensed under MIT
 *
 * This service creates and manages BrowserView instances for the Content Canvas,
 * enabling true browser functionality within CodeAll.
 *
 * Key features:
 * - Multiple concurrent BrowserViews (one per tab)
 * - Full Chromium rendering with network capabilities
 * - Security isolation (sandbox mode)
 * - State tracking (URL, title, loading, navigation history)
 */

import { BrowserView, BrowserWindow } from 'electron'

export interface BrowserViewState {
  id: string
  url: string
  title: string
  favicon?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomLevel: number
  error?: string
}

export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

class BrowserViewManager {
  private views: Map<string, BrowserView> = new Map()
  private states: Map<string, BrowserViewState> = new Map()
  private mainWindow: BrowserWindow | null = null
  private activeViewId: string | null = null
  private stateChangeDebounceTimers: Map<string, NodeJS.Timeout> = new Map()
  private static readonly STATE_CHANGE_DEBOUNCE_MS = 50
  private static readonly MAX_TABS = 5

  initialize(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow

    mainWindow.on('closed', () => {
      this.destroyAll()
    })
  }

  async create(viewId: string, url?: string): Promise<BrowserViewState> {
    if (this.views.has(viewId)) {
      return this.states.get(viewId)!
    }

    if (this.views.size >= BrowserViewManager.MAX_TABS) {
      const oldestViewId = this.views.keys().next().value
      if (oldestViewId) {
        this.destroy(oldestViewId)
      }
    }

    const view = new BrowserView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        partition: 'persist:browser',
        scrollBounce: true
      }
    })

    view.webContents.setUserAgent(CHROME_USER_AGENT)
    view.setBackgroundColor('#ffffff')

    const state: BrowserViewState = {
      id: viewId,
      url: url || 'about:blank',
      title: 'New Tab',
      isLoading: !!url,
      canGoBack: false,
      canGoForward: false,
      zoomLevel: 1
    }

    this.views.set(viewId, view)
    this.states.set(viewId, state)

    this.bindEvents(viewId, view)

    if (url) {
      if (url.startsWith('file://')) {
        state.error = 'file:// URLs are blocked for security'
        state.isLoading = false
      } else {
        try {
          await view.webContents.loadURL(url)
        } catch (error) {
          state.error = (error as Error).message
          state.isLoading = false
        }
      }
    }

    return state
  }

  show(viewId: string, bounds: BrowserViewBounds): boolean {
    const view = this.views.get(viewId)
    if (!view || !this.mainWindow) return false

    if (this.activeViewId && this.activeViewId !== viewId) {
      this.hide(this.activeViewId)
    }

    this.mainWindow.addBrowserView(view)

    const intBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    }
    view.setBounds(intBounds)

    view.setAutoResize({
      width: false,
      height: false,
      horizontal: false,
      vertical: false
    })

    this.activeViewId = viewId
    return true
  }

  hide(viewId: string): boolean {
    const view = this.views.get(viewId)
    if (!view || !this.mainWindow) return false

    try {
      this.mainWindow.removeBrowserView(view)
    } catch (e) {
      // View might already be removed
    }

    if (this.activeViewId === viewId) {
      this.activeViewId = null
    }

    return true
  }

  resize(viewId: string, bounds: BrowserViewBounds): boolean {
    const view = this.views.get(viewId)
    if (!view) return false

    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })

    return true
  }

  async navigate(viewId: string, input: string): Promise<boolean> {
    const view = this.views.get(viewId)
    if (!view) return false

    let url = input.trim()
    if (!url) return false

    // Block file:// URLs for security
    if (url.startsWith('file://')) {
      this.updateState(viewId, {
        error: 'file:// URLs are blocked for security',
        isLoading: false
      })
      this.emitStateChange(viewId)
      return false
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ') && this.looksLikeDomain(url)) {
        url = 'https://' + url
      } else {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
      }
    }

    try {
      await view.webContents.loadURL(url)
      return true
    } catch (error) {
      this.updateState(viewId, {
        error: (error as Error).message,
        isLoading: false
      })
      this.emitStateChange(viewId)
      return false
    }
  }

  private looksLikeDomain(input: string): boolean {
    const tlds = ['com', 'org', 'net', 'io', 'dev', 'co', 'ai', 'app', 'cn', 'uk', 'de', 'fr', 'jp']
    const parts = input.split('.')
    if (parts.length < 2) return false
    const lastPart = parts[parts.length - 1].toLowerCase()
    return tlds.includes(lastPart) || lastPart.length === 2
  }

  goBack(viewId: string): boolean {
    const view = this.views.get(viewId)
    if (!view || !view.webContents.canGoBack()) return false
    view.webContents.goBack()
    return true
  }

  goForward(viewId: string): boolean {
    const view = this.views.get(viewId)
    if (!view || !view.webContents.canGoForward()) return false
    view.webContents.goForward()
    return true
  }

  reload(viewId: string): boolean {
    const view = this.views.get(viewId)
    if (!view) return false
    view.webContents.reload()
    return true
  }

  stop(viewId: string): boolean {
    const view = this.views.get(viewId)
    if (!view) return false
    view.webContents.stop()
    return true
  }

  async capture(viewId: string): Promise<string | null> {
    const view = this.views.get(viewId)
    if (!view) return null

    try {
      const image = await view.webContents.capturePage()
      return image.toDataURL()
    } catch (error) {
      console.error('[BrowserView] Screenshot failed:', error)
      return null
    }
  }

  async executeJS(viewId: string, code: string): Promise<unknown> {
    const view = this.views.get(viewId)
    if (!view) return null

    try {
      return await view.webContents.executeJavaScript(code)
    } catch (error) {
      console.error('[BrowserView] JS execution failed:', error)
      return null
    }
  }

  setZoom(viewId: string, level: number): boolean {
    const view = this.views.get(viewId)
    if (!view) return false

    const clampedLevel = Math.max(0.25, Math.min(5, level))
    view.webContents.setZoomFactor(clampedLevel)
    this.updateState(viewId, { zoomLevel: clampedLevel })
    this.emitStateChange(viewId)
    return true
  }

  getState(viewId: string): BrowserViewState | null {
    return this.states.get(viewId) || null
  }

  destroy(viewId: string) {
    const view = this.views.get(viewId)
    if (!view) return

    const timer = this.stateChangeDebounceTimers.get(viewId)
    if (timer) {
      clearTimeout(timer)
      this.stateChangeDebounceTimers.delete(viewId)
    }

    if (this.mainWindow) {
      try {
        this.mainWindow.removeBrowserView(view)
      } catch (e) {
        // Already removed
      }
    }

    try {
      const wc = view.webContents as any
      wc.destroy()
    } catch (e) {
      // Already destroyed
    }

    this.views.delete(viewId)
    this.states.delete(viewId)

    if (this.activeViewId === viewId) {
      this.activeViewId = null
    }
  }

  destroyAll() {
    for (const timer of this.stateChangeDebounceTimers.values()) {
      clearTimeout(timer)
    }
    this.stateChangeDebounceTimers.clear()

    for (const viewId of this.views.keys()) {
      this.destroy(viewId)
    }
  }

  private bindEvents(viewId: string, view: BrowserView) {
    const wc = view.webContents

    wc.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return

      this.updateState(viewId, {
        url,
        isLoading: true,
        error: undefined
      })
      this.emitStateChangeImmediate(viewId)
    })

    wc.on('did-finish-load', () => {
      this.updateState(viewId, {
        isLoading: false,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
        error: undefined
      })
      this.emitStateChangeImmediate(viewId)
    })

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      if (errorCode === -3) return

      this.updateState(viewId, {
        isLoading: false,
        error: errorDescription || `Error ${errorCode}`
      })
      this.emitStateChangeImmediate(viewId)
    })

    wc.on('page-title-updated', (_event, title) => {
      this.updateState(viewId, { title })
      this.emitStateChange(viewId)
    })

    wc.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0) {
        this.updateState(viewId, { favicon: favicons[0] })
        this.emitStateChange(viewId)
      }
    })

    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return

      this.updateState(viewId, {
        url,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward()
      })
      this.emitStateChange(viewId)
    })

    wc.setWindowOpenHandler(({ url }) => {
      wc.loadURL(url)
      return { action: 'deny' }
    })

    wc.on('will-navigate', (event, url) => {
      if (url.startsWith('file://')) {
        event.preventDefault()
        return
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        event.preventDefault()
      }
    })
  }

  private updateState(viewId: string, updates: Partial<BrowserViewState>) {
    const state = this.states.get(viewId)
    if (state) {
      Object.assign(state, updates)
    }
  }

  private emitStateChange(viewId: string) {
    const existingTimer = this.stateChangeDebounceTimers.get(viewId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      this.stateChangeDebounceTimers.delete(viewId)
      this.doEmitStateChange(viewId)
    }, BrowserViewManager.STATE_CHANGE_DEBOUNCE_MS)

    this.stateChangeDebounceTimers.set(viewId, timer)
  }

  private emitStateChangeImmediate(viewId: string) {
    const existingTimer = this.stateChangeDebounceTimers.get(viewId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.stateChangeDebounceTimers.delete(viewId)
    }

    this.doEmitStateChange(viewId)
  }

  private doEmitStateChange(viewId: string) {
    const state = this.states.get(viewId)
    if (state && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('browser:state-changed', {
        viewId,
        state: { ...state }
      })
    }
  }

  getWebContents(viewId: string): Electron.WebContents | null {
    const view = this.views.get(viewId)
    return view?.webContents || null
  }

  getActiveViewId(): string | null {
    return this.activeViewId
  }
}

export const browserViewManager = new BrowserViewManager()

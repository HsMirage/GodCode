/**
 * Canvas Lifecycle Manager - Centralized BrowserView and Tab Management
 */
import { api } from '../api'
import { isBinaryExtension } from '../constants/file-types'

export type ContentType =
  | 'code'
  | 'markdown'
  | 'html'
  | 'image'
  | 'pdf'
  | 'text'
  | 'json'
  | 'csv'
  | 'browser'
  | 'terminal'

export interface BrowserState {
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  favicon?: string
  zoomLevel?: number
}

export interface TabState {
  id: string
  type: ContentType
  title: string
  path?: string
  url?: string
  content?: string
  language?: string
  mimeType?: string
  isDirty: boolean
  isLoading: boolean
  error?: string
  scrollPosition?: number
  browserViewId?: string
  browserState?: BrowserState
  isEditMode?: boolean
}

type TabsChangeCallback = (tabs: TabState[]) => void
type ActiveTabChangeCallback = (tabId: string | null) => void
type BrowserStateChangeCallback = (tabId: string, state: BrowserState) => void
type OpenStateChangeCallback = (isOpen: boolean) => void

function detectContentType(path: string): { type: ContentType; language?: string } {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const filename = path.split('/').pop()?.toLowerCase() || ''

  // Special filenames
  const specialFiles: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    '.gitignore': 'gitignore',
    '.env': 'shell'
  }

  if (specialFiles[filename]) {
    return { type: 'code', language: specialFiles[filename] }
  }

  const codeExtensions: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    sh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql'
  }

  if (codeExtensions[ext]) {
    return { type: 'code', language: codeExtensions[ext] }
  }

  if (ext === 'pdf') return { type: 'pdf' }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return { type: 'image' }

  return { type: 'text' }
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

class CanvasLifecycle {
  private tabs: Map<string, TabState> = new Map()
  private activeTabId: string | null = null
  private isOpen: boolean = false
  private isTransitioning: boolean = false
  private containerBoundsGetter: (() => DOMRect | null) | null = null
  private browserStateUnsubscribe: (() => void) | null = null
  private tabsChangeCallbacks: Set<TabsChangeCallback> = new Set()
  private activeTabChangeCallbacks: Set<ActiveTabChangeCallback> = new Set()
  private browserStateChangeCallbacks: Set<BrowserStateChangeCallback> = new Set()
  private openStateChangeCallbacks: Set<OpenStateChangeCallback> = new Set()
  private initialized: boolean = false

  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    this.browserStateUnsubscribe = api.onBrowserStateChange(data => {
      // Cast to expected type since api wrapper uses generic interface
      const event = data as {
        viewId: string
        state: BrowserState & { url?: string; title?: string }
      }

      for (const [tabId, tab] of this.tabs) {
        if (tab.browserViewId === event.viewId) {
          tab.browserState = {
            isLoading: event.state.isLoading,
            canGoBack: event.state.canGoBack,
            canGoForward: event.state.canGoForward,
            favicon: event.state.favicon,
            zoomLevel: event.state.zoomLevel
          }

          if (event.state.url && event.state.url !== tab.url) tab.url = event.state.url
          if (event.state.title && event.state.title !== tab.title) tab.title = event.state.title
          if (event.state.isLoading !== undefined) tab.isLoading = event.state.isLoading

          this.notifyTabsChange()
          this.notifyBrowserStateChange(tabId, tab.browserState)
          break
        }
      }
    })
  }

  destroy(): void {
    if (this.browserStateUnsubscribe) {
      this.browserStateUnsubscribe()
      this.browserStateUnsubscribe = null
    }
    this.closeAll()
  }

  setContainerBoundsGetter(getter: () => DOMRect | null): void {
    this.containerBoundsGetter = getter
  }

  async openFile(path: string, title?: string): Promise<string> {
    for (const [tabId, tab] of this.tabs) {
      if (tab.path === path) {
        await this.switchTab(tabId)
        return tabId
      }
    }

    const ext = path.split('.').pop()?.toLowerCase() || ''
    if (isBinaryExtension(ext)) {
      await api.openArtifact(path)
      return ''
    }

    const { type, language } = detectContentType(path)

    if (type === 'pdf') {
      return this.openPdf(path, title)
    }

    const tabId = generateTabId()
    const tab: TabState = {
      id: tabId,
      type,
      title: title || getFileName(path),
      path,
      language,
      isDirty: false,
      isLoading: true
    }

    this.tabs.set(tabId, tab)
    this.setOpen(true)
    this.notifyTabsChange()
    await this.switchTab(tabId)
    this.loadFileContent(tabId, path, type)

    return tabId
  }

  private async openPdf(path: string, title?: string): Promise<string> {
    const tabId = generateTabId()
    const pdfUrl = `file://${encodeURI(path)}`

    const tab: TabState = {
      id: tabId,
      type: 'pdf',
      title: title || getFileName(path),
      path,
      url: pdfUrl,
      isDirty: false,
      isLoading: true,
      browserState: { isLoading: true, canGoBack: false, canGoForward: false }
    }

    this.tabs.set(tabId, tab)
    this.setOpen(true)
    this.notifyTabsChange()
    await this.switchTab(tabId)
    return tabId
  }

  private async loadFileContent(tabId: string, path: string, type: ContentType): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    if (type === 'image') {
      tab.isLoading = false
      this.notifyTabsChange()
      return
    }

    try {
      const response = await api.readArtifactContent(path)
      if (!this.tabs.has(tabId)) return

      const res = response as any
      if (res.success !== false) {
        const content = res.data?.content || res.content || res
        tab.content = typeof content === 'string' ? content : JSON.stringify(content)
        tab.isLoading = false
        tab.error = undefined
      } else {
        throw new Error(res.error || 'Failed to read file')
      }
    } catch (error) {
      const tab = this.tabs.get(tabId)
      if (tab) {
        tab.isLoading = false
        tab.error = (error as Error).message
      }
    }
    this.notifyTabsChange()
  }

  async openUrl(url: string, title?: string): Promise<string> {
    for (const [tabId, tab] of this.tabs) {
      if (tab.type === 'browser' && tab.url === url) {
        await this.switchTab(tabId)
        return tabId
      }
    }

    let displayTitle = title
    if (!displayTitle) {
      try {
        displayTitle = new URL(url).hostname
      } catch {
        displayTitle = url.substring(0, 30)
      }
    }

    const tabId = generateTabId()
    const tab: TabState = {
      id: tabId,
      type: 'browser',
      title: displayTitle,
      url,
      isDirty: false,
      isLoading: true,
      browserState: { isLoading: true, canGoBack: false, canGoForward: false }
    }

    this.tabs.set(tabId, tab)
    this.setOpen(true)
    this.notifyTabsChange()
    await this.switchTab(tabId)
    return tabId
  }

  async attachAIBrowserView(viewId: string, url: string, title?: string): Promise<string> {
    for (const [tabId, tab] of this.tabs) {
      if (tab.browserViewId === viewId) {
        await this.switchTab(tabId)
        return tabId
      }
    }

    let displayTitle = title || '🤖 AI Browser'
    if (!title) {
      try {
        displayTitle = `🤖 ${new URL(url).hostname}`
      } catch {
        // Intentionally empty
      }
    }

    const tabId = generateTabId()
    const tab: TabState = {
      id: tabId,
      type: 'browser',
      title: displayTitle,
      url,
      isDirty: false,
      isLoading: false,
      browserViewId: viewId,
      browserState: { isLoading: false, canGoBack: false, canGoForward: false }
    }

    this.tabs.set(tabId, tab)
    this.setOpen(true)
    this.notifyTabsChange()
    await this.switchTab(tabId)
    return tabId
  }

  async openContent(
    content: string,
    title: string,
    type: ContentType,
    language?: string
  ): Promise<string> {
    const tabId = generateTabId()
    const tab: TabState = {
      id: tabId,
      type,
      title,
      content,
      language,
      isDirty: false,
      isLoading: false
    }

    this.tabs.set(tabId, tab)
    this.setOpen(true)
    this.notifyTabsChange()
    await this.switchTab(tabId)
    return tabId
  }

  async closeTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    const hasBrowserView = (tab.type === 'browser' || tab.type === 'pdf') && tab.browserViewId
    if (hasBrowserView) {
      await this.destroyBrowserView(tab.browserViewId!)
    }

    this.tabs.delete(tabId)

    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys())
      if (remainingTabs.length > 0) {
        await this.switchTab(remainingTabs[remainingTabs.length - 1])
      } else {
        this.activeTabId = null
        this.setOpen(false)
        this.notifyActiveTabChange()
      }
    }
    this.notifyTabsChange()
  }

  async closeAll(): Promise<void> {
    for (const [, tab] of this.tabs) {
      const hasBrowserView = (tab.type === 'browser' || tab.type === 'pdf') && tab.browserViewId
      if (hasBrowserView) {
        await this.destroyBrowserView(tab.browserViewId!)
      }
    }

    this.tabs.clear()
    this.activeTabId = null
    this.setOpen(false)
    this.notifyTabsChange()
    this.notifyActiveTabChange()
  }

  async switchTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    const previousTabId = this.activeTabId
    const previousTab = previousTabId ? this.tabs.get(previousTabId) : null
    const prevNeedsBrowserView = previousTab?.type === 'browser' || previousTab?.type === 'pdf'

    if (prevNeedsBrowserView && previousTab?.browserViewId && previousTabId !== tabId) {
      await api.hideBrowserView(previousTab.browserViewId)
    }

    this.activeTabId = tabId

    const needsBrowserView = tab.type === 'browser' || tab.type === 'pdf'
    if (needsBrowserView) {
      if (tab.browserViewId) {
        await this.showBrowserView(tab.browserViewId)
      } else {
        this.createBrowserView(tabId, tab.url || 'about:blank').catch(console.error)
      }
    }

    this.notifyActiveTabChange()
  }

  async switchToNextTab(): Promise<void> {
    if (this.tabs.size === 0) return
    const tabIds = Array.from(this.tabs.keys())
    const currentIndex = this.activeTabId ? tabIds.indexOf(this.activeTabId) : -1
    const nextIndex = (currentIndex + 1) % tabIds.length
    await this.switchTab(tabIds[nextIndex])
  }

  async switchToPrevTab(): Promise<void> {
    if (this.tabs.size === 0) return
    const tabIds = Array.from(this.tabs.keys())
    const currentIndex = this.activeTabId ? tabIds.indexOf(this.activeTabId) : 0
    const prevIndex = currentIndex <= 0 ? tabIds.length - 1 : currentIndex - 1
    await this.switchTab(tabIds[prevIndex])
  }

  async switchToTabIndex(index: number): Promise<void> {
    const tabIds = Array.from(this.tabs.keys())
    if (index > 0 && index <= tabIds.length) {
      await this.switchTab(tabIds[index - 1])
    }
  }

  reorderTabs(fromIndex: number, toIndex: number): void {
    const tabsArray = Array.from(this.tabs.entries())
    const [removed] = tabsArray.splice(fromIndex, 1)
    tabsArray.splice(toIndex, 0, removed)
    this.tabs = new Map(tabsArray)
    this.notifyTabsChange()
  }

  private async createBrowserView(tabId: string, url: string): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    const viewId = `browser-${tabId}`
    try {
      const result = (await api.createBrowserView(viewId, url)) as any
      if (!this.tabs.has(tabId)) {
        await api.destroyBrowserView(viewId)
        return
      }

      if (result.success) {
        tab.browserViewId = viewId
        this.notifyTabsChange()
        await this.showBrowserView(viewId)
      } else {
        tab.error = result.error || 'Failed to create browser view'
        tab.isLoading = false
        this.notifyTabsChange()
      }
    } catch (error) {
      const tab = this.tabs.get(tabId)
      if (tab) {
        tab.error = (error as Error).message
        tab.isLoading = false
        this.notifyTabsChange()
      }
    }
  }

  private async showBrowserView(viewId: string): Promise<void> {
    if (!this.containerBoundsGetter) return
    const bounds = this.containerBoundsGetter()
    if (!bounds) return

    await api.showBrowserView(viewId, {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
  }

  private async destroyBrowserView(viewId: string): Promise<void> {
    await api.hideBrowserView(viewId)
    await api.destroyBrowserView(viewId)
  }

  async updateActiveBounds(): Promise<void> {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    const hasBrowserView = (tab?.type === 'browser' || tab?.type === 'pdf') && tab.browserViewId
    if (hasBrowserView) {
      await this.resizeBrowserView(tab.browserViewId!)
    }
  }

  async ensureActiveBrowserViewShown(): Promise<void> {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    const hasBrowserView = (tab?.type === 'browser' || tab?.type === 'pdf') && tab.browserViewId
    if (hasBrowserView) {
      await this.showBrowserView(tab.browserViewId!)
    }
  }

  private async resizeBrowserView(viewId: string): Promise<void> {
    if (!this.containerBoundsGetter) return
    const bounds = this.containerBoundsGetter()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return

    await api.resizeBrowserView(viewId, {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
  }

  async hideActiveBrowserView(): Promise<void> {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if ((tab?.type === 'browser' || tab?.type === 'pdf') && tab.browserViewId) {
      await api.hideBrowserView(tab.browserViewId!)
    }
  }

  async showActiveBrowserView(): Promise<void> {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if ((tab?.type === 'browser' || tab?.type === 'pdf') && tab.browserViewId) {
      await this.showBrowserView(tab.browserViewId!)
    }
  }

  async refreshTab(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    if ((tab.type === 'browser' || tab.type === 'pdf') && tab.browserViewId) {
      await api.browserReload(tab.browserViewId!)
    } else if (tab.path) {
      tab.isLoading = true
      tab.error = undefined
      this.notifyTabsChange()
      await this.loadFileContent(tabId, tab.path, tab.type)
    }
  }

  updateTabContent(tabId: string, content: string): void {
    const tab = this.tabs.get(tabId)
    if (tab) {
      tab.content = content
      tab.isDirty = true
      this.notifyTabsChange()
    }
  }

  markTabSaved(tabId: string, content?: string): void {
    const tab = this.tabs.get(tabId)
    if (tab) {
      if (content !== undefined) tab.content = content
      tab.isDirty = false
      this.notifyTabsChange()
    }
  }

  saveScrollPosition(tabId: string, position: number): void {
    const tab = this.tabs.get(tabId)
    if (tab) tab.scrollPosition = position
  }

  toggleEditMode(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (tab && tab.type === 'markdown') {
      tab.isEditMode = !tab.isEditMode
      this.notifyTabsChange()
    }
  }

  setEditMode(tabId: string, editMode: boolean): void {
    const tab = this.tabs.get(tabId)
    if (tab) {
      tab.isEditMode = editMode
      this.notifyTabsChange()
    }
  }

  setOpen(open: boolean): void {
    if (this.isOpen === open) return
    if (open && this.tabs.size === 0) return

    this.isOpen = open
    this.isTransitioning = true

    if (open) this.showActiveBrowserView()
    else this.hideActiveBrowserView()

    this.notifyOpenStateChange()
    setTimeout(() => {
      this.isTransitioning = false
    }, 300)
  }

  toggleOpen(): void {
    if (!this.isOpen && this.tabs.size === 0) return
    this.setOpen(!this.isOpen)
  }

  getTabs(): TabState[] {
    return Array.from(this.tabs.values())
  }
  getTab(tabId: string): TabState | undefined {
    return this.tabs.get(tabId)
  }
  getActiveTabId(): string | null {
    return this.activeTabId
  }
  getActiveTab(): TabState | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
  }
  getIsOpen(): boolean {
    return this.isOpen
  }
  getIsTransitioning(): boolean {
    return this.isTransitioning
  }
  getTabCount(): number {
    return this.tabs.size
  }

  onTabsChange(callback: TabsChangeCallback): () => void {
    this.tabsChangeCallbacks.add(callback)
    callback(this.getTabs())
    return () => this.tabsChangeCallbacks.delete(callback)
  }
  onActiveTabChange(callback: ActiveTabChangeCallback): () => void {
    this.activeTabChangeCallbacks.add(callback)
    callback(this.activeTabId)
    return () => this.activeTabChangeCallbacks.delete(callback)
  }
  onBrowserStateChange(callback: BrowserStateChangeCallback): () => void {
    this.browserStateChangeCallbacks.add(callback)
    return () => this.browserStateChangeCallbacks.delete(callback)
  }
  onOpenStateChange(callback: OpenStateChangeCallback): () => void {
    this.openStateChangeCallbacks.add(callback)
    callback(this.isOpen)
    return () => this.openStateChangeCallbacks.delete(callback)
  }

  private notifyTabsChange(): void {
    this.tabsChangeCallbacks.forEach(cb => {
      cb(this.getTabs())
    })
  }
  private notifyActiveTabChange(): void {
    this.activeTabChangeCallbacks.forEach(cb => {
      cb(this.activeTabId)
    })
  }
  private notifyBrowserStateChange(tabId: string, state: BrowserState): void {
    this.browserStateChangeCallbacks.forEach(cb => {
      cb(tabId, state)
    })
  }
  private notifyOpenStateChange(): void {
    this.openStateChangeCallbacks.forEach(cb => {
      cb(this.isOpen)
    })
  }
}

export const canvasLifecycle = new CanvasLifecycle()
canvasLifecycle.initialize()

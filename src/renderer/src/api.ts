export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

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

export interface BrowserStateChange {
  viewId: string
  state: BrowserViewState
}

export interface BrowserZoomChanged {
  viewId: string
  zoomLevel: number
}

export interface BrowserMenuOptions {
  viewId: string
  url?: string
  zoomLevel: number
}

const invoke = window.codeall.invoke as (channel: string, ...args: unknown[]) => Promise<unknown>
const onEvent = window.codeall.on as (
  channel: string,
  callback: (...args: unknown[]) => void
) => () => void

export const api = {
  createBrowserView: (viewId: string, url?: string) => invoke('browser:create', { viewId, url }),
  destroyBrowserView: (viewId: string) => invoke('browser:destroy', { viewId }),
  showBrowserView: (viewId: string, bounds: BrowserViewBounds) =>
    invoke('browser:show', { viewId, bounds }),
  hideBrowserView: (viewId: string) => invoke('browser:hide', { viewId }),
  resizeBrowserView: (viewId: string, bounds: BrowserViewBounds) =>
    invoke('browser:resize', { viewId, bounds }),
  navigateBrowserView: (viewId: string, url: string) => invoke('browser:navigate', { viewId, url }),
  browserGoBack: (viewId: string) => invoke('browser:go-back', { viewId }),
  browserGoForward: (viewId: string) => invoke('browser:go-forward', { viewId }),
  browserReload: (viewId: string) => invoke('browser:reload', { viewId }),
  browserStop: (viewId: string) => invoke('browser:stop', { viewId }),
  captureBrowserView: (viewId: string) => invoke('browser:capture', { viewId }),
  executeJS: (viewId: string, code: string) => invoke('browser:execute-js', { viewId, code }),
  setZoom: (viewId: string, level: number) => invoke('browser:zoom', { viewId, level }),
  showBrowserContextMenu: (options: BrowserMenuOptions) =>
    invoke('browser:show-context-menu', options),
  openArtifact: (path: string) => invoke('shell:open-path', path),
  readArtifactContent: (path: string) => invoke('file:read', path),
  onBrowserStateChange: (callback: (data: BrowserStateChange) => void) =>
    onEvent('browser:state-changed', callback as (...args: unknown[]) => void),
  onBrowserZoomChanged: (callback: (data: BrowserZoomChanged) => void) =>
    onEvent('browser:zoom-changed', callback as (...args: unknown[]) => void)
}

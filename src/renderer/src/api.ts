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

export interface ApiResult<T = unknown> {
  success: boolean
  data?: T
  content?: string
  error?: string
}

export interface Artifact {
  id: string
  sessionId: string
  taskId?: string | null
  type: string
  path: string
  content?: string | null
  size: number
  createdAt: Date
  updatedAt: Date
}

const invoke = window.codeall.invoke as (channel: string, ...args: unknown[]) => Promise<unknown>
const onEvent = window.codeall.on as (
  channel: string,
  callback: (...args: unknown[]) => void
) => () => void

/**
 * Safe IPC invoke wrapper that handles wrapped responses.
 * Main process handlers return { success: true, data: T } or { success: false, error: string }
 * This utility unwraps the response and throws on errors.
 */
export async function safeInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await invoke(channel, ...args)

  // Check if response is a wrapped IPC result
  if (
    response !== null &&
    typeof response === 'object' &&
    'success' in response &&
    typeof (response as any).success === 'boolean'
  ) {
    const wrapped = response as ApiResult<T>
    if (wrapped.success === false) {
      throw new Error(wrapped.error || 'Unknown IPC error')
    }
    // Return unwrapped data, fallback to empty if data is undefined
    return (wrapped.data as T) ?? ([] as unknown as T)
  }

  // Not a wrapped response, return as-is
  return response as T
}

export const api = {
  createBrowserView: (viewId: string, url?: string) =>
    invoke('browser:create', { viewId, url }) as Promise<ApiResult<BrowserViewState>>,
  destroyBrowserView: (viewId: string) =>
    invoke('browser:destroy', { viewId }) as Promise<ApiResult>,
  showBrowserView: (viewId: string, bounds: BrowserViewBounds) =>
    invoke('browser:show', { viewId, bounds }) as Promise<ApiResult>,
  hideBrowserView: (viewId: string) => invoke('browser:hide', { viewId }) as Promise<ApiResult>,
  resizeBrowserView: (viewId: string, bounds: BrowserViewBounds) =>
    invoke('browser:resize', { viewId, bounds }) as Promise<ApiResult>,
  navigateBrowserView: (viewId: string, url: string) =>
    invoke('browser:navigate', { viewId, url }) as Promise<ApiResult>,
  browserGoBack: (viewId: string) => invoke('browser:go-back', { viewId }) as Promise<ApiResult>,
  browserGoForward: (viewId: string) =>
    invoke('browser:go-forward', { viewId }) as Promise<ApiResult>,
  browserReload: (viewId: string) => invoke('browser:reload', { viewId }) as Promise<ApiResult>,
  browserStop: (viewId: string) => invoke('browser:stop', { viewId }) as Promise<ApiResult>,
  captureBrowserView: (viewId: string) =>
    invoke('browser:capture', { viewId }) as Promise<ApiResult<string>>,
  executeJS: (viewId: string, code: string) =>
    invoke('browser:execute-js', { viewId, code }) as Promise<ApiResult>,
  setZoom: (viewId: string, level: number) =>
    invoke('browser:zoom', { viewId, level }) as Promise<ApiResult>,
  showBrowserContextMenu: (options: BrowserMenuOptions) =>
    invoke('browser:show-context-menu', options) as Promise<ApiResult>,
  getArtifact: (artifactId: string) => invoke('artifact:get', artifactId) as Promise<Artifact>,
  openArtifact: (path: string) => invoke('shell:open-path', path) as Promise<ApiResult>,
  readArtifactContent: (path: string) => invoke('file:read', path) as Promise<ApiResult>,
  onBrowserStateChange: (callback: (data: BrowserStateChange) => void) =>
    onEvent('browser:state-changed', callback as (...args: unknown[]) => void),
  onBrowserZoomChanged: (callback: (data: BrowserZoomChanged) => void) =>
    onEvent('browser:zoom-changed', callback as (...args: unknown[]) => void)
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { browserViewManager } from '@/main/services/browser-view.service'
import { BrowserView } from 'electron'

vi.mock('electron', () => {
  return {
    BrowserView: vi.fn(() => ({
      webContents: {
        loadURL: vi.fn().mockResolvedValue(undefined),
        executeJavaScript: vi.fn().mockResolvedValue(undefined),
        setUserAgent: vi.fn(),
        on: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        destroy: vi.fn(),
        closeDevTools: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        canGoBack: vi.fn().mockReturnValue(false),
        canGoForward: vi.fn().mockReturnValue(false),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        stop: vi.fn(),
        capturePage: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,' }),
        setZoomFactor: vi.fn()
      },
      setBounds: vi.fn(),
      setAutoResize: vi.fn(),
      setBackgroundColor: vi.fn()
    })),
    BrowserWindow: {
      getFocusedWindow: vi.fn()
    }
  }
})

describe('BrowserViewManager', () => {
  const mainWindowMock = {
    on: vi.fn(),
    addBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn()
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    browserViewManager.initialize(mainWindowMock as unknown as Parameters<typeof browserViewManager.initialize>[0])
  })

  afterEach(() => {
    browserViewManager.destroyAll()
  })

  it('should create a browser view instance', async () => {
    const viewId = 'view-1'
    const url = 'https://google.com'
    const state = await browserViewManager.create(viewId, url)

    expect(state).toBeDefined()
    expect(state.id).toBe(viewId)
    expect(state.url).toBe(url)
    expect(state.lifecycleState).toBe('created')
    expect(BrowserView).toHaveBeenCalledTimes(1)

    const wc = browserViewManager.getWebContents(viewId)
    expect(wc).toBeDefined()
    expect(wc!.setUserAgent).toHaveBeenCalled()
    expect(wc!.loadURL).toHaveBeenCalledWith(url)
  })

  it('should retrieve existing web contents', async () => {
    const viewId = 'view-2'
    await browserViewManager.create(viewId)
    const wc = browserViewManager.getWebContents(viewId)
    expect(wc).toBeDefined()
  })

  it('should navigate to a url', async () => {
    const viewId = 'view-3'
    await browserViewManager.create(viewId)
    const wc = browserViewManager.getWebContents(viewId)

    const result = await browserViewManager.navigate(viewId, 'https://github.com')
    expect(result).toBe(true)
    expect(wc!.loadURL).toHaveBeenCalledWith('https://github.com')
  })

  it('should clean up when destroying a view', async () => {
    const viewId = 'view-4'
    await browserViewManager.create(viewId)

    const wc = browserViewManager.getWebContents(viewId)

    browserViewManager.destroy(viewId)

    expect(wc).toBeDefined()
    expect(mainWindowMock.removeBrowserView).toHaveBeenCalled()
    expect((wc as { closeDevTools: () => void }).closeDevTools).toHaveBeenCalled()
  })

  it('should show the browser view', async () => {
    const viewId = 'view-5'
    await browserViewManager.create(viewId)

    const bounds = { x: 0, y: 0, width: 800, height: 600 }
    const result = browserViewManager.show(viewId, bounds)

    expect(result).toBe(true)
    expect(mainWindowMock.addBrowserView).toHaveBeenCalled()
    expect(browserViewManager.getState(viewId)?.lifecycleState).toBe('visible')
  })

  it('should hide the browser view', async () => {
    const viewId = 'view-6'
    await browserViewManager.create(viewId)
    browserViewManager.show(viewId, { x: 0, y: 0, width: 100, height: 100 })

    const result = browserViewManager.hide(viewId)
    expect(result).toBe(true)
    expect(mainWindowMock.removeBrowserView).toHaveBeenCalled()
    expect(browserViewManager.getState(viewId)?.lifecycleState).toBe('hidden')
  })

  it('should not re-attach an already visible browser view', async () => {
    const viewId = 'view-6b'
    await browserViewManager.create(viewId)

    const bounds = { x: 0, y: 0, width: 800, height: 600 }
    const first = browserViewManager.show(viewId, bounds)
    const second = browserViewManager.show(viewId, bounds)

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(mainWindowMock.addBrowserView).toHaveBeenCalledTimes(1)
  })

  it('should search on google for non-url input', async () => {
    const viewId = 'view-7'
    await browserViewManager.create(viewId)
    const wc = browserViewManager.getWebContents(viewId)

    await browserViewManager.navigate(viewId, 'test search')

    const expectedUrl = 'https://www.google.com/search?q=test%20search'
    expect(wc!.loadURL).toHaveBeenCalledWith(expectedUrl)
  })

  it('should auto-complete domain names', async () => {
    const viewId = 'view-8'
    await browserViewManager.create(viewId)
    const wc = browserViewManager.getWebContents(viewId)

    await browserViewManager.navigate(viewId, 'google.com')
    expect(wc!.loadURL).toHaveBeenCalledWith('https://google.com')
  })

  it('should enforce maximum tab limit (FIFO)', async () => {
    for (let i = 1; i <= 5; i++) {
      await browserViewManager.create(`view-${i}`)
    }

    await browserViewManager.create('view-6')

    const state1 = browserViewManager.getState('view-1')
    expect(state1).toBeNull()

    for (let i = 2; i <= 6; i++) {
      const state = browserViewManager.getState(`view-${i}`)
      expect(state).toBeDefined()
    }

    let count = 0
    for (let i = 1; i <= 6; i++) {
      if (browserViewManager.getState(`view-${i}`)) count++
    }
    expect(count).toBe(5)
  })

  it('should destroy underlying web contents when destroying a view', async () => {
    const viewId = 'view-destroy'
    await browserViewManager.create(viewId)

    const wc = browserViewManager.getWebContents(viewId)
    browserViewManager.destroy(viewId)

    expect((wc as unknown as { destroy: () => void }).destroy).toHaveBeenCalled()
    expect(browserViewManager.getState(viewId)).toBeNull()
  })
})

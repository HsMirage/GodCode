import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const loadURLMock = vi.fn().mockResolvedValue(undefined)
  const executeJavaScriptMock = vi.fn()
  const capturePageMock = vi.fn()
  const setBoundsMock = vi.fn()
  const setAutoResizeMock = vi.fn()
  const setUserAgentMock = vi.fn()
  const setBackgroundColorMock = vi.fn()
  const stopMock = vi.fn()
  const reloadMock = vi.fn()
  const goBackMock = vi.fn()
  const goForwardMock = vi.fn()

  class MockWebContents {
    loadURL = loadURLMock
    executeJavaScript = executeJavaScriptMock
    capturePage = capturePageMock
    setUserAgent = setUserAgentMock
    on = vi.fn()
    setWindowOpenHandler = vi.fn()
    canGoBack = vi.fn().mockReturnValue(false)
    canGoForward = vi.fn().mockReturnValue(false)
    stop = stopMock
    reload = reloadMock
    goBack = goBackMock
    goForward = goForwardMock
    setZoomFactor = vi.fn()
    getURL = vi.fn().mockReturnValue('https://example.com')
  }

  class MockBrowserView {
    webContents = new MockWebContents()
    setBounds = setBoundsMock
    setAutoResize = setAutoResizeMock
    setBackgroundColor = setBackgroundColorMock
  }

  return {
    loadURL: loadURLMock,
    executeJavaScript: executeJavaScriptMock,
    capturePage: capturePageMock,
    setBounds: setBoundsMock,
    stop: stopMock,
    reload: reloadMock,
    goBack: goBackMock,
    goForward: goForwardMock,
    MockWebContents,
    MockBrowserView,
    nativeImage: {
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked-image'),
      toPNG: vi.fn().mockReturnValue(Buffer.from('mocked-png'))
    }
  }
})

vi.mock('electron', () => ({
  BrowserView: mocks.MockBrowserView,
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    })
  }
}))

import { browserViewManager } from '../../src/main/services/browser-view.service'
import { navigateTool } from '../../src/main/services/ai-browser/tools/navigation'
import {
  snapshotTool,
  screenshotTool,
  extractTool
} from '../../src/main/services/ai-browser/tools/snapshot'
import { clickTool, fillTool } from '../../src/main/services/ai-browser/tools/input'

describe('Browser Automation Integration', () => {
  const VIEW_ID = 'integration-test-view'

  beforeEach(() => {
    vi.clearAllMocks()
    browserViewManager.create(VIEW_ID)
  })

  afterEach(() => {
    browserViewManager.destroyAll()
  })

  describe('BrowserView Lifecycle', () => {
    it('should create and manage browser view state', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      expect(view).toBeDefined()

      const state = browserViewManager.getState(VIEW_ID)
      expect(state).toBeDefined()
      expect(state?.id).toBe(VIEW_ID)
    })

    it('should handle multi-tab management', async () => {
      browserViewManager.create('tab-1')
      browserViewManager.create('tab-2')
      browserViewManager.create('tab-3')

      const view1 = browserViewManager.getWebContents('tab-1')
      const view2 = browserViewManager.getWebContents('tab-2')
      const view3 = browserViewManager.getWebContents('tab-3')

      expect(view1).toBeDefined()
      expect(view2).toBeDefined()
      expect(view3).toBeDefined()

      browserViewManager.destroy('tab-2')

      expect(browserViewManager.getWebContents('tab-2')).toBeNull()
      expect(browserViewManager.getWebContents('tab-1')).toBeDefined()
      expect(browserViewManager.getWebContents('tab-3')).toBeDefined()
    })
  })

  describe('Navigation Tool Integration', () => {
    it('should navigate to URL and update state', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      await navigateTool.execute(
        { url: 'https://example.com' },
        { viewId: VIEW_ID, webContents: view }
      )

      expect(mocks.loadURL).toHaveBeenCalledWith('https://example.com')
    })

    it('should reject insecure file:// protocol URLs', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      const result = await navigateTool.execute(
        { url: 'file:///etc/passwd' },
        { viewId: VIEW_ID, webContents: view }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Local file access forbidden')
    })
  })

  describe('Input Tools Integration', () => {
    it('should execute click on element by uid', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      // clickTool highlights first, then clicks; satisfy both executeJavaScript calls.
      mocks.executeJavaScript.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true)

      const result = await clickTool.execute(
        { uid: 'uid-button-123' },
        { viewId: VIEW_ID, webContents: view }
      )

      expect(result.success).toBe(true)
      expect(mocks.executeJavaScript).toHaveBeenCalled()
    })

    it('should handle missing element gracefully', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      // clickTool may retry; keep returning false.
      mocks.executeJavaScript.mockReset().mockResolvedValue(false)

      const result = await clickTool.execute(
        { uid: 'nonexistent-uid' },
        { viewId: VIEW_ID, webContents: view }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should type text into input element', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      // fillTool highlights first, then fills; satisfy both executeJavaScript calls.
      mocks.executeJavaScript.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true)

      const result = await fillTool.execute(
        { uid: 'uid-input-123', value: 'Hello World' },
        { viewId: VIEW_ID, webContents: view }
      )

      expect(result.success).toBe(true)
      const jsCalls = mocks.executeJavaScript.mock.calls.map(c => c[0]).join('\n')
      expect(jsCalls).toContain('Hello World')
    })
  })

  describe('Snapshot Tools Integration', () => {
    it('should capture accessibility snapshot', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      const mockSnapshot = {
        tree: [
          { uid: 'uid-0', role: 'button', name: 'Submit' },
          { uid: 'uid-1', role: 'textbox', name: 'Search' }
        ],
        count: 2
      }
      mocks.executeJavaScript.mockResolvedValueOnce(mockSnapshot)

      const result = await snapshotTool.execute({}, { viewId: VIEW_ID, webContents: view })

      expect(result.success).toBe(true)
      if (result.success) {
        const data = result.data as { count: number; tree: any[] }
        expect(data.count).toBe(2)
        expect(data.tree).toHaveLength(2)
      }
    })

    it('should capture page screenshot', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      mocks.capturePage.mockResolvedValueOnce(mocks.nativeImage)

      const result = await screenshotTool.execute({}, { viewId: VIEW_ID, webContents: view })

      expect(result.success).toBe(true)
      if (result.success) {
        const data = result.data as { image: string }
        expect(data.image).toContain('data:image/png;base64')
      }
    })

    it('should extract page content with links', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      const mockExtract = {
        text: 'Page Content Here',
        links: [
          { text: 'Home', url: '/' },
          { text: 'About', url: '/about' }
        ]
      }
      mocks.executeJavaScript.mockResolvedValueOnce(mockExtract)

      const result = await extractTool.execute({}, { viewId: VIEW_ID, webContents: view })

      expect(result.success).toBe(true)
      if (result.success) {
        const data = result.data as { text: string; links: any[] }
        expect(data.text).toBe('Page Content Here')
        expect(data.links).toHaveLength(2)
      }
    })
  })

  describe('Full Automation Workflow', () => {
    it('should execute complete automation workflow: navigate -> snapshot -> click -> extract', async () => {
      const view = browserViewManager.getWebContents(VIEW_ID)
      if (!view) throw new Error('View not created')

      await navigateTool.execute(
        { url: 'https://example.com' },
        { viewId: VIEW_ID, webContents: view }
      )
      expect(mocks.loadURL).toHaveBeenCalledWith('https://example.com')

      mocks.executeJavaScript.mockResolvedValueOnce({
        tree: [
          { uid: 'uid-submit', role: 'button', name: 'Submit' },
          { uid: 'uid-input', role: 'textbox', name: 'Email' }
        ],
        count: 2
      })

      const snapshotResult = await snapshotTool.execute({}, { viewId: VIEW_ID, webContents: view })
      expect(snapshotResult.success).toBe(true)

      // clickTool highlights first, then clicks; satisfy both executeJavaScript calls.
      mocks.executeJavaScript.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
      const clickResult = await clickTool.execute(
        { uid: 'uid-submit' },
        { viewId: VIEW_ID, webContents: view }
      )
      expect(clickResult.success).toBe(true)

      mocks.executeJavaScript.mockResolvedValueOnce({
        text: 'Form submitted successfully',
        links: []
      })
      const extractResult = await extractTool.execute({}, { viewId: VIEW_ID, webContents: view })
      expect(extractResult.success).toBe(true)
      if (extractResult.success) {
        const data = extractResult.data as { text: string }
        expect(data.text).toContain('submitted successfully')
      }
    })
  })

  describe('State Management and Cleanup', () => {
    it('should properly clean up browser views on destroy', async () => {
      browserViewManager.create('cleanup-test')
      expect(browserViewManager.getWebContents('cleanup-test')).toBeDefined()

      browserViewManager.destroy('cleanup-test')
      expect(browserViewManager.getWebContents('cleanup-test')).toBeNull()
    })

    it('should destroy all views on cleanup', async () => {
      browserViewManager.create('view-a')
      browserViewManager.create('view-b')

      expect(browserViewManager.getWebContents('view-a')).toBeDefined()
      expect(browserViewManager.getWebContents('view-b')).toBeDefined()

      browserViewManager.destroyAll()

      expect(browserViewManager.getWebContents('view-a')).toBeNull()
      expect(browserViewManager.getWebContents('view-b')).toBeNull()
    })
  })
})

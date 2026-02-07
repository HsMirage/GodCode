import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { toolExecutor } from '@/main/services/tools/tool-executor'
import { toolRegistry } from '@/main/services/tools/tool-registry'
import { defaultPolicy } from '@/main/services/tools/permission-policy'
import { BrowserWindow } from 'electron'
import {
  browserNavigateTool,
  browserClickTool,
  browserFillTool,
  browserSnapshotTool,
  browserScreenshotTool,
  browserExtractTool
} from '@/main/services/tools/builtin/browser-tools'

// Define mocks using vi.hoisted - Necessary for vitest mock hoisting
const mocks = vi.hoisted(() => {
  return {
    browserViewManager: {
      create: vi.fn(),
      navigate: vi.fn(),
      getWebContents: vi.fn(),
      getState: vi.fn()
    },
    webContents: {
      executeJavaScript: vi.fn(),
      loadURL: vi.fn(),
      getURL: vi.fn(),
      capturePage: vi.fn()
    },
    nativeImage: {
      toDataURL: vi.fn()
    }
  }
})

// Mock Electron - Required for LoggerService
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-user-data')
  },
  BrowserWindow: {
    // browser-tools.ts uses BrowserWindow.getAllWindows() to send renderer notifications
    getAllWindows: vi.fn().mockReturnValue([])
  }
}))

// Mock BrowserViewManager - Core dependency for browser tools
vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: mocks.browserViewManager
}))

// Mock Logger - Prevent console noise during tests
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

// Mock Config - In case it's needed
vi.mock('@/main/services/config', () => ({
  configService: {
    get: vi.fn()
  }
}))

describe('Browser Tools Integration', () => {
  const sessionId = 'test-session-id'
  const viewId = `session-${sessionId}`
  const mockContext = {
    sessionId,
    actionId: 'action-1',
    projectPath: '/tmp/test',
    workspaceDir: '/tmp/test'
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Some mocks use `.mockReturnValueOnce(...)` which leaves a queue behind. Clear those queues
    // so tests don't leak state into each other.
    mocks.browserViewManager.create.mockReset()
    mocks.browserViewManager.navigate.mockReset()
    mocks.browserViewManager.getWebContents.mockReset()
    mocks.browserViewManager.getState.mockReset()
    mocks.webContents.executeJavaScript.mockReset()
    mocks.webContents.capturePage.mockReset()
    ;(BrowserWindow.getAllWindows as any).mockReturnValue([])

    // Register tools
    toolRegistry.register(browserNavigateTool)
    toolRegistry.register(browserClickTool)
    toolRegistry.register(browserFillTool)
    toolRegistry.register(browserSnapshotTool)
    toolRegistry.register(browserScreenshotTool)
    toolRegistry.register(browserExtractTool)

    // Setup default mocks
    mocks.browserViewManager.getWebContents.mockReturnValue(mocks.webContents)
    mocks.webContents.capturePage.mockResolvedValue(mocks.nativeImage)
    mocks.nativeImage.toDataURL.mockReturnValue('data:image/png;base64,mocked-image')
    // Add toPNG and toJPEG mocks - cast to any to add properties
    ;(mocks.nativeImage as any).toPNG = vi.fn().mockReturnValue(Buffer.from('mocked-png'))
    ;(mocks.nativeImage as any).toJPEG = vi.fn().mockReturnValue(Buffer.from('mocked-jpeg'))

    // Default to view exists for most tests
    mocks.browserViewManager.getState.mockReturnValue({ id: viewId, isLoading: false })

    // Reset permission policy
    vi.spyOn(defaultPolicy, 'isAllowed').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ToolExecutor Integration', () => {
    it('should execute browser_navigate through ToolExecutor', async () => {
      mocks.browserViewManager.navigate.mockResolvedValue(undefined)
      // Mock getState to return loading then loaded
      mocks.browserViewManager.getState
        .mockReturnValueOnce({ id: viewId, isLoading: true })
        .mockReturnValue({ id: viewId, isLoading: false })

      const result = await toolExecutor.execute(
        'browser_navigate',
        { url: 'https://example.com' },
        mockContext
      )

      expect(result.success).toBe(true)
      expect(mocks.browserViewManager.navigate).toHaveBeenCalledWith(viewId, 'https://example.com')
    })

    it('should execute browser_click through ToolExecutor', async () => {
      mocks.webContents.executeJavaScript.mockResolvedValue(true)

      const result = await toolExecutor.execute('browser_click', { uid: 'uid-123' }, mockContext)

      expect(result.success).toBe(true)
      expect(mocks.webContents.executeJavaScript).toHaveBeenCalled()
      expect(mocks.webContents.executeJavaScript.mock.calls[0][0]).toContain('uid-123')
    })

    it('should execute browser_fill through ToolExecutor', async () => {
      mocks.webContents.executeJavaScript.mockResolvedValue(true)

      const result = await toolExecutor.execute(
        'browser_fill',
        { uid: 'uid-123', value: 'hello' },
        mockContext
      )

      expect(result.success).toBe(true)
      expect(mocks.webContents.executeJavaScript).toHaveBeenCalled()
      // Implementation highlights element first, then fills value.
      const scripts = mocks.webContents.executeJavaScript.mock.calls.map(c => String(c[0]))
      expect(scripts.some(s => s.includes('hello'))).toBe(true)
    })
  })

  describe('Session Management', () => {
    it('should auto-create view on first navigate if not exists', async () => {
      // View does not exist initially, then exists and loads
      mocks.browserViewManager.getState
        .mockReturnValueOnce(null) // Check if exists
        .mockReturnValueOnce({ id: viewId, isLoading: true }) // Inside navigate loop
        .mockReturnValue({ id: viewId, isLoading: false }) // Loop finish

      mocks.browserViewManager.create.mockResolvedValue(undefined)
      mocks.browserViewManager.navigate.mockResolvedValue(undefined)

      const result = await toolExecutor.execute(
        'browser_navigate',
        { url: 'https://example.com' },
        mockContext
      )

      expect(result.success).toBe(true)
      expect(mocks.browserViewManager.create).toHaveBeenCalledWith(viewId)
      expect(mocks.browserViewManager.navigate).toHaveBeenCalledWith(viewId, 'https://example.com')
    })

    it('should reuse view for same session', async () => {
      // View exists
      mocks.browserViewManager.getState.mockReturnValue({ id: viewId, isLoading: false })

      await toolExecutor.execute('browser_navigate', { url: 'https://example.com' }, mockContext)

      expect(mocks.browserViewManager.create).not.toHaveBeenCalled()
      expect(mocks.browserViewManager.navigate).toHaveBeenCalledWith(viewId, 'https://example.com')
    })

    it('should error when no view exists for non-navigate tools', async () => {
      // View does not exist
      mocks.browserViewManager.getState.mockReturnValue(null)

      const result = await toolExecutor.execute('browser_click', { uid: 'uid-123' }, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No active browser session found')
      expect(mocks.webContents.executeJavaScript).not.toHaveBeenCalled()
    })
  })

  describe('Permission Policy', () => {
    it('should block tool when denied', async () => {
      vi.spyOn(defaultPolicy, 'isAllowed').mockReturnValue(false)

      const result = await toolExecutor.execute(
        'browser_navigate',
        { url: 'https://example.com' },
        mockContext
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('not allowed by policy')
      expect(mocks.browserViewManager.navigate).not.toHaveBeenCalled()
    })

    it('should allow tool when permitted', async () => {
      vi.spyOn(defaultPolicy, 'isAllowed').mockReturnValue(true)

      const result = await toolExecutor.execute(
        'browser_navigate',
        { url: 'https://example.com' },
        mockContext
      )

      expect(result.success).toBe(true)
      expect(mocks.browserViewManager.navigate).toHaveBeenCalled()
    })
  })

  describe('Individual Tools', () => {
    describe('browser_navigate', () => {
      it('should validate URL and enforce protocol', async () => {
        // Mock loading state for navigation
        mocks.browserViewManager.getState.mockReturnValue({ id: viewId, isLoading: false })

        await toolExecutor.execute('browser_navigate', { url: 'example.com' }, mockContext)
        expect(mocks.browserViewManager.navigate).toHaveBeenCalledWith(
          viewId,
          'https://example.com'
        )
      })

      it('should reject file:// URLs', async () => {
        const result = await toolExecutor.execute(
          'browser_navigate',
          { url: 'file:///etc/passwd' },
          mockContext
        )
        expect(result.success).toBe(false)
        expect(result.error ?? '').toContain('Local file access forbidden')
      })
    })

    describe('browser_click', () => {
      it('should handle element not found', async () => {
        // JS returns false
        mocks.webContents.executeJavaScript.mockResolvedValue(false)
        const result = await toolExecutor.execute('browser_click', { uid: 'uid-999' }, mockContext)
        expect(result.success).toBe(false)
        expect(result.error ?? '').toContain('uid-999')
        expect((result.error ?? '').toLowerCase()).toContain('not found')
      })
    })

    describe('browser_fill', () => {
      it('should handle filling inputs', async () => {
        mocks.webContents.executeJavaScript.mockResolvedValue(true)
        const result = await toolExecutor.execute(
          'browser_fill',
          { uid: 'uid-1', value: 'test' },
          mockContext
        )
        expect(result.success).toBe(true)
        expect(result.metadata).toHaveProperty('value', 'test')
      })
    })

    describe('browser_snapshot', () => {
      it('should return accessibility tree', async () => {
        const mockSnapshot = { tree: [{ uid: 'uid-0', role: 'button', name: 'Submit' }], count: 1 }
        mocks.webContents.executeJavaScript.mockResolvedValue(mockSnapshot)

        const result = await toolExecutor.execute('browser_snapshot', {}, mockContext)

        expect(result.success).toBe(true)
        expect(JSON.parse(result.output)).toEqual(mockSnapshot)
      })
    })

    describe('browser_screenshot', () => {
      it('should capture page', async () => {
        const result = await toolExecutor.execute('browser_screenshot', {}, mockContext)

        expect(result.success).toBe(true)
        expect(JSON.parse(result.output)).toHaveProperty(
          'image',
          'data:image/png;base64,mocked-image'
        )
        expect(mocks.webContents.capturePage).toHaveBeenCalled()
      })
    })

    describe('browser_extract', () => {
      it('should extract content', async () => {
        const mockExtract = {
          text: 'Page Content',
          links: [{ text: 'Link', url: 'https://a.com' }]
        }
        mocks.webContents.executeJavaScript.mockResolvedValue(mockExtract)

        const result = await toolExecutor.execute('browser_extract', {}, mockContext)

        expect(result.success).toBe(true)
        expect(JSON.parse(result.output)).toEqual(mockExtract)
      })
    })
  })

  describe('Error Handling', () => {
    it('should fail when missing required parameters', async () => {
      const result = await toolExecutor.execute('browser_navigate', {}, mockContext)

      expect(result.success).toBe(false)
      // Expect specific error message from tool implementation
      expect(result.error).toContain('URL is required for navigation')
      expect(mocks.browserViewManager.navigate).not.toHaveBeenCalled()
    })

    it('should handle unknown tools', async () => {
      const result = await toolExecutor.execute('browser_unknown_tool', {}, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Tool 'browser_unknown_tool' not found")
    })
  })
})

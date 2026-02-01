import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { allTools } from '@/main/services/ai-browser/tools'
import { browserViewManager } from '@/main/services/browser-view.service'

// Mock dependencies
vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    navigate: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({ isLoading: false, url: 'https://example.com' })
  }
}))

describe('AI Browser Tools', () => {
  const navigateTool = allTools.find(t => t.name === 'browser_navigate')!
  const clickTool = allTools.find(t => t.name === 'browser_click')!
  const fillTool = allTools.find(t => t.name === 'browser_fill')!
  const snapshotTool = allTools.find(t => t.name === 'browser_snapshot')!
  const screenshotTool = allTools.find(t => t.name === 'browser_screenshot')!
  const extractTool = allTools.find(t => t.name === 'browser_extract')!

  let mockWebContents: any
  let context: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Mock WebContents
    mockWebContents = {
      executeJavaScript: vi.fn(),
      capturePage: vi.fn()
    }

    // Default context
    context = {
      viewId: 'test-view-id',
      webContents: mockWebContents
    }
  })

  describe('browser_navigate', () => {
    it('should navigate to a valid https URL', async () => {
      const result = await navigateTool.execute({ url: 'https://example.com' }, context)

      expect(browserViewManager.navigate).toHaveBeenCalledWith(
        'test-view-id',
        'https://example.com'
      )
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ url: 'https://example.com' })
    })

    it('should normalize http URLs if protocol missing (default to https)', async () => {
      const result = await navigateTool.execute({ url: 'example.com' }, context)

      expect(browserViewManager.navigate).toHaveBeenCalledWith(
        'test-view-id',
        'https://example.com'
      )
      expect(result.success).toBe(true)
    })

    it('should accept http URLs', async () => {
      // Mock getState to return http url
      vi.mocked(browserViewManager.getState).mockReturnValue({
        id: 'test-view-id',
        isLoading: false,
        url: 'http://insecure.com',
        title: 'Insecure Site',
        canGoBack: false,
        canGoForward: false,
        zoomLevel: 1.0
      })
      const result = await navigateTool.execute({ url: 'http://insecure.com' }, context)

      expect(browserViewManager.navigate).toHaveBeenCalledWith(
        'test-view-id',
        'http://insecure.com'
      )
      expect(result.success).toBe(true)
    })

    it('should block file:// URLs for security', async () => {
      const result = await navigateTool.execute({ url: 'file:///etc/passwd' }, context)

      expect(browserViewManager.navigate).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Local file access forbidden')
    })

    it('should handle navigation errors', async () => {
      vi.mocked(browserViewManager.navigate).mockRejectedValueOnce(new Error('Network error'))

      const result = await navigateTool.execute({ url: 'https://fail.com' }, context)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  describe('browser_click', () => {
    it('should fail if webContents is missing', async () => {
      // Create context without webContents
      const badContext = { viewId: 'id' }
      const result = await clickTool.execute({ uid: 'uid-123' }, badContext as any)
      expect(result.success).toBe(false)
      expect(result.error).toContain('No active WebContents')
    })

    it('should execute click script and return success', async () => {
      mockWebContents.executeJavaScript.mockResolvedValue(true)

      const result = await clickTool.execute({ uid: 'uid-123' }, context)

      expect(mockWebContents.executeJavaScript).toHaveBeenCalled()
      // Verify script contains UID
      const script = mockWebContents.executeJavaScript.mock.calls[0][0]
      expect(script).toContain('uid-123')
      expect(script).toContain('click()')

      expect(result.success).toBe(true)
      // The implementation returns specific messages depending on dblClick
      expect(result.data).toMatchObject({ uid: 'uid-123' })
    })

    it('should fail if element not found in DOM', async () => {
      mockWebContents.executeJavaScript.mockResolvedValue(false)

      const result = await clickTool.execute({ uid: 'uid-ghost' }, context)

      expect(result.success).toBe(false)
      // Implementation returns "Element not found with UID: ..."
      expect(result.error).toContain('Element not found')
    })

    it('should handle execution errors', async () => {
      mockWebContents.executeJavaScript.mockRejectedValue(new Error('DOM Error'))

      const result = await clickTool.execute({ uid: 'uid-bad' }, context)

      expect(result.success).toBe(false)
      expect(result.error).toBe('DOM Error')
    })
  })

  describe('browser_fill', () => {
    it('should fail if webContents is missing', async () => {
      const badContext = { viewId: 'id' }
      const result = await fillTool.execute({ uid: 'uid-1', value: 'hello' }, badContext as any)
      expect(result.success).toBe(false)
    })

    it('should execute fill script and return success', async () => {
      mockWebContents.executeJavaScript.mockResolvedValue(true)

      const result = await fillTool.execute({ uid: 'uid-input', value: 'secret' }, context)

      const script = mockWebContents.executeJavaScript.mock.calls[0][0]
      expect(script).toContain('uid-input')
      expect(script).toContain('"secret"') // JSON stringified
      // The implementation uses logic to check for select/combobox or regular input
      expect(script).toContain('el.value =')

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ uid: 'uid-input', value: 'secret' })
    })

    it('should fail if input element not found', async () => {
      mockWebContents.executeJavaScript.mockResolvedValue(false)

      const result = await fillTool.execute({ uid: 'uid-missing', value: 'val' }, context)

      expect(result.success).toBe(false)
      // Implementation returns "Input element not found with UID: ..."
      expect(result.error).toContain('Input element not found')
    })
  })

  describe('browser_snapshot', () => {
    it('should return accessibility tree with UIDs', async () => {
      const mockTree = {
        tree: [{ uid: 'uid-0', role: 'button', name: 'Submit' }],
        count: 1,
        url: 'https://example.com',
        title: 'Example'
      }
      mockWebContents.executeJavaScript.mockResolvedValue(mockTree)

      const result = await snapshotTool.execute({}, context)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockTree)
      expect(mockWebContents.executeJavaScript).toHaveBeenCalled()
    })

    it('should handle snapshot script errors', async () => {
      mockWebContents.executeJavaScript.mockRejectedValue(new Error('Script failed'))

      const result = await snapshotTool.execute({}, context)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Script failed')
    })
  })

  describe('browser_screenshot', () => {
    it('should capture page and return base64', async () => {
      const mockImage = {
        toDataURL: vi.fn().mockReturnValue('data:image/png;base64,ABC'),
        toPNG: vi.fn().mockReturnValue(Buffer.from('ABC')),
        toJPEG: vi.fn()
      }
      mockWebContents.capturePage.mockResolvedValue(mockImage)

      const result = await screenshotTool.execute({}, context)

      expect(mockWebContents.capturePage).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ image: 'data:image/png;base64,ABC' })
    })

    it('should handle capture errors', async () => {
      mockWebContents.capturePage.mockRejectedValue(new Error('Capture failed'))

      const result = await screenshotTool.execute({}, context)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Capture failed')
    })
  })

  describe('browser_extract', () => {
    it('should extract text and links', async () => {
      const mockData = {
        text: 'Page content',
        links: [{ text: 'Home', url: 'https://home.com' }]
      }
      mockWebContents.executeJavaScript.mockResolvedValue(mockData)

      const result = await extractTool.execute({}, context)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockData)
    })

    it('should handle extraction errors', async () => {
      mockWebContents.executeJavaScript.mockRejectedValue(new Error('Extract failed'))

      const result = await extractTool.execute({}, context)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Extract failed')
    })
  })
})

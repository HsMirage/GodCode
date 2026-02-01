import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listPagesTool,
  selectPageTool,
  newPageTool,
  closePageTool,
  navigateTool,
  waitForTool,
  handleDialogTool
} from '@/main/services/ai-browser/tools/navigation'
import { browserViewManager } from '@/main/services/browser-view.service'

vi.mock('@/main/services/browser-view.service', () => ({
  browserViewManager: {
    getAllStates: vi.fn(), // Mock for (browserViewManager as any).getAllStates?.()
    create: vi.fn(),
    getState: vi.fn(),
    destroy: vi.fn(),
    navigate: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn()
  } as any // Cast to any to suppress TypeScript errors for non-public methods
}))

describe('Navigation Tools', () => {
  const mockContext = {
    viewId: 'view-1',
    getActiveViewId: vi.fn(),
    setActiveViewId: vi.fn(),
    waitForText: vi.fn(),
    getPendingDialog: vi.fn(),
    handleDialog: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.getActiveViewId.mockReturnValue('view-1')
  })

  describe('listPagesTool', () => {
    it('should list open pages', async () => {
      vi.mocked((browserViewManager as any).getAllStates).mockReturnValue([
        { id: 'view-1', url: 'https://example.com', title: 'Example', isLoading: false } as any
      ])

      const result = await listPagesTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any).pages).toHaveLength(1)
      expect((result.data as any)?.output).toContain('Example')
    })
  })

  describe('selectPageTool', () => {
    it('should select page by index', async () => {
      vi.mocked((browserViewManager as any).getAllStates).mockReturnValue([
        { id: 'view-1' } as any,
        { id: 'view-2' } as any
      ])

      const result = await selectPageTool.execute({ pageIdx: 1 }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.setActiveViewId).toHaveBeenCalledWith('view-2')
    })

    it('should validate page index', async () => {
      vi.mocked((browserViewManager as any).getAllStates).mockReturnValue([])

      const result = await selectPageTool.execute({ pageIdx: 0 }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid page index')
    })
  })

  describe('newPageTool', () => {
    it('should create new page', async () => {
      vi.mocked(browserViewManager.create).mockResolvedValue({
        id: 'new-view',
        url: 'about:blank'
      } as any)
      vi.mocked(browserViewManager.getState).mockReturnValue({
        isLoading: false,
        url: 'https://google.com'
      } as any)

      const result = await newPageTool.execute({ url: 'https://google.com' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(browserViewManager.create).toHaveBeenCalled()
      expect(mockContext.setActiveViewId).toHaveBeenCalled()
    })
  })

  describe('closePageTool', () => {
    it('should close page', async () => {
      vi.mocked((browserViewManager as any).getAllStates).mockReturnValue([
        { id: 'view-1' } as any,
        { id: 'view-2' } as any
      ])

      const result = await closePageTool.execute({ pageIdx: 0 }, mockContext as any)

      expect(result.success).toBe(true)
      expect(browserViewManager.destroy).toHaveBeenCalledWith('view-1')
    })

    it('should prevent closing last page', async () => {
      vi.mocked((browserViewManager as any).getAllStates).mockReturnValue([{ id: 'view-1' } as any])

      const result = await closePageTool.execute({ pageIdx: 0 }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('last open page')
    })
  })

  describe('navigateTool', () => {
    it('should navigate to url', async () => {
      vi.mocked(browserViewManager.getState).mockReturnValue({ isLoading: false } as any)

      const result = await navigateTool.execute(
        { type: 'url', url: 'https://example.com' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect(browserViewManager.navigate).toHaveBeenCalledWith('view-1', 'https://example.com')
    })

    it('should handle back/forward/reload', async () => {
      await navigateTool.execute({ type: 'back' }, mockContext as any)
      expect(browserViewManager.goBack).toHaveBeenCalled()

      await navigateTool.execute({ type: 'forward' }, mockContext as any)
      expect(browserViewManager.goForward).toHaveBeenCalled()

      await navigateTool.execute({ type: 'reload' }, mockContext as any)
      expect(browserViewManager.reload).toHaveBeenCalled()
    })
  })

  describe('waitForTool', () => {
    it('should wait for text', async () => {
      mockContext.waitForText.mockResolvedValue(true)

      const result = await waitForTool.execute({ text: 'Login' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.waitForText).toHaveBeenCalledWith('Login', 30000)
    })
  })

  describe('handleDialogTool', () => {
    it('should handle dialog', async () => {
      mockContext.getPendingDialog.mockReturnValue({ message: 'Confirm?' })
      mockContext.handleDialog.mockResolvedValue(undefined)

      const result = await handleDialogTool.execute({ action: 'accept' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.handleDialog).toHaveBeenCalledWith(true, undefined)
    })

    it('should fail if no dialog', async () => {
      mockContext.getPendingDialog.mockReturnValue(undefined)

      const result = await handleDialogTool.execute({ action: 'accept' }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No open dialog found')
    })
  })
})

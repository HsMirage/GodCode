import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  clickTool,
  fillTool,
  fillFormTool,
  dragTool,
  pressKeyTool,
  uploadFileTool,
  hoverTool
} from '@/main/services/ai-browser/tools/input'

describe('Input Tools', () => {
  const mockContext = {
    webContents: {
      executeJavaScript: vi.fn(),
      sendInputEvent: vi.fn()
    },
    dragElement: vi.fn(),
    pressKey: vi.fn(),
    sendCDPCommand: vi.fn(),
    getElementByUid: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default success for JS execution
    mockContext.webContents.executeJavaScript.mockResolvedValue(true)
  })

  describe('clickTool', () => {
    it('should click element', async () => {
      const result = await clickTool.execute({ uid: '123' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.webContents.executeJavaScript).toHaveBeenCalled()
      expect(mockContext.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('el.click()')
      )
    })

    it('should double click element', async () => {
      const result = await clickTool.execute({ uid: '123', dblClick: true }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.message).toContain('double clicked')
      expect(mockContext.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("new MouseEvent('dblclick'")
      )
    })

    it('should fail if element not found', async () => {
      mockContext.webContents.executeJavaScript.mockResolvedValue(false)
      const result = await clickTool.execute({ uid: '999' }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Element not found')
    })
  })

  describe('fillTool', () => {
    it('should fill input', async () => {
      const result = await fillTool.execute({ uid: 'input-1', value: 'hello' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('el.value = "hello"')
      )
    })
  })

  describe('fillFormTool', () => {
    it('should fill multiple elements', async () => {
      const result = await fillFormTool.execute(
        {
          elements: [
            { uid: '1', value: 'a' },
            { uid: '2', value: 'b' }
          ]
        },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect(mockContext.webContents.executeJavaScript).toHaveBeenCalledTimes(2)
    })

    it('should report partial failures', async () => {
      mockContext.webContents.executeJavaScript
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('JS Error'))

      const result = await fillFormTool.execute(
        {
          elements: [
            { uid: '1', value: 'a' },
            { uid: '2', value: 'b' }
          ]
        },
        mockContext as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Partially filled')
      expect(result.error).toContain('JS Error')
    })
  })

  describe('dragTool', () => {
    it('should drag element', async () => {
      mockContext.dragElement.mockResolvedValue(undefined)

      const result = await dragTool.execute({ from_uid: 'a', to_uid: 'b' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.dragElement).toHaveBeenCalledWith('a', 'b')
    })

    it('should fail if drag not supported', async () => {
      // Temporarily remove dragElement from context
      const noDragContext = { ...mockContext, dragElement: undefined }
      const result = await dragTool.execute({ from_uid: 'a', to_uid: 'b' }, noDragContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')
    })
  })

  describe('pressKeyTool', () => {
    it('should press key using Electron input event', async () => {
      const result = await pressKeyTool.execute({ key: 'Enter' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.webContents.sendInputEvent).toHaveBeenCalledTimes(2) // down + up
      expect(mockContext.pressKey).toHaveBeenCalledWith('Enter')
    })
  })

  describe('uploadFileTool', () => {
    it('should upload file via CDP', async () => {
      mockContext.getElementByUid.mockReturnValue({ backendNodeId: 100 })
      mockContext.sendCDPCommand.mockResolvedValue(undefined)

      const result = await uploadFileTool.execute(
        { uid: 'file-input', filePath: '/path/to/file.png' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith('DOM.setFileInputFiles', {
        backendNodeId: 100,
        files: ['/path/to/file.png']
      })
    })

    it('should fail if CDP not available', async () => {
      const noCDPContext = { ...mockContext, sendCDPCommand: undefined }
      const result = await uploadFileTool.execute(
        { uid: 'file', filePath: 'test.txt' },
        noCDPContext as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('requires CDP access')
    })
  })

  describe('hoverTool', () => {
    it('should hover element', async () => {
      const result = await hoverTool.execute({ uid: '123' }, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining("new MouseEvent('mouseover'")
      )
    })

    it('should fail if element not found', async () => {
      mockContext.webContents.executeJavaScript.mockResolvedValue(false)
      const result = await hoverTool.execute({ uid: '999' }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Element not found')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emulateTool, resizePageTool } from '@/main/services/ai-browser/tools/emulation'

describe('Emulation Tools', () => {
  const mockContext = {
    viewId: 'view-1',
    getActiveViewId: vi.fn(),
    sendCDPCommand: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext.getActiveViewId.mockReturnValue('view-1')
  })

  describe('emulateTool', () => {
    it('should set network conditions', async () => {
      const result = await emulateTool.execute({ networkConditions: 'Fast 3G' }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Network: Fast 3G')
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith(
        'Network.emulateNetworkConditions',
        expect.objectContaining({
          offline: false,
          downloadThroughput: expect.any(Number)
        })
      )
    })

    it('should set offline mode', async () => {
      const result = await emulateTool.execute({ networkConditions: 'Offline' }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Network: Offline')
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith(
        'Network.emulateNetworkConditions',
        expect.objectContaining({ offline: true })
      )
    })

    it('should set CPU throttling', async () => {
      const result = await emulateTool.execute({ cpuThrottlingRate: 4 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('CPU throttling: 4x')
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith('Emulation.setCPUThrottlingRate', {
        rate: 4
      })
    })

    it('should set geolocation', async () => {
      const result = await emulateTool.execute(
        { geolocation: { latitude: 37.7749, longitude: -122.4194 } },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Geolocation: 37.7749, -122.4194')
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith(
        'Emulation.setGeolocationOverride',
        expect.objectContaining({
          latitude: 37.7749,
          longitude: -122.4194
        })
      )
    })

    it('should clear geolocation', async () => {
      const result = await emulateTool.execute({ geolocation: null }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Geolocation: cleared')
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith('Emulation.clearGeolocationOverride')
    })

    it('should handle missing active page', async () => {
      mockContext.viewId = ''
      mockContext.getActiveViewId.mockReturnValue(undefined)

      const result = await emulateTool.execute({}, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No active browser page.')
    })
  })

  describe('resizePageTool', () => {
    it('should resize page', async () => {
      mockContext.viewId = 'view-1'

      const result = await resizePageTool.execute({ width: 1024, height: 768 }, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.message).toContain('1024x768')
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith(
        'Emulation.setDeviceMetricsOverride',
        expect.objectContaining({
          width: 1024,
          height: 768
        })
      )
    })

    it('should handle error during resize', async () => {
      mockContext.viewId = 'view-1'
      mockContext.sendCDPCommand.mockRejectedValue(new Error('CDP Error'))

      const result = await resizePageTool.execute({ width: 1024, height: 768 }, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Resize failed')
    })
  })
})

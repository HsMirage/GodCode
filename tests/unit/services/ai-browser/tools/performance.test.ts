import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  performanceStartTraceTool,
  performanceStopTraceTool,
  performanceAnalyzeInsightTool
} from '@/main/services/ai-browser/tools/performance'

describe('Performance Tools', () => {
  const mockContext = {
    viewId: 'view-1',
    getActiveViewId: vi.fn(),
    sendCDPCommand: vi.fn(),
    navigate: vi.fn(),
    getPageUrl: vi.fn()
  }

  // traceStates is a module-level variable in the actual implementation.
  // We cannot reset it easily without exposing a reset method or reloading the module.
  // However, in our test setup, the module is loaded once.
  // We need to ensure that previous tests clean up or we mock the implementation that uses it.

  // Since we can't easily reset the module-level map in the source, we'll just mock the execute method partially
  // OR better, we make sure to stop the trace in `afterEach` if one is running?
  // The `traceStates` map is not exported, so we can't clear it.
  // BUT `performanceStopTraceTool` can stop it if we know the viewId.

  // Let's add cleanup in beforeEach
  beforeEach(async () => {
    vi.clearAllMocks()
    mockContext.getActiveViewId.mockReturnValue('view-1')
    mockContext.sendCDPCommand.mockResolvedValue({ metrics: [] })
    // vi.useFakeTimers() - Causing timeout on await setTimeout

    // Attempt to stop any running trace for view-1 to clear the state
    // We ignore errors here in case no trace was running
    await performanceStopTraceTool.execute({}, mockContext as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('performanceStartTraceTool', () => {
    it('should start tracing', async () => {
      const result = await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith('Tracing.start', expect.anything())
    })

    it('should handle reload', async () => {
      mockContext.getPageUrl.mockResolvedValue('https://example.com')
      mockContext.navigate.mockResolvedValue(undefined)

      const result = await performanceStartTraceTool.execute(
        { reload: true, autoStop: false },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect(mockContext.navigate).toHaveBeenCalledWith('about:blank')
      expect(mockContext.navigate).toHaveBeenCalledWith('https://example.com')
    })

    it('should prevent concurrent traces', async () => {
      // Start first trace
      await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      // Try second trace
      const result = await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('already running')
    })

    it('should fail when no active browser page', async () => {
      const noPageContext = {
        viewId: undefined,
        getActiveViewId: vi.fn().mockReturnValue(undefined)
      }

      const result = await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        noPageContext as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('No active browser page')
    })

    it('should handle trace start error', async () => {
      mockContext.sendCDPCommand.mockRejectedValue(new Error('Tracing failed'))

      const result = await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to start trace')
    })
  })

  describe('performanceStopTraceTool', () => {
    it('should stop tracing and return metrics', async () => {
      // Must start trace first
      await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      mockContext.sendCDPCommand
        .mockResolvedValueOnce(undefined) // Tracing.end
        .mockResolvedValueOnce({ metrics: [{ name: 'Nodes', value: 100 }] }) // Performance.getMetrics

      const result = await performanceStopTraceTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect(mockContext.sendCDPCommand).toHaveBeenCalledWith('Tracing.end')
      expect((result.data as any)?.output).toContain('DOM Nodes: 100')
    })

    it('should fail if no trace running', async () => {
      const result = await performanceStopTraceTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.message).toContain('No performance trace is running')
    })

    it('should fail when no active browser page', async () => {
      const noPageContext = {
        viewId: undefined,
        getActiveViewId: vi.fn().mockReturnValue(undefined)
      }

      const result = await performanceStopTraceTool.execute({}, noPageContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No active browser page')
    })

    it('should handle stop trace error', async () => {
      await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      mockContext.sendCDPCommand.mockRejectedValue(new Error('Stop failed'))

      const result = await performanceStopTraceTool.execute({}, mockContext as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to stop trace')
    })

    it('should display full metrics when available', async () => {
      await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      mockContext.sendCDPCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        metrics: [
          { name: 'JSHeapUsedSize', value: 5242880 },
          { name: 'JSHeapTotalSize', value: 10485760 },
          { name: 'Nodes', value: 200 },
          { name: 'Documents', value: 3 },
          { name: 'LayoutCount', value: 5 },
          { name: 'LayoutDuration', value: 0.01 },
          { name: 'RecalcStyleCount', value: 10 },
          { name: 'ScriptDuration', value: 0.05 },
          { name: 'TaskDuration', value: 0.08 }
        ]
      })

      const result = await performanceStopTraceTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('JS Heap Used:')
      expect((result.data as any)?.output).toContain('JS Heap Total:')
      expect((result.data as any)?.output).toContain('DOM Nodes:')
      expect((result.data as any)?.output).toContain('Documents:')
      expect((result.data as any)?.output).toContain('Layout Count:')
      expect((result.data as any)?.output).toContain('Layout Duration:')
      expect((result.data as any)?.output).toContain('Recalc Style Count:')
      expect((result.data as any)?.output).toContain('Script Duration:')
      expect((result.data as any)?.output).toContain('Task Duration:')
    })

    it('should format large heap sizes correctly (GB)', async () => {
      await performanceStartTraceTool.execute(
        { reload: false, autoStop: false },
        mockContext as any
      )

      mockContext.sendCDPCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        metrics: [
          { name: 'JSHeapUsedSize', value: 2147483648 },
          { name: 'JSHeapTotalSize', value: 4294967296 }
        ]
      })

      const result = await performanceStopTraceTool.execute({}, mockContext as any)

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('GB')
    })
  })

  describe('performanceAnalyzeInsightTool', () => {
    it('should analyze insight', async () => {
      mockContext.sendCDPCommand.mockResolvedValue({
        metrics: [{ name: 'TaskDuration', value: 0.1 }]
      })

      const result = await performanceAnalyzeInsightTool.execute(
        { insightSetId: 'main', insightName: 'DocumentLatency' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Document Latency Analysis')
      expect((result.data as any)?.output).toContain('Task Duration: 100.00ms')
    })

    it('should analyze LCPBreakdown insight', async () => {
      mockContext.sendCDPCommand.mockResolvedValue({
        metrics: [
          { name: 'LayoutCount', value: 10 },
          { name: 'LayoutDuration', value: 0.05 },
          { name: 'RecalcStyleCount', value: 25 }
        ]
      })

      const result = await performanceAnalyzeInsightTool.execute(
        { insightSetId: 'main', insightName: 'LCPBreakdown' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('LCP (Largest Contentful Paint) Breakdown')
      expect((result.data as any)?.output).toContain('Layout Count: 10')
      expect((result.data as any)?.output).toContain('Layout Duration: 50.00ms')
      expect((result.data as any)?.output).toContain('Recalc Style Count: 25')
    })

    it('should analyze RenderBlocking insight', async () => {
      mockContext.sendCDPCommand.mockResolvedValue({
        metrics: [
          { name: 'Documents', value: 5 },
          { name: 'Frames', value: 3 }
        ]
      })

      const result = await performanceAnalyzeInsightTool.execute(
        { insightSetId: 'main', insightName: 'RenderBlocking' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Render Blocking Resources')
      expect((result.data as any)?.output).toContain('Documents: 5')
      expect((result.data as any)?.output).toContain('Frames: 3')
    })

    it('should handle unknown insight with general metrics', async () => {
      mockContext.sendCDPCommand.mockResolvedValue({
        metrics: [
          { name: 'JSHeapUsedSize', value: 1048576 },
          { name: 'JSHeapTotalSize', value: 2097152 },
          { name: 'Nodes', value: 500 },
          { name: 'LayoutCount', value: 15 },
          { name: 'ScriptDuration', value: 0.2 }
        ]
      })

      const result = await performanceAnalyzeInsightTool.execute(
        { insightSetId: 'main', insightName: 'UnknownInsight' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('General Performance Metrics')
      expect((result.data as any)?.output).toContain('JS Heap Used:')
      expect((result.data as any)?.output).toContain('DOM Nodes: 500')
    })

    it('should fail when no active browser page', async () => {
      const noPageContext = {
        viewId: undefined,
        getActiveViewId: vi.fn().mockReturnValue(undefined)
      }

      const result = await performanceAnalyzeInsightTool.execute(
        { insightSetId: 'main', insightName: 'DocumentLatency' },
        noPageContext as any
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('No active browser page')
    })

    it('should handle empty metrics gracefully', async () => {
      mockContext.sendCDPCommand.mockRejectedValue(new Error('CDP failed'))

      const result = await performanceAnalyzeInsightTool.execute(
        { insightSetId: 'main', insightName: 'DocumentLatency' },
        mockContext as any
      )

      expect(result.success).toBe(true)
      expect((result.data as any)?.output).toContain('Document Latency Analysis')
    })
  })
})

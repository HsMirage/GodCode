import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolExecutor } from '@/main/services/tools/tool-executor'
import { toolRegistry } from '@/main/services/tools/tool-registry'
import { defaultPolicy } from '@/main/services/tools/permission-policy'

vi.mock('@/main/services/tools/tool-registry')
vi.mock('@/main/services/tools/permission-policy')
vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      }))
    }))
  }
}))

describe('ToolExecutor', () => {
  let executor: ToolExecutor
  const mockTool = {
    definition: {
      name: 'test-tool',
      parameters: [{ name: 'arg1', required: true }]
    },
    execute: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(toolRegistry.get).mockReturnValue(mockTool as any)
    vi.mocked(defaultPolicy.isAllowed).mockReturnValue(true)

    executor = new ToolExecutor()
  })

  it('should execute tool successfully', async () => {
    mockTool.execute.mockResolvedValue({ success: true, output: 'ok' })

    const result = await executor.execute('test-tool', { arg1: 'val' }, {} as any)

    expect(result.success).toBe(true)
    expect(result.output).toBe('ok')
    expect(mockTool.execute).toHaveBeenCalled()
  })

  it('should deny if policy forbids', async () => {
    vi.mocked(defaultPolicy.isAllowed).mockReturnValue(false)

    const result = await executor.execute('test-tool', {}, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not allowed by policy')
    expect(mockTool.execute).not.toHaveBeenCalled()
  })

  it('should fail if tool not found', async () => {
    vi.mocked(toolRegistry.get).mockReturnValue(undefined)

    const result = await executor.execute('missing-tool', {}, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should validate required parameters', async () => {
    const result = await executor.execute('test-tool', {}, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing required parameter')
    expect(mockTool.execute).not.toHaveBeenCalled()
  })

  it('should handle execution error', async () => {
    mockTool.execute.mockRejectedValue(new Error('Run failed'))

    const result = await executor.execute('test-tool', { arg1: 'val' }, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Run failed')
  })
})

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
    vi.mocked(toolRegistry.resolveName).mockImplementation((name: string) => name)
    vi.mocked(toolRegistry.suggestName).mockReturnValue(undefined)
    vi.mocked(toolRegistry.get).mockReturnValue(mockTool as any)
    vi.mocked(defaultPolicy.getExecutionPreview).mockImplementation(
      (toolName: string, requestedName?: string) => ({
        requestedName: requestedName ?? toolName,
        resolvedName: toolName,
        template: 'balanced',
        permission: 'auto',
        source: 'default',
        dangerous: false,
        highRisk: false,
        highRiskEnforced: false,
        requiresConfirmation: false,
        allowedByPolicy: true,
        allowedWithoutConfirmation: true
      })
    )

    executor = new ToolExecutor()
  })

  it('should execute tool successfully', async () => {
    mockTool.execute.mockResolvedValue({ success: true, output: 'ok' })

    const result = await executor.execute('test-tool', { arg1: 'val' }, {} as any)

    expect(result.success).toBe(true)
    expect(result.output).toBe('ok')
    expect(result.metadata).toEqual(
      expect.objectContaining({
        permissionPreview: expect.objectContaining({
          template: 'balanced',
          allowedByPolicy: true
        })
      })
    )
    expect(mockTool.execute).toHaveBeenCalled()
  })

  it('should resolve alias names before policy check and execution', async () => {
    vi.mocked(toolRegistry.resolveName).mockReturnValue('file_read')

    await executor.execute('read', { arg1: 'val' }, {} as any)

    expect(toolRegistry.resolveName).toHaveBeenCalledWith('read')
    expect(defaultPolicy.getExecutionPreview).toHaveBeenCalledWith('file_read', 'read')
    expect(toolRegistry.get).toHaveBeenCalledWith('file_read')
  })

  it('should deny if policy forbids', async () => {
    vi.mocked(defaultPolicy.getExecutionPreview).mockReturnValue({
      requestedName: 'test-tool',
      resolvedName: 'test-tool',
      template: 'safe',
      permission: 'deny',
      source: 'template',
      dangerous: true,
      highRisk: true,
      highRiskEnforced: false,
      requiresConfirmation: false,
      allowedByPolicy: false,
      allowedWithoutConfirmation: false,
      reason: 'Permission template or custom policy denies this tool',
      confirmReason: 'Safe template denies write operations'
    })

    const result = await executor.execute('test-tool', {}, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not allowed by policy')
    expect(result.metadata).toEqual(
      expect.objectContaining({
        permissionPreview: expect.objectContaining({
          template: 'safe',
          permission: 'deny',
          allowedByPolicy: false
        })
      })
    )
    expect(mockTool.execute).not.toHaveBeenCalled()
  })

  it('should fail if tool not found', async () => {
    vi.mocked(toolRegistry.get).mockReturnValue(undefined)

    const result = await executor.execute('missing-tool', {}, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should include suggestion when tool is not found', async () => {
    vi.mocked(toolRegistry.get).mockReturnValue(undefined)
    vi.mocked(toolRegistry.suggestName).mockReturnValue('file_read')

    const result = await executor.execute('read_file', {}, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Did you mean 'file_read'?")
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

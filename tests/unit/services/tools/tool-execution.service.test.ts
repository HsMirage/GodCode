import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToolExecutionService } from '@/main/services/tools/tool-execution.service'
import { toolRegistry } from '@/main/services/tools/tool-registry'
import { defaultPolicy } from '@/main/services/tools/permission-policy'
import type { BrowserTool, BrowserToolContext, ToolResult } from '@/main/services/ai-browser/types'

vi.mock('@/main/services/tools/tool-registry')
vi.mock('@/main/services/tools/permission-policy')
vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }))
    }))
  }
}))
vi.mock('@/main/services/hooks', () => ({
  hookManager: {
    emitToolStart: vi.fn().mockResolvedValue({ shouldSkip: false }),
    emitToolEnd: vi.fn().mockResolvedValue({})
  }
}))

describe('ToolExecutionService', () => {
  let service: ToolExecutionService

  const mockBrowserTool: BrowserTool = {
    name: 'browser_test',
    description: 'Test browser tool',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate' }
      },
      required: ['url']
    },
    execute: vi.fn()
  }

  const mockRegistryTool = {
    definition: {
      name: 'registry_test',
      description: 'Test registry tool',
      parameters: [{ name: 'input', type: 'string', description: 'Input', required: true }],
      category: 'file' as const
    },
    execute: vi.fn()
  }

  const mockContext: BrowserToolContext = {
    viewId: 'test-view',
    webContents: null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(toolRegistry.resolveName).mockImplementation((name: string) => name)
    vi.mocked(toolRegistry.suggestName).mockReturnValue(undefined)
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
    vi.mocked(toolRegistry.get).mockReturnValue(undefined)
    vi.mocked(toolRegistry.list).mockReturnValue([])

    service = new ToolExecutionService()
  })

  afterEach(() => {
    service.clearBrowserTools()
  })

  describe('registerBrowserTools', () => {
    it('should register browser tools', () => {
      service.registerBrowserTools([mockBrowserTool])
      const tools = service.getAllTools()
      expect(tools).toHaveLength(1)
      expect((tools[0] as BrowserTool).name).toBe('browser_test')
    })
  })

  describe('clearBrowserTools', () => {
    it('should clear all registered browser tools', () => {
      service.registerBrowserTools([mockBrowserTool])
      service.clearBrowserTools()
      expect(service.getAllTools()).toHaveLength(0)
    })
  })

  describe('getAllTools', () => {
    it('should combine browser tools and registry tools', () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(toolRegistry.list).mockReturnValue([mockRegistryTool as any])

      const tools = service.getAllTools()
      expect(tools).toHaveLength(2)
    })
  })

  describe('getToolDefinitions', () => {
    it('should return browser tool definitions in correct format', () => {
      service.registerBrowserTools([mockBrowserTool])

      const definitions = service.getToolDefinitions()
      expect(definitions).toHaveLength(1)
      expect(definitions[0]).toEqual({
        name: 'browser_test',
        description: 'Test browser tool',
        parameters: mockBrowserTool.parameters
      })
    })

    it('should convert registry tool definitions to JSON Schema format', () => {
      vi.mocked(toolRegistry.list).mockReturnValue([mockRegistryTool as any])

      const definitions = service.getToolDefinitions()
      expect(definitions).toHaveLength(1)
      expect(definitions[0].name).toBe('registry_test')
      expect(definitions[0].parameters).toEqual({
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input' }
        },
        required: ['input'],
        additionalProperties: false
      })
    })
  })

  describe('executeTool', () => {
    it('should execute browser tool successfully', async () => {
      service.registerBrowserTools([mockBrowserTool])
      const mockResult: ToolResult = { success: true, data: { url: 'https://test.com' } }
      vi.mocked(mockBrowserTool.execute).mockResolvedValue(mockResult)

      const output = await service.executeTool(
        { id: 'call-1', name: 'browser_test', arguments: { url: 'https://test.com' } },
        mockContext
      )

      expect(output.success).toBe(true)
      expect(output.result).toEqual(mockResult)
      expect(output.permissionPreview).toEqual(
        expect.objectContaining({
          requestedName: 'browser_test',
          resolvedName: 'browser_test',
          allowedByPolicy: true
        })
      )
      expect(output.durationMs).toBeGreaterThanOrEqual(0)
      expect(mockBrowserTool.execute).toHaveBeenCalledWith({ url: 'https://test.com' }, mockContext)
    })

    it('should resolve alias before policy check and lookup', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(toolRegistry.resolveName).mockReturnValue('browser_test')
      vi.mocked(mockBrowserTool.execute).mockResolvedValue({ success: true })

      const output = await service.executeTool(
        { id: 'call-1', name: 'read', arguments: { url: 'https://test.com' } },
        mockContext
      )

      expect(output.success).toBe(true)
      expect(toolRegistry.resolveName).toHaveBeenCalledWith('read')
      expect(defaultPolicy.getExecutionPreview).toHaveBeenCalledWith('browser_test', 'read')
      expect(mockBrowserTool.execute).toHaveBeenCalled()
    })

    it('should deny execution if policy forbids', async () => {
      vi.mocked(defaultPolicy.getExecutionPreview).mockReturnValue({
        requestedName: 'forbidden_tool',
        resolvedName: 'forbidden_tool',
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

      const output = await service.executeTool(
        { id: 'call-1', name: 'forbidden_tool', arguments: {} },
        mockContext
      )

      expect(output.success).toBe(false)
      expect(output.permissionPreview).toEqual(
        expect.objectContaining({
          requestedName: 'forbidden_tool',
          resolvedName: 'forbidden_tool',
          allowedByPolicy: false,
          template: 'safe',
          permission: 'deny'
        })
      )
      expect(output.error).toContain('not allowed by policy')
    })

    it('should return error if tool not found', async () => {
      const output = await service.executeTool(
        { id: 'call-1', name: 'nonexistent_tool', arguments: {} },
        mockContext
      )

      expect(output.success).toBe(false)
      expect(output.error).toContain('not found')
    })

    it('should include suggestion when tool is not found', async () => {
      vi.mocked(toolRegistry.suggestName).mockReturnValue('file_read')

      const output = await service.executeTool(
        { id: 'call-1', name: 'read_file', arguments: {} },
        mockContext
      )

      expect(output.success).toBe(false)
      expect(output.error).toContain("Did you mean 'file_read'?")
    })

    it('should handle tool execution errors', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute).mockRejectedValue(new Error('Execution failed'))

      const output = await service.executeTool(
        { id: 'call-1', name: 'browser_test', arguments: { url: 'https://test.com' } },
        mockContext
      )

      expect(output.success).toBe(false)
      expect(output.error).toContain('Execution failed')
    })

    it('should timeout long-running tools', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      )

      const output = await service.executeTool(
        { id: 'call-1', name: 'browser_test', arguments: {} },
        mockContext,
        { timeoutMs: 50 }
      )

      expect(output.success).toBe(false)
      expect(output.error).toContain('timed out')
    })

    it('should prefer browser tools over registry tools with same name', async () => {
      const browserToolWithSameName: BrowserTool = {
        ...mockBrowserTool,
        name: 'same_name'
      }
      const registryToolWithSameName = {
        ...mockRegistryTool,
        definition: { ...mockRegistryTool.definition, name: 'same_name' }
      }

      service.registerBrowserTools([browserToolWithSameName])
      vi.mocked(toolRegistry.get).mockReturnValue(registryToolWithSameName as any)
      vi.mocked(browserToolWithSameName.execute).mockResolvedValue({ success: true })

      await service.executeTool({ id: 'call-1', name: 'same_name', arguments: {} }, mockContext)

      expect(browserToolWithSameName.execute).toHaveBeenCalled()
      expect(registryToolWithSameName.execute).not.toHaveBeenCalled()
    })
  })

  describe('executeToolCalls', () => {
    it('should execute multiple tool calls in sequence', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute).mockResolvedValue({ success: true })

      const result = await service.executeToolCalls(
        [
          { id: 'call-1', name: 'browser_test', arguments: {} },
          { id: 'call-2', name: 'browser_test', arguments: {} }
        ],
        mockContext
      )

      expect(result.outputs).toHaveLength(2)
      expect(result.allSucceeded).toBe(true)
      expect(mockBrowserTool.execute).toHaveBeenCalledTimes(2)
    })

    it('should stop on first error when stopOnError is true', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute)
        .mockResolvedValueOnce({ success: false, error: 'First failed' })
        .mockResolvedValueOnce({ success: true })

      const result = await service.executeToolCalls(
        [
          { id: 'call-1', name: 'browser_test', arguments: {} },
          { id: 'call-2', name: 'browser_test', arguments: {} }
        ],
        mockContext,
        { stopOnError: true }
      )

      expect(result.outputs).toHaveLength(1)
      expect(result.allSucceeded).toBe(false)
      expect(mockBrowserTool.execute).toHaveBeenCalledTimes(1)
    })

    it('should continue on error when stopOnError is false', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute)
        .mockResolvedValueOnce({ success: false, error: 'First failed' })
        .mockResolvedValueOnce({ success: true })

      const result = await service.executeToolCalls(
        [
          { id: 'call-1', name: 'browser_test', arguments: {} },
          { id: 'call-2', name: 'browser_test', arguments: {} }
        ],
        mockContext,
        { stopOnError: false }
      )

      expect(result.outputs).toHaveLength(2)
      expect(result.allSucceeded).toBe(false)
      expect(mockBrowserTool.execute).toHaveBeenCalledTimes(2)
    })

    it('should allow alias in scoped allowlist', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(toolRegistry.resolveName).mockImplementation((name: string) => {
        if (name === 'read') return 'browser_test'
        return name
      })
      vi.mocked(mockBrowserTool.execute).mockResolvedValue({ success: true })

      await service.withAllowedTools(['read'], async () => {
        const result = await service.executeToolCalls(
          [{ id: 'call-1', name: 'read', arguments: { url: 'https://test.com' } }],
          mockContext
        )
        expect(result.allSucceeded).toBe(true)
      })
    })
  })

  describe('createLoopExecutor', () => {
    it('should return a function that executes tool calls', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute).mockResolvedValue({ success: true })

      const executor = service.createLoopExecutor(mockContext)

      const result = await executor([{ id: 'call-1', name: 'browser_test', arguments: {} }])

      expect(result.outputs).toHaveLength(1)
      expect(result.allSucceeded).toBe(true)
    })

    it('should track iteration count and stop when max exceeded', async () => {
      service.registerBrowserTools([mockBrowserTool])
      vi.mocked(mockBrowserTool.execute).mockResolvedValue({ success: true })

      const executor = service.createLoopExecutor(mockContext, { maxIterations: 2 })

      await executor([{ id: 'call-1', name: 'browser_test', arguments: {} }])
      await executor([{ id: 'call-2', name: 'browser_test', arguments: {} }])
      const result = await executor([{ id: 'call-3', name: 'browser_test', arguments: {} }])

      expect(result.outputs).toHaveLength(0)
      expect(result.allSucceeded).toBe(false)
    })
  })

  describe('formatResultsForLLM', () => {
    it('should format outputs for LLM consumption', () => {
      const outputs = [
        {
          toolCall: { id: 'call-1', name: 'test', arguments: {} },
          result: { success: true, data: 'result1' },
          success: true,
          durationMs: 100
        },
        {
          toolCall: { id: 'call-2', name: 'test', arguments: {} },
          result: { success: false, error: 'failed' },
          success: false,
          error: 'failed',
          durationMs: 50
        }
      ]

      const formatted = service.formatResultsForLLM(outputs)

      expect(formatted).toHaveLength(2)
      expect(formatted[0]).toEqual({
        tool_use_id: 'call-1',
        content: JSON.stringify({ success: true, data: 'result1' })
      })
      expect(formatted[1]).toEqual({
        tool_use_id: 'call-2',
        content: JSON.stringify({ success: false, error: 'failed' })
      })
    })
  })
})

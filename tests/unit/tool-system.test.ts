import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from '@/main/services/tools/tool-registry'
import { PermissionPolicy } from '@/main/services/tools/permission-policy'
import type { Tool } from '@/main/services/tools/tool.interface'

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  const mockTool: Tool = {
    definition: {
      name: 'test_tool',
      description: 'Test tool',
      parameters: [],
      category: 'system'
    },
    async execute() {
      return { success: true, output: 'test' }
    }
  }

  it('should register a tool', () => {
    registry.register(mockTool)
    expect(registry.get('test_tool')).toBe(mockTool)
  })

  it('should list all tools', () => {
    registry.register(mockTool)
    const tools = registry.list()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toBe(mockTool)
  })

  it('should filter by category', () => {
    registry.register(mockTool)
    const systemTools = registry.listByCategory('system')
    expect(systemTools).toHaveLength(1)

    const fileTools = registry.listByCategory('file')
    expect(fileTools).toHaveLength(0)
  })
})

describe('PermissionPolicy', () => {
  let policy: PermissionPolicy

  beforeEach(() => {
    policy = new PermissionPolicy()
  })

  it('should allow all tools by default', () => {
    expect(policy.isAllowed('any_tool')).toBe(true)
  })

  it('should deny tools in deny list', () => {
    policy.deny('dangerous_tool')
    expect(policy.isAllowed('dangerous_tool')).toBe(false)
  })

  it('should allow only whitelisted tools when allowlist is set', () => {
    policy.allow('safe_tool')
    expect(policy.isAllowed('safe_tool')).toBe(true)
    expect(policy.isAllowed('other_tool')).toBe(false)
  })

  it('should prioritize deny over allow', () => {
    policy.allow('tool1')
    policy.deny('tool1')
    expect(policy.isAllowed('tool1')).toBe(false)
  })
})

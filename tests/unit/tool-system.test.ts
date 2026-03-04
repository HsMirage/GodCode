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

  it('should resolve alias to canonical tool name', () => {
    registry.register(mockTool)

    expect(registry.resolveName('read')).toBe('file_read')
    expect(registry.resolveName('test_tool')).toBe('test_tool')
  })

  it('should return suggested name for unknown tools', () => {
    registry.register(mockTool)

    expect(registry.suggestName('rea')).toBe('read')
    expect(registry.suggestName('read')).toBe('file_read')
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

  it('should normalize deny aliases to canonical tool names', () => {
    policy.deny('read')

    expect(policy.isAllowed('read')).toBe(false)
    expect(policy.isAllowed('file_read')).toBe(false)
  })

  it('should normalize allow aliases to canonical tool names', () => {
    policy.allow('read')

    expect(policy.isAllowed('read')).toBe(true)
    expect(policy.isAllowed('file_read')).toBe(true)
    expect(policy.isAllowed('file_write')).toBe(false)
  })

  it('should provide deny preview for safe template restricted tools', () => {
    policy.applyTemplate('safe')
    const preview = policy.getExecutionPreview('bash')

    expect(preview).toEqual(
      expect.objectContaining({
        requestedName: 'bash',
        resolvedName: 'bash',
        template: 'safe',
        permission: 'deny',
        allowedByPolicy: false,
        allowedWithoutConfirmation: false
      })
    )
    expect(preview.reason).toContain('denies this tool')
  })

  it('should switch template behavior predictably across previews', () => {
    policy.applyTemplate('safe')
    const safePreview = policy.getExecutionPreview('browser_navigate')

    policy.applyTemplate('full')
    const fullPreview = policy.getExecutionPreview('browser_navigate')

    expect(safePreview).toEqual(
      expect.objectContaining({
        template: 'safe',
        permission: 'deny',
        allowedByPolicy: false,
        allowedWithoutConfirmation: false
      })
    )

    expect(fullPreview).toEqual(
      expect.objectContaining({
        template: 'full',
        permission: 'auto',
        allowedByPolicy: true,
        allowedWithoutConfirmation: true
      })
    )
  })

  it('should enforce confirmation for high-risk tools even when custom permission is auto', () => {
    policy.setPermission({
      name: 'bash',
      permission: 'auto'
    })

    const preview = policy.getExecutionPreview('bash')

    expect(preview).toEqual(
      expect.objectContaining({
        resolvedName: 'bash',
        highRisk: true,
        highRiskEnforced: true,
        permission: 'confirm',
        requiresConfirmation: true,
        allowedByPolicy: true,
        allowedWithoutConfirmation: false,
        dangerous: true
      })
    )
  })

  it('should normalize custom permission aliases to canonical tool names', () => {
    policy.setPermission({
      name: 'read',
      permission: 'confirm',
      confirmReason: 'Needs manual review'
    })

    expect(policy.getPermission('read')).toEqual(
      expect.objectContaining({
        name: 'file_read',
        permission: 'confirm',
        confirmReason: 'Needs manual review'
      })
    )
    expect(policy.getPermission('file_read')).toEqual(
      expect.objectContaining({
        name: 'file_read',
        permission: 'confirm',
        confirmReason: 'Needs manual review'
      })
    )
  })
})
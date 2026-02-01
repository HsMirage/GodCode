import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import { fileListTool } from '@/main/services/tools/builtin/file-list'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import fs from 'fs/promises'

vi.mock('fs/promises')

describe('fileListTool', () => {
  const workspaceDir = '/test/workspace'
  const context: ToolExecutionContext = {
    workspaceDir,
    sessionId: 'test-session'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should list files in the workspace root by default', async () => {
    const mockEntries = [
      { name: 'file1.txt', isDirectory: () => false },
      { name: 'dir1', isDirectory: () => true }
    ]
    vi.mocked(fs.readdir).mockResolvedValue(mockEntries as any)

    const result = await fileListTool.execute({}, context)

    expect(result.success).toBe(true)
    const files = JSON.parse(result.output)
    expect(files).toHaveLength(2)
    expect(files[0]).toEqual({ name: 'file1.txt', type: 'file' })
    expect(files[1]).toEqual({ name: 'dir1', type: 'directory' })
    expect(fs.readdir).toHaveBeenCalledWith(workspaceDir, { withFileTypes: true })
  })

  it('should list files in a subdirectory', async () => {
    const mockEntries = [{ name: 'subfile.txt', isDirectory: () => false }]
    vi.mocked(fs.readdir).mockResolvedValue(mockEntries as any)

    const result = await fileListTool.execute({ path: 'subdir' }, context)

    expect(result.success).toBe(true)
    const files = JSON.parse(result.output)
    expect(files).toHaveLength(1)
    expect(files[0]).toEqual({ name: 'subfile.txt', type: 'file' })
    expect(fs.readdir).toHaveBeenCalledWith(path.resolve(workspaceDir, 'subdir'), {
      withFileTypes: true
    })
  })

  it('should prevent access outside workspace', async () => {
    const result = await fileListTool.execute({ path: '../outside' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Access denied')
    expect(fs.readdir).not.toHaveBeenCalled()
  })

  it('should handle fs errors gracefully', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'))

    const result = await fileListTool.execute({ path: 'nonexistent' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Directory not found')
  })
})

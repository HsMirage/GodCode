import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import { fileWriteTool } from '@/main/services/tools/builtin/file-write'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import fs from 'fs/promises'

vi.mock('fs/promises')

describe('fileWriteTool', () => {
  const workspaceDir = '/test/workspace'
  const context: ToolExecutionContext = {
    workspaceDir,
    sessionId: 'test-session'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should write to a file successfully', async () => {
    const content = 'New content'
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    const result = await fileWriteTool.execute({ path: 'output.txt', content }, context)

    expect(result.success).toBe(true)
    expect(result.output).toContain('File written successfully')
    expect(result.metadata).toEqual({
      path: 'output.txt',
      size: content.length
    })

    const targetPath = path.resolve(workspaceDir, 'output.txt')
    expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(targetPath), { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith(targetPath, content, 'utf-8')
  })

  it('should prevent writing outside workspace', async () => {
    const result = await fileWriteTool.execute({ path: '../hack.txt', content: 'payload' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Access denied')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('should handle fs errors gracefully', async () => {
    vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'))

    const result = await fileWriteTool.execute(
      { path: 'protected/file.txt', content: 'test' },
      context
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Permission denied')
  })
})

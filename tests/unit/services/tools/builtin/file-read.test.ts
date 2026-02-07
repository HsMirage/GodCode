import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import { fileReadTool } from '@/main/services/tools/builtin/file-read'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import fs from 'fs/promises'

vi.mock('fs/promises')

describe('fileReadTool', () => {
  const workspaceDir = path.resolve('test', 'workspace')
  const context: ToolExecutionContext = {
    workspaceDir,
    sessionId: 'test-session'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should read a file successfully', async () => {
    const fileContent = 'Hello, world!'
    vi.mocked(fs.readFile).mockResolvedValue(fileContent)

    const result = await fileReadTool.execute({ path: 'test.txt' }, context)

    expect(result.success).toBe(true)
    expect(result.output).toBe(fileContent)
    expect(result.metadata).toEqual({
      path: 'test.txt',
      size: fileContent.length
    })
    expect(fs.readFile).toHaveBeenCalledWith(path.resolve(workspaceDir, 'test.txt'), 'utf-8')
  })

  it('should prevent reading outside workspace', async () => {
    const result = await fileReadTool.execute({ path: '../secret.txt' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Access denied')
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('should handle fs errors gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'))

    const result = await fileReadTool.execute({ path: 'missing.txt' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toBe('File not found')
  })
})

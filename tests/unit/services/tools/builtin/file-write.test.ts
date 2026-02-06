import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import { fileWriteTool } from '@/main/services/tools/builtin/file-write'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import fs from 'fs/promises'

vi.mock('fs/promises')
vi.mock('@/main/services/artifact.service', () => ({
  ArtifactService: {
    getInstance: () => ({
      createArtifact: vi.fn().mockResolvedValue({ id: 'test-artifact-id' })
    })
  }
}))

describe('fileWriteTool', () => {
  const workspaceDir = path.resolve('test-workspace')
  const context: ToolExecutionContext = {
    workspaceDir,
    sessionId: 'test-session'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // 默认模拟“文件不存在”，让 file_write 走 created 分支
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
  })

  it('should write to a file successfully', async () => {
    const content = 'New content'
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    const result = await fileWriteTool.execute({ path: 'output.txt', content }, context)

    expect(result.success).toBe(true)
    expect(result.output).toContain('File written successfully')
    expect(result.metadata).toEqual({
      path: 'output.txt',
      size: Buffer.byteLength(content, 'utf8'),
      changeType: 'created'
    })

    const targetPath = path.resolve(workspaceDir, 'output.txt')
    expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(targetPath), { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith(targetPath, content, 'utf-8')
  })

  it('should prevent writing outside workspace', async () => {
    const result = await fileWriteTool.execute(
      { path: path.join('..', 'hack.txt'), content: 'payload' },
      context
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Access denied')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('should handle fs errors gracefully', async () => {
    vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'))

    const result = await fileWriteTool.execute(
      { path: path.join('protected', 'file.txt'), content: 'test' },
      context
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Permission denied')
  })
})

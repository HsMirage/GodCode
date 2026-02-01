import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import simpleGit from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir())
  }
}))

import { gitService } from '@/main/services/git.service'

vi.mock('simple-git')

describe('GitService', () => {
  let testDir: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGitInstance: any

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `test-git-${Date.now()}-${Math.random().toString(36).substring(7)}`
    )
    await fs.mkdir(testDir, { recursive: true })

    mockGitInstance = {
      status: vi.fn(),
      diff: vi.fn(),
      log: vi.fn()
    }

    vi.mocked(simpleGit).mockReturnValue(mockGitInstance)

    gitService.clearCache()
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error)
    }
    vi.clearAllMocks()
  })

  describe('isGitRepo', () => {
    it('should return true when git status succeeds', async () => {
      mockGitInstance.status.mockResolvedValue({})

      const result = await gitService.isGitRepo(testDir)

      expect(result).toBe(true)
      expect(mockGitInstance.status).toHaveBeenCalled()
    })

    it('should return false when git status fails', async () => {
      mockGitInstance.status.mockRejectedValue(new Error('Not a git repository'))

      const result = await gitService.isGitRepo(testDir)

      expect(result).toBe(false)
    })
  })

  describe('status', () => {
    it('should return formatted status object', async () => {
      const mockStatus = {
        current: 'main',
        ahead: 1,
        behind: 2,
        modified: ['mod.txt'],
        created: ['new.txt'],
        deleted: ['del.txt'],
        staged: ['staged.txt'],
        not_added: [],
        conflicted: []
      }
      mockGitInstance.status.mockResolvedValue(mockStatus)

      const result = await gitService.status(testDir)

      expect(result).toEqual({
        branch: 'main',
        ahead: 1,
        behind: 2,
        files: expect.arrayContaining([
          { path: 'mod.txt', status: 'modified', staged: false },
          { path: 'new.txt', status: 'created', staged: false },
          { path: 'del.txt', status: 'deleted', staged: false },
          { path: 'staged.txt', status: 'staged', staged: true }
        ])
      })
    })

    it('should handle errors gracefully', async () => {
      mockGitInstance.status.mockRejectedValue(new Error('Git error'))

      await expect(gitService.status(testDir)).rejects.toThrow('Git error')
    })
  })

  describe('diff', () => {
    it('should get diff for repository', async () => {
      const mockDiff = 'diff --git a/file b/file...'
      mockGitInstance.diff.mockResolvedValue(mockDiff)

      const result = await gitService.diff(testDir)

      expect(result).toBe(mockDiff)
      expect(mockGitInstance.diff).toHaveBeenCalledWith()
    })

    it('should get diff for specific file', async () => {
      const mockDiff = 'diff for file'
      mockGitInstance.diff.mockResolvedValue(mockDiff)
      const filePath = 'file.txt'

      const result = await gitService.diff(testDir, filePath)

      expect(result).toBe(mockDiff)
      expect(mockGitInstance.diff).toHaveBeenCalledWith([filePath])
    })

    it('should validate file path before diff', async () => {
      await expect(gitService.diff(testDir, '../outside')).rejects.toThrow(
        'Path traversal detected'
      )
      expect(mockGitInstance.diff).not.toHaveBeenCalled()
    })
  })

  describe('log', () => {
    it('should retrieve commit history', async () => {
      const mockLog = {
        all: [{ hash: '123', date: '2023-01-01', message: 'init' }],
        total: 1,
        latest: { hash: '123' }
      }
      mockGitInstance.log.mockResolvedValue(mockLog)

      const result = await gitService.log(testDir, 5)

      expect(result).toBe(mockLog)
      expect(mockGitInstance.log).toHaveBeenCalledWith({ maxCount: 5 })
    })

    it('should use default maxCount', async () => {
      mockGitInstance.log.mockResolvedValue({ all: [] })

      await gitService.log(testDir)

      expect(mockGitInstance.log).toHaveBeenCalledWith({ maxCount: 10 })
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir())
  }
}))

import { fileTreeService } from '@/main/services/file-tree.service'

describe('FileTreeService', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `test-filetree-${Date.now()}-${Math.random().toString(36).substring(7)}`
    )
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fileTreeService.closeAll()
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error)
    }
  })

  describe('getTree', () => {
    it('should get directory tree structure', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1')
      await fs.mkdir(path.join(testDir, 'subdir'))
      await fs.writeFile(path.join(testDir, 'subdir', 'file2.txt'), 'content2')

      const tree = await fileTreeService.getTree(testDir)

      expect(tree.name).toBe(path.basename(testDir))
      expect(tree.type).toBe('directory')
      expect(tree.children).toBeDefined()

      const file1 = tree.children?.find(c => c.name === 'file1.txt')
      expect(file1).toBeDefined()
      expect(file1?.type).toBe('file')

      const subdir = tree.children?.find(c => c.name === 'subdir')
      expect(subdir).toBeDefined()
      expect(subdir?.type).toBe('directory')

      const file2 = subdir?.children?.find(c => c.name === 'file2.txt')
      expect(file2).toBeDefined()
      expect(file2?.type).toBe('file')
    })

    it('should ignore hidden files and node_modules', async () => {
      await fs.writeFile(path.join(testDir, '.hidden'), 'hidden')
      await fs.mkdir(path.join(testDir, 'node_modules'))
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'visible')

      const tree = await fileTreeService.getTree(testDir)

      expect(tree.children?.find(c => c.name === '.hidden')).toBeUndefined()
      expect(tree.children?.find(c => c.name === 'node_modules')).toBeUndefined()
      expect(tree.children?.find(c => c.name === 'visible.txt')).toBeDefined()
    })

    it('should handle reading a single file', async () => {
      await fs.writeFile(path.join(testDir, 'single.txt'), 'content')

      const node = await fileTreeService.getTree(testDir, 'single.txt')

      expect(node.name).toBe('single.txt')
      expect(node.type).toBe('file')
      expect(node.size).toBeGreaterThan(0)
    })

    it('should throw error for unsafe paths', async () => {
      await expect(fileTreeService.getTree(testDir, '../unsafe')).rejects.toThrow(
        'Path traversal detected'
      )
    })
  })

  describe('watchDirectory', () => {
    it('should emit events on file changes', async () => {
      return new Promise<void>(async (resolve, reject) => {
        const watchId = 'test-watcher-1'
        const testFile = path.join(testDir, 'watch-test.txt')

        fileTreeService.once('change', (id, event) => {
          try {
            expect(id).toBe(watchId)
            expect(event.type).toBe('add')
            expect(event.path).toBe('watch-test.txt')
            resolve()
          } catch (e) {
            reject(e)
          }
        })

        fileTreeService.watchDirectory(watchId, testDir)

        await new Promise(r => setTimeout(r, 100))

        await fs.writeFile(testFile, 'content')
      })
    })

    it('should prevent duplicate watchers', async () => {
      const watchId = 'duplicate-test'

      fileTreeService.watchDirectory(watchId, testDir)
      fileTreeService.watchDirectory(watchId, testDir)

      await expect(fileTreeService.unwatchDirectory(watchId)).resolves.not.toThrow()
    })
  })

  describe('unwatchDirectory', () => {
    it('should stop receiving events after unwatch', async () => {
      const watchId = 'unwatch-test'
      const testFile = path.join(testDir, 'unwatch.txt')
      const changeListener = vi.fn()

      fileTreeService.watchDirectory(watchId, testDir)
      fileTreeService.on('change', changeListener)

      await new Promise(r => setTimeout(r, 100))

      await fileTreeService.unwatchDirectory(watchId)

      await fs.writeFile(testFile, 'content')

      await new Promise(r => setTimeout(r, 200))

      expect(changeListener).not.toHaveBeenCalled()
    })
  })
})

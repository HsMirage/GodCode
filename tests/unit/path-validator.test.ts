import { describe, it, expect } from 'vitest'
import { PathValidator } from '@/shared/path-validator'
import path from 'path'

describe('PathValidator', () => {
  const rootDir = '/workspace'

  describe('isPathSafe', () => {
    it('should allow paths within root directory', () => {
      expect(PathValidator.isPathSafe('file.txt', rootDir)).toBe(true)
      expect(PathValidator.isPathSafe('sub/file.txt', rootDir)).toBe(true)
      expect(PathValidator.isPathSafe('./file.txt', rootDir)).toBe(true)
    })

    it('should block path traversal attempts', () => {
      expect(PathValidator.isPathSafe('../outside.txt', rootDir)).toBe(false)
      expect(PathValidator.isPathSafe('../../etc/passwd', rootDir)).toBe(false)
      expect(PathValidator.isPathSafe('/etc/passwd', rootDir)).toBe(false)
    })

    it('should handle absolute paths correctly', () => {
      expect(PathValidator.isPathSafe(path.join(rootDir, 'file.txt'), rootDir)).toBe(true)
      expect(PathValidator.isPathSafe('/other/path', rootDir)).toBe(false)
    })
  })

  describe('resolveSafePath', () => {
    it('should resolve safe paths', () => {
      const result = PathValidator.resolveSafePath('file.txt', rootDir)
      expect(result).toContain('workspace')
      expect(result).toContain('file.txt')
    })

    it('should throw on unsafe paths', () => {
      expect(() => PathValidator.resolveSafePath('../outside.txt', rootDir)).toThrow(
        'Path traversal detected'
      )
    })
  })

  describe('normalizePath', () => {
    it('should normalize path separators', () => {
      expect(PathValidator.normalizePath('a\\b\\c')).toBe('a/b/c')
      expect(PathValidator.normalizePath('a/b/c')).toBe('a/b/c')
    })

    it('should remove redundant separators', () => {
      expect(PathValidator.normalizePath('a//b//c')).toBe('a/b/c')
    })
  })
})

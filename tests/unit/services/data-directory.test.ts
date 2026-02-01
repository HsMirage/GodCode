import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataDirectoryService } from '@/main/services/data-directory.service'
import path from 'path'
import fs from 'fs'

// Mock Electron app module
const mockUserDataPath = '/tmp/test-userdata'
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return mockUserDataPath
      return '/tmp/test'
    })
  }
}))

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn()
  }
}))

describe('DataDirectoryService', () => {
  let service: DataDirectoryService

  beforeEach(() => {
    // Reset singleton instance for each test
    // We need to access the private static instance to reset it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(DataDirectoryService as any).instance = null
    service = DataDirectoryService.getInstance()

    // Reset mocks
    vi.clearAllMocks()

    // Default mock behavior for successful creation
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Path Getters', () => {
    it('should return correct user data dir', () => {
      expect(service.getUserDataDir()).toBe(mockUserDataPath)
    })

    it('should return correct backup dir', () => {
      expect(service.getBackupDir()).toBe(path.join(mockUserDataPath, 'backups'))
    })

    it('should return correct log dir', () => {
      expect(service.getLogDir()).toBe(path.join(mockUserDataPath, 'logs'))
    })

    it('should return correct temp dir', () => {
      expect(service.getTempDir()).toBe(path.join(mockUserDataPath, 'temp'))
    })
  })

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const testDir = '/tmp/test-dir'

      await service.ensureDirectoryExists(testDir)

      expect(fs.existsSync).toHaveBeenCalledWith(testDir)
      expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true, mode: 0o755 })
    })

    it('should not create directory if it already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const testDir = '/tmp/test-dir'

      await service.ensureDirectoryExists(testDir)

      expect(fs.existsSync).toHaveBeenCalledWith(testDir)
      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })

    it('should throw error if creation fails', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })
      const testDir = '/tmp/test-dir'

      await expect(service.ensureDirectoryExists(testDir)).rejects.toThrow(
        'Failed to create directory /tmp/test-dir: Permission denied'
      )
    })
  })

  describe('initialize', () => {
    it('should initialize all required directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      // Explicitly allow mkdirSync for this test
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await service.initialize()

      // Should check/create root
      expect(fs.existsSync).toHaveBeenCalledWith(mockUserDataPath)

      // Should check/create subdirectories
      expect(fs.existsSync).toHaveBeenCalledWith(path.join(mockUserDataPath, 'backups'))
      expect(fs.existsSync).toHaveBeenCalledWith(path.join(mockUserDataPath, 'logs'))
      expect(fs.existsSync).toHaveBeenCalledWith(path.join(mockUserDataPath, 'temp'))

      // Should create all 4 directories (root + 3 subdirs)
      expect(fs.mkdirSync).toHaveBeenCalledTimes(4)
    })

    it('should be idempotent (safe to call multiple times)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      await service.initialize()

      // Reset mocks to verify second call does nothing
      vi.clearAllMocks()

      await service.initialize()

      expect(fs.existsSync).not.toHaveBeenCalled()
      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })

    it('should propagate errors during initialization', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      // Force failure for this test only
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Disk full')
      })

      await expect(service.initialize()).rejects.toThrow('Failed to create directory')
    })
  })
})

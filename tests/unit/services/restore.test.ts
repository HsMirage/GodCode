import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RestoreService } from '../../../src/main/services/restore.service'
import * as fs from 'fs'

// Mock dependencies
const mockDb = {
  space: { deleteMany: vi.fn(), createMany: vi.fn() },
  session: { deleteMany: vi.fn(), createMany: vi.fn() },
  message: { deleteMany: vi.fn(), createMany: vi.fn() },
  task: { deleteMany: vi.fn(), createMany: vi.fn() },
  artifact: { deleteMany: vi.fn(), createMany: vi.fn() },
  run: { deleteMany: vi.fn(), createMany: vi.fn() },
  model: { deleteMany: vi.fn(), createMany: vi.fn() },
  apiKey: { deleteMany: vi.fn(), createMany: vi.fn() },
  schemaVersion: { deleteMany: vi.fn(), createMany: vi.fn() }
}

vi.mock('../../../src/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mockDb
    })
  }
}))

vi.mock('../../../src/main/services/schema-version.service', () => ({
  SchemaVersionService: {
    getInstance: () => ({
      getCurrentVersion: vi.fn().mockResolvedValue('1.0.0')
    })
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}))

// Mock backup data
const validBackup = {
  metadata: {
    version: '1.0.0',
    timestamp: '2026-01-31T12:00:00.000Z',
    appVersion: '1.0.0'
  },
  tables: {
    spaces: [{ id: 'space-1', name: 'Test Space' }],
    sessions: [{ id: 'session-1', spaceId: 'space-1' }],
    messages: [],
    tasks: [],
    artifacts: [],
    runs: [],
    models: [],
    apiKeys: [],
    schemaVersions: []
  }
}

describe('RestoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton instance if possible, or just rely on stateless methods where applicable
    // Since we can't easily reset private static instance, we ensure tests are robust
  })

  it('should maintain singleton instance', () => {
    const instance1 = RestoreService.getInstance()
    const instance2 = RestoreService.getInstance()
    expect(instance1).toBe(instance2)
  })

  describe('validateBackup', () => {
    it('should return valid=true for correct backup format', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validBackup))

      const result = await RestoreService.getInstance().validateBackup('/path/to/backup.json')
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return errors for missing metadata', async () => {
      const invalidBackup = { ...validBackup, metadata: undefined }
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidBackup))

      const result = await RestoreService.getInstance().validateBackup('/path/to/backup.json')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing metadata section')
    })

    it('should return errors for missing tables', async () => {
      const invalidBackup = { ...validBackup, tables: undefined }
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidBackup))

      const result = await RestoreService.getInstance().validateBackup('/path/to/backup.json')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing tables section')
    })

    it('should return errors for non-existent file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await RestoreService.getInstance().validateBackup('/nonexistent.json')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Backup file does not exist')
    })

    it('should return errors for invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }')

      const result = await RestoreService.getInstance().validateBackup('/path/to/backup.json')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid JSON format')
    })
  })

  describe('getBackupMetadata', () => {
    it('should return metadata from valid backup', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validBackup))

      const metadata = await RestoreService.getInstance().getBackupMetadata('/path/to/backup.json')
      expect(metadata).toEqual(validBackup.metadata)
    })

    it('should throw error for invalid backup', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      await expect(
        RestoreService.getInstance().getBackupMetadata('/path/to/backup.json')
      ).rejects.toThrow('Invalid JSON format')
    })
  })

  describe('restoreFromBackup', () => {
    it('should throw error for invalid backup', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(
        RestoreService.getInstance().restoreFromBackup('/nonexistent.json')
      ).rejects.toThrow('Invalid backup: Backup file does not exist')
    })

    it('should clear database and import data for valid backup', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validBackup))

      await RestoreService.getInstance().restoreFromBackup('/path/to/backup.json')

      // Verify clearDatabase called (all deleteMany calls)
      expect(mockDb.run.deleteMany).toHaveBeenCalled()
      expect(mockDb.artifact.deleteMany).toHaveBeenCalled()
      expect(mockDb.task.deleteMany).toHaveBeenCalled()
      expect(mockDb.message.deleteMany).toHaveBeenCalled()
      expect(mockDb.session.deleteMany).toHaveBeenCalled()
      expect(mockDb.space.deleteMany).toHaveBeenCalled()
      expect(mockDb.model.deleteMany).toHaveBeenCalled()
      expect(mockDb.apiKey.deleteMany).toHaveBeenCalled()
      expect(mockDb.schemaVersion.deleteMany).toHaveBeenCalled()

      // Verify importData called (createMany calls)
      expect(mockDb.space.createMany).toHaveBeenCalledWith({ data: validBackup.tables.spaces })
      expect(mockDb.session.createMany).toHaveBeenCalledWith({ data: validBackup.tables.sessions })

      // Ensure correct order (Space before Session) - though tough to check precise order with just toHaveBeenCalled
      // We can check invocation order if needed, but existence is good for now.
    })

    it('should import all tables if present', async () => {
      const fullBackup = {
        metadata: validBackup.metadata,
        tables: {
          spaces: [{ id: 's1' }],
          sessions: [{ id: 'ses1' }],
          messages: [{ id: 'm1' }],
          tasks: [{ id: 't1' }],
          artifacts: [{ id: 'a1' }],
          runs: [{ id: 'r1' }],
          models: [{ id: 'mo1' }],
          apiKeys: [{ id: 'ak1' }],
          schemaVersions: [{ id: 'sv1' }]
        }
      }
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fullBackup))

      await RestoreService.getInstance().restoreFromBackup('/path/to/backup.json')

      expect(mockDb.space.createMany).toHaveBeenCalled()
      expect(mockDb.session.createMany).toHaveBeenCalled()
      expect(mockDb.message.createMany).toHaveBeenCalled()
      expect(mockDb.task.createMany).toHaveBeenCalled()
      expect(mockDb.artifact.createMany).toHaveBeenCalled()
      expect(mockDb.run.createMany).toHaveBeenCalled()
      expect(mockDb.model.createMany).toHaveBeenCalled()
      expect(mockDb.apiKey.createMany).toHaveBeenCalled()
      expect(mockDb.schemaVersion.createMany).toHaveBeenCalled()
    })

    it('should handle restore failure gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validBackup))

      // Mock db failure
      mockDb.space.createMany.mockRejectedValueOnce(new Error('DB Error'))

      await expect(
        RestoreService.getInstance().restoreFromBackup('/path/to/backup.json')
      ).rejects.toThrow('Restore failed: DB Error')
    })
  })
})

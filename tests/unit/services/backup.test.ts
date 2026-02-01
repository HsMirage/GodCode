import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BackupService, BackupData } from '@/main/services/backup.service'
import * as fs from 'fs'
import * as path from 'path'

// Mock dependencies
const mockBackupDir = '/tmp/test-backups'
const mockDb = {
  space: { findMany: vi.fn(async () => [{ id: '1', name: 'Test Space' }]) },
  session: { findMany: vi.fn(async () => []) },
  message: { findMany: vi.fn(async () => []) },
  task: { findMany: vi.fn(async () => []) },
  artifact: { findMany: vi.fn(async () => []) },
  run: { findMany: vi.fn(async () => []) },
  model: { findMany: vi.fn(async () => []) },
  apiKey: { findMany: vi.fn(async () => []) },
  schemaVersion: { findMany: vi.fn(async () => []) }
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mockDb
    })
  }
}))

vi.mock('@/main/services/schema-version.service', () => ({
  SchemaVersionService: {
    getInstance: () => ({
      getCurrentVersion: vi.fn(async () => '1.0.0')
    })
  }
}))

vi.mock('@/main/services/data-directory.service', () => ({
  DataDirectoryService: {
    getInstance: () => ({
      getBackupDir: vi.fn(() => mockBackupDir)
    })
  }
}))

// Mock fs module
vi.mock('fs', () => {
  return {
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({
      size: 1024,
      birthtime: new Date('2026-01-31T12:00:00Z'),
      mtime: new Date('2026-01-31T12:00:00Z')
    })),
    readFileSync: vi.fn(() =>
      JSON.stringify({
        metadata: { version: '1.0.0', timestamp: new Date().toISOString() },
        tables: { spaces: [] }
      })
    )
  }
})

describe('BackupService', () => {
  let service: BackupService

  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-ignore
    BackupService.instance = null
    service = BackupService.getInstance()
  })

  it('should implement singleton pattern', () => {
    const instance1 = BackupService.getInstance()
    const instance2 = BackupService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('createBackup should create file with timestamp when no name provided', async () => {
    const filePath = await service.createBackup()

    expect(fs.writeFileSync).toHaveBeenCalled()
    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0]
    expect(callArgs[0]).toContain('backup-20')
    expect(callArgs[0]).toContain('.json')
  })

  it('createBackup should create file with custom name', async () => {
    const customName = 'my-backup'
    const filePath = await service.createBackup(customName)

    expect(filePath).toContain(`backup-${customName}.json`)
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  it('createBackup should sanitize custom names', async () => {
    const unsafeName = 'my/backup@file'
    const filePath = await service.createBackup(unsafeName)

    expect(filePath).not.toContain('my/backup@file')
    expect(filePath).toContain('backup-my_backup_file.json')
  })

  it('createBackup should include all tables', async () => {
    await service.createBackup()

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const content = JSON.parse(writeCall[1] as string)

    expect(content.tables).toHaveProperty('spaces')
    expect(content.tables).toHaveProperty('sessions')
    expect(content.tables).toHaveProperty('messages')
    expect(content.tables).toHaveProperty('tasks')
    expect(content.tables.spaces).toHaveLength(1)
  })

  it('createBackup should include correct metadata', async () => {
    await service.createBackup()

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
    const content = JSON.parse(writeCall[1] as string)

    expect(content.metadata).toHaveProperty('version', '1.0.0')
    expect(content.metadata).toHaveProperty('timestamp')
    expect(content.metadata).toHaveProperty('appVersion', '1.0.0')
  })

  it('listBackups should return empty array when directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const backups = await service.listBackups()
    expect(backups).toEqual([])
  })

  it('listBackups should return sorted backups', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      // @ts-ignore
      'backup-old.json',
      // @ts-ignore
      'backup-new.json'
    ])

    vi.mocked(fs.statSync)
      .mockReturnValueOnce({
        size: 100,
        birthtime: new Date('2025-01-01'),
        mtime: new Date('2025-01-01'),
        // @ts-ignore
        isFile: () => true
      } as fs.Stats)
      .mockReturnValueOnce({
        size: 200,
        birthtime: new Date('2026-01-01'),
        mtime: new Date('2026-01-01'),
        // @ts-ignore
        isFile: () => true
      } as fs.Stats)

    const backups = await service.listBackups()

    expect(backups).toHaveLength(2)
    expect(backups[0].name).toBe('backup-new.json')
    expect(backups[1].name).toBe('backup-old.json')
  })

  it('deleteBackup should delete existing file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)

    // Skip path check mock and assume it passes or mock the entire path module properly
    // The issue is path.resolve is non-configurable in some envs
    // We can rely on fs.unlinkSync being called if path check passes
    // Or we can construct a test case where path check naturally passes

    // Instead of mocking path.resolve, let's use a path that will pass the check
    // The service checks: !resolvedPath.startsWith(resolvedBackupDir)

    // With real path logic, if backupDir is /tmp/test-backups and name is file.json
    // resolved path should be /tmp/test-backups/file.json which starts with /tmp/test-backups

    // So we just need to ensure standard path behavior works
    await service.deleteBackup('backup-test.json')

    expect(fs.unlinkSync).toHaveBeenCalled()
  })

  it('deleteBackup should throw error if file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await expect(service.deleteBackup('non-existent.json')).rejects.toThrow('Backup file not found')
  })

  it('getBackupInfo should return correct metadata', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        metadata: { version: '2.0.0' }
      })
    )

    const info = await service.getBackupInfo('backup-test.json')

    expect(info).not.toBeNull()
    expect(info?.schemaVersion).toBe('2.0.0')
    expect(info?.name).toBe('backup-test.json')
  })

  it('getBackupInfo should return null for missing file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const info = await service.getBackupInfo('missing.json')

    expect(info).toBeNull()
  })
})

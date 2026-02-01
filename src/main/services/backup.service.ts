import { DatabaseService } from './database'
import { SchemaVersionService } from './schema-version.service'
import { DataDirectoryService } from './data-directory.service'
import * as fs from 'fs'
import * as path from 'path'

export interface BackupMetadata {
  name: string
  path: string
  size: number
  createdAt: Date
  schemaVersion: string | null
}

export interface BackupData {
  metadata: {
    version: string | null
    timestamp: string
    appVersion: string
  }
  tables: {
    spaces: any[]
    sessions: any[]
    messages: any[]
    tasks: any[]
    artifacts: any[]
    runs: any[]
    models: any[]
    apiKeys: any[]
    schemaVersions: any[]
  }
}

export class BackupService {
  private static instance: BackupService | null = null

  private constructor() {}

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService()
    }
    return BackupService.instance
  }

  /**
   * Create a full database backup
   * @param name - Optional custom backup name (defaults to timestamp)
   * @returns Path to created backup file
   */
  async createBackup(name?: string): Promise<string> {
    const timestamp = new Date()
    let filename: string

    if (name) {
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
      filename = `backup-${safeName}.json`
    } else {
      const dateStr = timestamp
        .toISOString()
        .replace(/T/, '-')
        .replace(/\..+/, '')
        .replace(/:/g, '')
      filename = `backup-${dateStr}.json`
    }

    const version = await SchemaVersionService.getInstance().getCurrentVersion()
    const db = DatabaseService.getInstance().getClient()

    const [spaces, sessions, messages, tasks, artifacts, runs, models, apiKeys, schemaVersions] =
      await Promise.all([
        db.space.findMany(),
        db.session.findMany(),
        db.message.findMany(),
        db.task.findMany(),
        db.artifact.findMany(),
        db.run.findMany(),
        db.model.findMany(),
        db.apiKey.findMany(),
        db.schemaVersion.findMany()
      ])

    const backupData: BackupData = {
      metadata: {
        version,
        timestamp: timestamp.toISOString(),
        appVersion: '1.0.0'
      },
      tables: {
        spaces,
        sessions,
        messages,
        tasks,
        artifacts,
        runs,
        models,
        apiKeys,
        schemaVersions
      }
    }

    const backupDir = DataDirectoryService.getInstance().getBackupDir()

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const filePath = path.join(backupDir, filename)
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8')

    return filePath
  }

  /**
   * List all available backups
   * @returns Array of backup metadata
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const backupDir = DataDirectoryService.getInstance().getBackupDir()

    if (!fs.existsSync(backupDir)) {
      return []
    }

    const files = fs
      .readdirSync(backupDir)
      .filter(file => file.startsWith('backup-') && file.endsWith('.json'))

    const backups: BackupMetadata[] = []

    for (const file of files) {
      const filePath = path.join(backupDir, file)
      try {
        const stats = fs.statSync(filePath)
        const content = fs.readFileSync(filePath, 'utf-8')
        const data = JSON.parse(content) as BackupData

        backups.push({
          name: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime,
          schemaVersion: data.metadata?.version || null
        })
      } catch (error) {
        console.error(`Failed to read backup file ${file}:`, error)
      }
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * Delete a backup file
   * @param name - Backup filename (e.g., "backup-20260131.json")
   */
  async deleteBackup(name: string): Promise<void> {
    const backupDir = DataDirectoryService.getInstance().getBackupDir()
    const filePath = path.join(backupDir, name)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file not found: ${name}`)
    }

    const resolvedPath = path.resolve(filePath)
    const resolvedBackupDir = path.resolve(backupDir)
    if (!resolvedPath.startsWith(resolvedBackupDir)) {
      throw new Error('Invalid backup file path')
    }

    fs.unlinkSync(filePath)
  }

  /**
   * Get metadata for a specific backup
   * @param name - Backup filename
   * @returns Backup metadata or null if not found
   */
  async getBackupInfo(name: string): Promise<BackupMetadata | null> {
    const backupDir = DataDirectoryService.getInstance().getBackupDir()
    const filePath = path.join(backupDir, name)

    if (!fs.existsSync(filePath)) {
      return null
    }

    try {
      const stats = fs.statSync(filePath)
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content) as BackupData

      return {
        name,
        path: filePath,
        size: stats.size,
        createdAt: stats.birthtime,
        schemaVersion: data.metadata?.version || null
      }
    } catch (error) {
      console.error(`Failed to read backup info for ${name}:`, error)
      return null
    }
  }
}

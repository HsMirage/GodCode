import { DatabaseService } from './database'
import { SchemaVersionService } from './schema-version.service'
import * as fs from 'fs'
import * as path from 'path'

export interface BackupMetadata {
  version: string | null
  timestamp: string
  appVersion: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class RestoreService {
  private static instance: RestoreService | null = null

  private constructor() {}

  static getInstance(): RestoreService {
    if (!RestoreService.instance) {
      RestoreService.instance = new RestoreService()
    }
    return RestoreService.instance
  }

  /**
   * Restore database from backup file
   * @param backupPath - Absolute path to backup JSON file
   * @throws Error if validation fails or restore operation fails
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    const validation = await this.validateBackup(backupPath)
    if (!validation.valid) {
      throw new Error(`Invalid backup: ${validation.errors.join(', ')}`)
    }

    const content = fs.readFileSync(backupPath, 'utf-8')
    const backup = JSON.parse(content)

    const currentVersion = await SchemaVersionService.getInstance().getCurrentVersion()
    if (backup.metadata.version !== currentVersion) {
      console.warn(
        `Restoring backup from schema version ${backup.metadata.version} to ${currentVersion}`
      )
    }

    try {
      await this.clearDatabase()
      await this.importData(backup)
    } catch (error) {
      throw new Error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Validate backup file without restoring
   * @param backupPath - Path to backup file
   * @returns Validation result with errors if any
   */
  async validateBackup(backupPath: string): Promise<ValidationResult> {
    const errors: string[] = []

    if (!fs.existsSync(backupPath)) {
      errors.push('Backup file does not exist')
      return { valid: false, errors }
    }

    try {
      const content = fs.readFileSync(backupPath, 'utf-8')
      let backup: any
      try {
        backup = JSON.parse(content)
      } catch (e) {
        errors.push('Invalid JSON format')
        return { valid: false, errors }
      }

      if (!backup.metadata) {
        errors.push('Missing metadata section')
      }
      if (!backup.tables) {
        errors.push('Missing tables section')
      }

      if (backup.metadata && !backup.metadata.timestamp) {
        errors.push('Missing timestamp in metadata')
      }

      if (backup.tables) {
        const requiredTables = [
          'spaces',
          'sessions',
          'messages',
          'tasks',
          'artifacts',
          'runs',
          'models',
          'apiKeys',
          'schemaVersions'
        ]
        for (const table of requiredTables) {
          if (!Array.isArray(backup.tables[table])) {
            errors.push(`Missing or invalid table: ${table}`)
          }
        }
      }
    } catch (error) {
      errors.push(
        `Failed to validate backup file: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Get metadata from backup file without full restore
   * @param backupPath - Path to backup file
   * @returns Backup metadata
   */
  async getBackupMetadata(backupPath: string): Promise<BackupMetadata> {
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file does not exist')
    }

    const content = fs.readFileSync(backupPath, 'utf-8')
    let backup: any
    try {
      backup = JSON.parse(content)
    } catch (e) {
      throw new Error('Invalid JSON format')
    }

    if (!backup.metadata) {
      throw new Error('Missing metadata in backup file')
    }

    return backup.metadata as BackupMetadata
  }

  private async clearDatabase(): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    // Order matters: dependent tables must be deleted before their parents
    // to satisfy foreign key constraints (e.g., Message -> Session -> Space).
    await db.run.deleteMany()
    await db.artifact.deleteMany()
    await db.task.deleteMany()
    await db.message.deleteMany()
    await db.session.deleteMany()
    await db.space.deleteMany()

    await db.model.deleteMany()
    await db.apiKey.deleteMany()
    await db.schemaVersion.deleteMany()
  }

  private async importData(backup: any): Promise<void> {
    const db = DatabaseService.getInstance().getClient()
    const tables = backup.tables

    // Order matters: parents must be inserted before dependents
    // to satisfy foreign key constraints.
    if (tables.schemaVersions?.length) {
      await db.schemaVersion.createMany({ data: tables.schemaVersions })
    }
    if (tables.apiKeys?.length) {
      await db.apiKey.createMany({ data: tables.apiKeys })
    }
    if (tables.models?.length) {
      await db.model.createMany({ data: tables.models })
    }

    if (tables.spaces?.length) {
      await db.space.createMany({ data: tables.spaces })
    }

    if (tables.sessions?.length) {
      await db.session.createMany({ data: tables.sessions })
    }

    if (tables.messages?.length) {
      await db.message.createMany({ data: tables.messages })
    }

    if (tables.tasks?.length) {
      await db.task.createMany({ data: tables.tasks })
    }

    if (tables.runs?.length) {
      await db.run.createMany({ data: tables.runs })
    }

    if (tables.artifacts?.length) {
      await db.artifact.createMany({ data: tables.artifacts })
    }
  }
}

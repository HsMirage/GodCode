import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Service to manage the application's data directory structure.
 * Ensures all required directories exist with proper permissions.
 */
export class DataDirectoryService {
  private static instance: DataDirectoryService | null = null
  private userDataDir: string
  private isInitialized = false

  private constructor() {
    this.userDataDir = app.getPath('userData')
  }

  static getInstance(): DataDirectoryService {
    if (!DataDirectoryService.instance) {
      DataDirectoryService.instance = new DataDirectoryService()
    }
    return DataDirectoryService.instance
  }

  /**
   * Get the root user data directory path
   */
  getUserDataDir(): string {
    return this.userDataDir
  }

  /**
   * Get the database backups directory path
   */
  getBackupDir(): string {
    return path.join(this.userDataDir, 'backups')
  }

  /**
   * Get the application logs directory path
   */
  getLogDir(): string {
    return path.join(this.userDataDir, 'logs')
  }

  /**
   * Get the temporary files directory path
   */
  getTempDir(): string {
    return path.join(this.userDataDir, 'temp')
  }

  /**
   * Initialize all required data directories
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // Ensure root exists (usually handled by Electron, but good to be safe)
      await this.ensureDirectoryExists(this.userDataDir)

      // Initialize subdirectories
      await this.ensureDirectoryExists(this.getBackupDir())
      await this.ensureDirectoryExists(this.getLogDir())
      await this.ensureDirectoryExists(this.getTempDir())

      // Note: 'db' directory is currently handled by DatabaseService,
      // but we could eventually centralize it here.
      // For now, we respect the existing separation of concerns.

      this.isInitialized = true
      console.log('[DataDirectory] Initialization complete')
    } catch (error) {
      console.error('[DataDirectory] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * @param dirPath Absolute path to the directory
   */
  async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 })
        console.log(`[DataDirectory] Created directory: ${dirPath}`)
      } else {
        // Optional: Check/fix permissions if needed, but for now just skipping
        // fs.chmodSync(dirPath, 0o755)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create directory ${dirPath}: ${message}`)
    }
  }
}

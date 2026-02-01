import { DatabaseService } from './database'

export class SchemaVersionService {
  private static instance: SchemaVersionService | null = null

  private constructor() {}

  static getInstance(): SchemaVersionService {
    if (!SchemaVersionService.instance) {
      SchemaVersionService.instance = new SchemaVersionService()
    }
    return SchemaVersionService.instance
  }

  /**
   * Get the current schema version (most recent)
   * @returns Current version string or null if no versions applied
   */
  async getCurrentVersion(): Promise<string | null> {
    const db = DatabaseService.getInstance().getClient()
    const latest = await db.schemaVersion.findFirst({
      orderBy: {
        appliedAt: 'desc'
      }
    })
    return latest?.version ?? null
  }

  /**
   * Record a new schema version as applied
   * @param version - Version identifier (e.g., "1.0.0", "20260131_001")
   * @param description - Optional description of the migration
   */
  async setVersion(version: string, description?: string): Promise<void> {
    const db = DatabaseService.getInstance().getClient()
    await db.schemaVersion.upsert({
      where: { version },
      create: {
        version,
        description,
        appliedAt: new Date()
      },
      update: {
        description,
        appliedAt: new Date()
      }
    })
  }

  /**
   * Get complete version history ordered by appliedAt DESC
   * @returns Array of version records with version, description, appliedAt
   */
  async getVersionHistory(): Promise<
    Array<{
      version: string
      description: string | null
      appliedAt: Date
    }>
  > {
    const db = DatabaseService.getInstance().getClient()
    const history = await db.schemaVersion.findMany({
      orderBy: {
        appliedAt: 'desc'
      },
      select: {
        version: true,
        description: true,
        appliedAt: true
      }
    })
    return history
  }

  /**
   * Check if a specific version has been applied
   * @param version - Version identifier to check
   * @returns true if version exists in history
   */
  async hasVersion(version: string): Promise<boolean> {
    const db = DatabaseService.getInstance().getClient()
    const count = await db.schemaVersion.count({
      where: { version }
    })
    return count > 0
  }
}

import { app } from 'electron'
import path from 'path'
import { PrismaClient } from '@prisma/client'

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

let embeddedPostgres: EmbeddedPostgresInstance | null = null
let prismaClient: PrismaClient | null = null

export class DatabaseService {
  private static instance: DatabaseService | null = null
  private dbPath: string
  private isInitialized = false

  private constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'db')
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('[Database] Already initialized')
      return
    }

    try {
      console.log('[Database] Initializing embedded PostgreSQL...')
      console.log('[Database] Database directory:', this.dbPath)

      const EmbeddedPostgres = await import('embedded-postgres')
      const EmbeddedPostgresClass = EmbeddedPostgres.default

      embeddedPostgres = new EmbeddedPostgresClass({
        databaseDir: this.dbPath,
        user: 'codeall',
        password: 'codeall',
        port: 54320,
        persistent: true
      })

      await embeddedPostgres.initialise()
      await embeddedPostgres.start()

      const databaseUrl = `postgresql://codeall:codeall@localhost:54320/postgres`
      process.env.DATABASE_URL = databaseUrl

      prismaClient = new PrismaClient()
      await prismaClient.$connect()

      this.isInitialized = true
      console.log('[Database] ✓ Database initialized successfully')
    } catch (error) {
      console.error('[Database] Failed to initialize:', error)
      throw error
    }
  }

  getClient(): PrismaClient {
    if (!prismaClient) {
      throw new Error('Database not initialized. Call init() first.')
    }
    return prismaClient
  }

  async shutdown(): Promise<void> {
    try {
      if (prismaClient) {
        await prismaClient.$disconnect()
        prismaClient = null
      }

      if (embeddedPostgres) {
        await embeddedPostgres.stop()
        embeddedPostgres = null
      }

      this.isInitialized = false
      console.log('[Database] Shutdown complete')
    } catch (error) {
      console.error('[Database] Error during shutdown:', error)
    }
  }
}

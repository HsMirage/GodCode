import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import net from 'net'
import { PrismaClient } from '@prisma/client'

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

let embeddedPostgres: EmbeddedPostgresInstance | null = null
let prismaClient: PrismaClient | null = null

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo
      const port = address.port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

interface DbCredentials {
  user: string
  password: string
  port: number
}

async function loadOrCreateCredentials(
  credentialsPath: string,
  dbPath: string
): Promise<DbCredentials> {
  if (fs.existsSync(credentialsPath)) {
    const data = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'))
    return data
  }

  const pgVersionPath = path.join(dbPath, 'PG_VERSION')
  const isLegacy = fs.existsSync(pgVersionPath)
  let credentials: DbCredentials

  if (isLegacy) {
    credentials = {
      user: 'codeall',
      password: 'codeall',
      port: 54320
    }
  } else {
    const crypto = await import('crypto')
    credentials = {
      user: 'codeall',
      password: crypto.randomBytes(32).toString('hex'),
      port: await getAvailablePort()
    }
  }

  const credentialsDir = path.dirname(credentialsPath)
  if (!fs.existsSync(credentialsDir)) {
    fs.mkdirSync(credentialsDir, { recursive: true })
  }
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials), { mode: 0o600 })
  return credentials
}

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

  private isDbInitialized(): boolean {
    const pgVersionPath = path.join(this.dbPath, 'PG_VERSION')
    return fs.existsSync(pgVersionPath)
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('[Database] Already initialized')
      return
    }

    try {
      console.log('[Database] Initializing embedded PostgreSQL...')
      console.log('[Database] Database directory:', this.dbPath)

      const credentialsPath = path.join(app.getPath('userData'), 'db-credentials.json')
      const credentials = await loadOrCreateCredentials(credentialsPath, this.dbPath)

      const EmbeddedPostgres = await import('embedded-postgres')
      const EmbeddedPostgresClass = EmbeddedPostgres.default

      embeddedPostgres = new EmbeddedPostgresClass({
        databaseDir: this.dbPath,
        user: credentials.user,
        password: credentials.password,
        port: credentials.port,
        persistent: true
      })

      if (!this.isDbInitialized()) {
        console.log('[Database] First run - initializing database cluster...')
        await embeddedPostgres.initialise()
      } else {
        console.log('[Database] Database cluster already exists, skipping init')
      }

      await embeddedPostgres.start()

      const databaseUrl = `postgresql://${credentials.user}:${credentials.password}@localhost:${credentials.port}/postgres`
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

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import net from 'net'

const INIT_TIMEOUT_MS = 30000 // 30 seconds

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

let embeddedPostgres: EmbeddedPostgresInstance | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaClient: any = null

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

    const startTime = Date.now()
    console.log('[Database] Starting initialization...')

    const initPromise = this._doInit()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database initialization timeout (30s)')), INIT_TIMEOUT_MS)
    })

    try {
      await Promise.race([initPromise, timeoutPromise])
      console.log(`[Database] Initialization complete (${Date.now() - startTime}ms)`)
    } catch (error) {
      console.error('[Database] Initialization failed:', error)
      throw error
    }
  }

  private async _doInit(): Promise<void> {
    console.log('[Database] Phase 1: Loading credentials...')
    console.log('[Database] Database directory:', this.dbPath)

    const credentialsPath = path.join(app.getPath('userData'), 'db-credentials.json')
    const credentials = await loadOrCreateCredentials(credentialsPath, this.dbPath)

    console.log('[Database] Phase 2: Importing embedded-postgres...')
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
      console.log('[Database] Phase 3: First run - initializing database cluster...')
      await embeddedPostgres.initialise()
    } else {
      console.log('[Database] Phase 3: Database cluster already exists, skipping init')
    }

    console.log('[Database] Phase 4: Starting PostgreSQL...')
    await embeddedPostgres.start()

    const databaseUrl = `postgresql://${credentials.user}:${credentials.password}@localhost:${credentials.port}/postgres`
    process.env.DATABASE_URL = databaseUrl

    console.log('[Database] Phase 5: Connecting Prisma...')
    // Dynamic import for ESM/CommonJS compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaModule = (await import('@prisma/client')) as any
    const PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient
    prismaClient = new PrismaClient()
    await prismaClient.$connect()

    this.isInitialized = true
    console.log('[Database] ✓ All phases completed successfully')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient(): any {
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

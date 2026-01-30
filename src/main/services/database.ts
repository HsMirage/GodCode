import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import net from 'net'
import { spawn, ChildProcess } from 'child_process'

const INIT_TIMEOUT_MS = 120000 // 120 seconds for first-time initialization on slow systems

/**
 * Get the correct binary paths for embedded-postgres.
 * In packaged app, binaries are in app.asar.unpacked.
 */
function getBinaryPaths(): { pg_ctl: string; initdb: string; postgres: string } {
  if (app.isPackaged) {
    // In packaged app, binaries are in app.asar.unpacked
    const resourcesPath = process.resourcesPath
    const unpackedPath = path.join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@embedded-postgres',
      'windows-x64',
      'native',
      'bin'
    )

    return {
      pg_ctl: path.join(unpackedPath, 'pg_ctl.exe'),
      initdb: path.join(unpackedPath, 'initdb.exe'),
      postgres: path.join(unpackedPath, 'postgres.exe')
    }
  } else {
    // In development, use node_modules path
    const nodeModulesPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      '@embedded-postgres',
      'windows-x64',
      'native',
      'bin'
    )

    return {
      pg_ctl: path.join(nodeModulesPath, 'pg_ctl.exe'),
      initdb: path.join(nodeModulesPath, 'initdb.exe'),
      postgres: path.join(nodeModulesPath, 'postgres.exe')
    }
  }
}

/**
 * Custom PostgreSQL manager that works in both development and packaged environments.
 * This bypasses embedded-postgres library's path resolution issues in Electron.
 */
class PostgresManager {
  private process: ChildProcess | null = null
  private dbPath: string
  private port: number
  private user: string
  private password: string
  private binaries: ReturnType<typeof getBinaryPaths>

  constructor(options: { databaseDir: string; port: number; user: string; password: string }) {
    this.dbPath = options.databaseDir
    this.port = options.port
    this.user = options.user
    this.password = options.password
    this.binaries = getBinaryPaths()
  }

  async initialise(): Promise<void> {
    const pgVersionPath = path.join(this.dbPath, 'PG_VERSION')
    if (fs.existsSync(pgVersionPath)) {
      console.log('[PostgresManager] Database already initialized')
      return
    }

    console.log('[PostgresManager] Initializing database cluster...')
    console.log('[PostgresManager] initdb path:', this.binaries.initdb)

    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true })
    }

    // Create password file for initdb
    const pwFile = path.join(app.getPath('temp'), `pg_pw_${Date.now()}.txt`)
    fs.writeFileSync(pwFile, this.password)

    return new Promise((resolve, reject) => {
      const args = [
        '-D',
        this.dbPath,
        '-U',
        this.user,
        '--pwfile',
        pwFile,
        '-A',
        'password',
        '--encoding=SQL_ASCII',
        '--no-locale'
      ]

      console.log('[PostgresManager] Running initdb with args:', args.join(' '))

      // Force POSIX locale to completely avoid Chinese locale issues on Windows
      // Remove all locale-related env vars and set to POSIX
      const cleanEnv = {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        LC_ALL: 'POSIX',
        LC_COLLATE: 'POSIX',
        LC_CTYPE: 'POSIX',
        LC_MESSAGES: 'POSIX',
        LANG: 'POSIX',
        LANGUAGE: 'en'
      }

      const proc = spawn(this.binaries.initdb, args, {
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', data => {
        stdout += data.toString()
        console.log('[initdb]', data.toString().trim())
      })

      proc.stderr?.on('data', data => {
        stderr += data.toString()
        console.error('[initdb error]', data.toString().trim())
      })

      proc.on('close', code => {
        // Clean up password file
        try {
          fs.unlinkSync(pwFile)
        } catch {
          /* ignore */
        }

        if (code === 0) {
          console.log('[PostgresManager] Database cluster initialized successfully')
          resolve()
        } else {
          reject(new Error(`initdb failed with code ${code}: ${stderr}`))
        }
      })

      proc.on('error', err => {
        try {
          fs.unlinkSync(pwFile)
        } catch {
          /* ignore */
        }
        reject(err)
      })
    })
  }

  async start(): Promise<void> {
    console.log('[PostgresManager] Starting PostgreSQL...')
    console.log('[PostgresManager] pg_ctl path:', this.binaries.pg_ctl)

    return new Promise((resolve, reject) => {
      const args = [
        '-D',
        this.dbPath,
        '-l',
        path.join(this.dbPath, 'postgres.log'),
        '-o',
        `-p ${this.port}`,
        'start'
      ]

      console.log('[PostgresManager] Running pg_ctl with args:', args.join(' '))

      // Use same clean environment as initdb
      const cleanEnv = {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PGPASSWORD: this.password,
        LC_ALL: 'POSIX',
        LC_COLLATE: 'POSIX',
        LC_CTYPE: 'POSIX',
        LC_MESSAGES: 'POSIX',
        LANG: 'POSIX',
        LANGUAGE: 'en'
      }

      const proc = spawn(this.binaries.pg_ctl, args, {
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', data => {
        stdout += data.toString()
        console.log('[pg_ctl]', data.toString().trim())
      })

      proc.stderr?.on('data', data => {
        stderr += data.toString()
        console.error('[pg_ctl error]', data.toString().trim())
      })

      proc.on('close', code => {
        if (code === 0 || stdout.includes('server started') || stdout.includes('server starting')) {
          console.log('[PostgresManager] PostgreSQL started successfully')
          // Wait a bit for the server to be ready
          setTimeout(() => resolve(), 2000)
        } else {
          reject(new Error(`pg_ctl start failed with code ${code}: ${stderr}`))
        }
      })

      proc.on('error', reject)
    })
  }

  async stop(): Promise<void> {
    console.log('[PostgresManager] Stopping PostgreSQL...')

    return new Promise((resolve, reject) => {
      const args = ['-D', this.dbPath, 'stop', '-m', 'fast']

      const proc = spawn(this.binaries.pg_ctl, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      proc.on('close', code => {
        if (code === 0) {
          console.log('[PostgresManager] PostgreSQL stopped successfully')
        }
        resolve()
      })

      proc.on('error', () => resolve())
    })
  }
}

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
    console.log('[Database] App is packaged:', app.isPackaged)

    const credentialsPath = path.join(app.getPath('userData'), 'db-credentials.json')
    const credentials = await loadOrCreateCredentials(credentialsPath, this.dbPath)

    console.log('[Database] Phase 2: Creating PostgreSQL manager...')

    // Use our custom PostgresManager that handles packaged app paths correctly
    const postgresManager = new PostgresManager({
      databaseDir: this.dbPath,
      user: credentials.user,
      password: credentials.password,
      port: credentials.port
    })

    // Store for shutdown
    embeddedPostgres = postgresManager

    if (!this.isDbInitialized()) {
      console.log('[Database] Phase 3: First run - initializing database cluster...')
      await postgresManager.initialise()
    } else {
      console.log('[Database] Phase 3: Database cluster already exists, skipping init')
    }

    console.log('[Database] Phase 4: Starting PostgreSQL...')
    await postgresManager.start()

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

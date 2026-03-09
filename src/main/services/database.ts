import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import net from 'net'
import { spawn, ChildProcess } from 'child_process'
import { killPostgresProcesses } from '@/main/services/process-utils'

// Exported for testing - allows mocking in tests
// Using an object so that internal calls can be mocked by vitest
export const dbUtils = {
  sleepFn: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
}

// Re-export for backward compatibility with tests
export const sleepFn = dbUtils.sleepFn

const INIT_TIMEOUT_MS = 120000 // 120 seconds for first-time initialization on slow systems

/**
 * Determine if an error should NOT be retried.
 * ENOENT/EACCES or specific stderr messages indicate unrecoverable errors.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shouldNotRetry(error: any): boolean {
  // ENOENT/EACCES errors should fail immediately
  if (error.code === 'ENOENT' || error.code === 'EACCES') return true

  // Check stderr for specific failure patterns
  const message = error.message || ''
  if (message.includes('already exists') || message.includes('permission denied')) return true

  return false // Other errors allow retry
}

/**
 * Get the platform-specific package name for embedded-postgres.
 */
function getPlatformPackage(): { packageName: string; ext: string } {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'win32') {
    return { packageName: 'windows-x64', ext: '.exe' }
  } else if (platform === 'darwin') {
    return { packageName: arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64', ext: '' }
  } else {
    // Linux
    return { packageName: arch === 'arm64' ? 'linux-arm64' : 'linux-x64', ext: '' }
  }
}

/**
 * Get the correct binary paths for embedded-postgres.
 * In packaged app, binaries are in app.asar.unpacked.
 */
function getBinaryPaths(): { pg_ctl: string; initdb: string; postgres: string } {
  const { packageName, ext } = getPlatformPackage()

  if (app.isPackaged) {
    // In packaged app, binaries are in app.asar.unpacked
    const resourcesPath = process.resourcesPath
    const unpackedPath = path.join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@embedded-postgres',
      packageName,
      'native',
      'bin'
    )

    return {
      pg_ctl: path.join(unpackedPath, `pg_ctl${ext}`),
      initdb: path.join(unpackedPath, `initdb${ext}`),
      postgres: path.join(unpackedPath, `postgres${ext}`)
    }
  } else {
    // In development, use node_modules path
    // After electron-vite bundling, __dirname is out/main, so we need 2 levels up to reach project root
    const projectRoot = path.join(__dirname, '..', '..')
    const nodeModulesPath = path.join(
      projectRoot,
      'node_modules',
      '@embedded-postgres',
      packageName,
      'native',
      'bin'
    )

    return {
      pg_ctl: path.join(nodeModulesPath, `pg_ctl${ext}`),
      initdb: path.join(nodeModulesPath, `initdb${ext}`),
      postgres: path.join(nodeModulesPath, `postgres${ext}`)
    }
  }
}

function buildPostgresEnv(options: {
  binPath: string
  libDir: string
  shareDir: string
  password?: string
}): NodeJS.ProcessEnv {
  const pathValue = process.env.PATH
    ? `${options.binPath}${path.delimiter}${process.env.PATH}`
    : options.binPath

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: pathValue,
    PGLIBDIR: options.libDir,
    PGSHAREDIR: options.shareDir,
    LC_ALL: 'POSIX',
    LC_COLLATE: 'POSIX',
    LC_CTYPE: 'POSIX',
    LC_MESSAGES: 'POSIX',
    LANG: 'POSIX',
    LANGUAGE: 'en'
  }

  if (options.password) {
    env.PGPASSWORD = options.password
  }

  if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = process.env.DYLD_LIBRARY_PATH
      ? `${options.libDir}${path.delimiter}${process.env.DYLD_LIBRARY_PATH}`
      : options.libDir
  } else if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${options.libDir}${path.delimiter}${process.env.LD_LIBRARY_PATH}`
      : options.libDir
  }

  return env
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

    // Verify binary exists
    if (!fs.existsSync(this.binaries.initdb)) {
      if (process.env.NODE_ENV === 'test') {
        console.warn(
          `[PostgresManager] initdb binary not found at ${this.binaries.initdb}, skipping check in test environment`
        )
      } else {
        console.error('[PostgresManager] initdb binary NOT found at:', this.binaries.initdb)
        throw new Error(`initdb binary not found at ${this.binaries.initdb}`)
      }
    }

    // Retry logic: up to 3 attempts with exponential backoff
    const maxAttempts = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[PostgresManager] Attempt ${attempt}/${maxAttempts}`)
        await this._doInitDb()
        return // Success, exit
      } catch (error) {
        lastError = error as Error
        console.error(`[PostgresManager] Attempt ${attempt} failed:`, (error as Error).message)

        // Check if error should not be retried
        if (shouldNotRetry(error)) {
          console.error('[PostgresManager] Non-retryable error, giving up')
          throw error
        }

        if (attempt < maxAttempts) {
          // Exponential backoff: 1s after first failure, 3s after second
          const backoff = attempt === 1 ? 1000 : 3000
          console.log(`[PostgresManager] Waiting ${backoff}ms before retry...`)
          await dbUtils.sleepFn(backoff)

          // Clean up zombie processes before retry
          console.log('[PostgresManager] Cleaning up postgres processes...')
          await killPostgresProcesses()

          // If this is a first-time init failure (no PG_VERSION), delete the data directory
          const pgVersionCheck = path.join(this.dbPath, 'PG_VERSION')
          if (!fs.existsSync(pgVersionCheck)) {
            // Validate path is safe (under userData)
            const userData = app.getPath('userData')
            if (this.dbPath.startsWith(userData)) {
              try {
                console.log('[PostgresManager] Removing incomplete data directory...')
                fs.rmSync(this.dbPath, { recursive: true, force: true })
              } catch (e) {
                console.warn('[PostgresManager] Failed to remove data directory:', e)
              }
            }
          }
        }
      }
    }

    // All attempts failed
    throw new Error(
      `Database initialization failed after ${maxAttempts} attempts: ${lastError?.message}`
    )
  }

  private async _doInitDb(): Promise<void> {
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

      const binPath = path.dirname(this.binaries.initdb)
      const nativePath = path.dirname(binPath)
      const libDir = path.join(nativePath, 'lib')
      const shareDir = path.join(nativePath, 'share')

      console.log('[PostgresManager] binPath:', binPath)
      console.log('[PostgresManager] PGLIBDIR:', libDir)
      console.log('[PostgresManager] PGSHAREDIR:', shareDir)

      const cleanEnv = buildPostgresEnv({ binPath, libDir, shareDir })

      const proc = spawn(this.binaries.initdb, args, {
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stderr = ''

      proc.stdout?.on('data', data => {
        // Log stdout line by line with prefix
        data
          .toString()
          .split('\n')
          .filter((l: string) => l.trim())
          .forEach((line: string) => {
            console.log('[initdb stdout]', line)
          })
      })

      proc.stderr?.on('data', data => {
        stderr += data.toString()
        // Log stderr line by line with prefix
        data
          .toString()
          .split('\n')
          .filter((l: string) => l.trim())
          .forEach((line: string) => {
            console.error('[initdb stderr]', line)
          })
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

    // Verify binary exists
    if (!fs.existsSync(this.binaries.pg_ctl)) {
      if (process.env.NODE_ENV === 'test') {
        console.warn(
          `[PostgresManager] pg_ctl binary not found at ${this.binaries.pg_ctl}, skipping check in test environment`
        )
      } else {
        console.error('[PostgresManager] pg_ctl binary NOT found at:', this.binaries.pg_ctl)
        throw new Error(`pg_ctl binary not found at ${this.binaries.pg_ctl}`)
      }
    }

    // Clean up stale log file to prevent permission issues
    const logPath = path.join(this.dbPath, 'postgres.log')

    this.normalizeConfigForCurrentPlatform()
    this.normalizeDataDirPermissions()

    if (fs.existsSync(logPath)) {
      try {
        fs.unlinkSync(logPath)
        console.log('[PostgresManager] Removed stale postgres.log')
      } catch (e) {
        console.warn('[PostgresManager] Could not remove log file:', (e as Error).message)
      }
    }

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

      const binPath = path.dirname(this.binaries.pg_ctl)
      const nativePath = path.dirname(binPath)
      const libDir = path.join(nativePath, 'lib')
      const shareDir = path.join(nativePath, 'share')

      const cleanEnv = buildPostgresEnv({ binPath, libDir, shareDir, password: this.password })

      const proc = spawn(this.binaries.pg_ctl, args, {
        env: cleanEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      // NOTE: On Windows/Electron, pg_ctl may exit but keep stdio handles open via spawned
      // postgres child processes, so relying on the 'close' event can hang forever.
      // Use 'exit' and also resolve early when we see the success output.
      const startTimeoutMs = 60_000
      let settled = false
      const startTimer: NodeJS.Timeout = setTimeout(() => {
        settleReject(new Error(`pg_ctl start timed out after ${startTimeoutMs}ms`))
      }, startTimeoutMs)

      const settleResolve = () => {
        if (settled) return
        settled = true
        if (startTimer) clearTimeout(startTimer)
        console.log('[PostgresManager] PostgreSQL started successfully')
        // Wait a bit for the server to be ready
        setTimeout(() => resolve(), 2000)
      }

      const settleReject = (err: Error) => {
        if (settled) return
        settled = true
        if (startTimer) clearTimeout(startTimer)
        reject(err)
      }

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', data => {
        const text = data.toString()
        stdout += text
        console.log('[pg_ctl]', text.trim())

        if (text.includes('server started')) settleResolve()
      })

      proc.stderr?.on('data', data => {
        const text = data.toString()
        stderr += text
        console.error('[pg_ctl error]', text.trim())
      })

      proc.on('exit', code => {
        if (settled) return
        if (code === 0 || stdout.includes('server started')) {
          settleResolve()
          return
        }

        // If pg_ctl reports a running server, verify the port is accepting connections.
        if (/another server might be running/i.test(stderr)) {
          const socket = net.createConnection({ host: '127.0.0.1', port: this.port })
          const cleanup = (result: boolean) => {
            socket.removeAllListeners()
            socket.destroy()
            if (result) settleResolve()
            else settleReject(new Error(`pg_ctl start failed with code ${code}: ${stderr}`))
          }
          socket.once('connect', () => cleanup(true))
          socket.once('error', () => cleanup(false))
          socket.setTimeout(500)
          socket.once('timeout', () => cleanup(false))
          return
        }

        settleReject(new Error(`pg_ctl start failed with code ${code}: ${stderr}`))
      })

      proc.on('error', err => settleReject(err as Error))
    })
  }

  private normalizeConfigForCurrentPlatform(): void {
    if (process.platform === 'win32') return

    const confPath = path.join(this.dbPath, 'postgresql.conf')
    if (!fs.existsSync(confPath)) return

    try {
      const content = fs.readFileSync(confPath, 'utf-8')
      const updated = content.replace(
        /^\s*dynamic_shared_memory_type\s*=\s*windows\b.*$/m,
        'dynamic_shared_memory_type = posix'
      )

      if (updated !== content) {
        fs.writeFileSync(confPath, updated, 'utf-8')
        console.log(
          '[PostgresManager] Updated postgresql.conf for non-Windows platform: dynamic_shared_memory_type=posix'
        )
      }
    } catch (error) {
      console.warn('[PostgresManager] Failed to normalize postgresql.conf:', error)
    }
  }

  private normalizeDataDirPermissions(): void {
    if (process.platform === 'win32') return

    try {
      if (fs.existsSync(this.dbPath)) {
        fs.chmodSync(this.dbPath, 0o700)
      }
    } catch (error) {
      console.warn('[PostgresManager] Failed to normalize data dir permissions:', error)
    }
  }

  async stop(): Promise<void> {
    console.log('[PostgresManager] Stopping PostgreSQL...')

    return new Promise(resolve => {
      const args = ['-D', this.dbPath, 'stop', '-m', 'fast']
      const binPath = path.dirname(this.binaries.pg_ctl)
      const nativePath = path.dirname(binPath)
      const libDir = path.join(nativePath, 'lib')
      const shareDir = path.join(nativePath, 'share')
      const cleanEnv = buildPostgresEnv({ binPath, libDir, shareDir })

      const proc = spawn(this.binaries.pg_ctl, args, {
        env: cleanEnv,
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

const OPENAI_PROTOCOL_REQUIRED_PROVIDERS = new Set([
  'openai',
  'openai-compatible',
  'openai-compat',
  'custom',
  'azure-openai',
  'azure'
])

function readApiProtocol(config: unknown): string {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ''
  }

  const value = (config as Record<string, unknown>).apiProtocol
  return typeof value === 'string' ? value.trim() : ''
}

export async function ensureBindingSchemaCompatibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): Promise<void> {
  if (typeof client?.$queryRawUnsafe !== 'function' || typeof client?.$executeRawUnsafe !== 'function') {
    console.warn(
      '[Database] Prisma raw query APIs not available ($queryRawUnsafe/$executeRawUnsafe), skipping schema patching'
    )
    return
  }

  // This project does not currently ship Prisma migrations with the app.
  // Embedded Postgres data persists across upgrades, so we apply small additive
  // schema patches here to keep older databases working.
  //
  // Keep this strictly additive (no drops/renames) to avoid data loss.
  const checks: Array<{ table: string; column: string; addSql: string }> = [
    {
      table: 'CategoryBinding',
      column: 'systemPrompt',
      addSql: 'ALTER TABLE "CategoryBinding" ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT'
    },
    {
      table: 'AgentBinding',
      column: 'systemPrompt',
      addSql: 'ALTER TABLE "AgentBinding" ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT'
    },
    {
      table: 'Model',
      column: 'apiKeyId',
      addSql: 'ALTER TABLE "Model" ADD COLUMN IF NOT EXISTS "apiKeyId" TEXT'
    }
  ]

  for (const c of checks) {
    // Table may be missing on a brand new database if schema was never pushed.
    // Don't hard-fail here; downstream calls will surface a clearer error,
    // and docs already describe `prisma db push --force-reset` as a recovery path.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const tableRows = await client.$queryRawUnsafe(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = '${c.table}'
       LIMIT 1`
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const tableExists = Array.isArray(tableRows) && tableRows.length > 0
    if (!tableExists) {
      console.warn(`[Database] Table missing, skipping patch: ${c.table}`)
      continue
    }

    // information_schema contains the *exact* table/column names, including case.
    // We keep table/column names fixed here to avoid SQL injection concerns.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rows = await client.$queryRawUnsafe(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = '${c.table}'
         AND column_name = '${c.column}'
       LIMIT 1`
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const exists = Array.isArray(rows) && rows.length > 0
    if (!exists) {
      console.warn(`[Database] Applying additive schema patch: ${c.table}.${c.column}`)
      await client.$executeRawUnsafe(c.addSql)
    }
  }

  // Ensure SystemSetting table exists
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const systemSettingTableRows = await client.$queryRawUnsafe(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'SystemSetting'
     LIMIT 1`
  )
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const systemSettingExists = Array.isArray(systemSettingTableRows) && systemSettingTableRows.length > 0
  if (!systemSettingExists) {
    console.warn('[Database] Creating SystemSetting table')
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "id" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "value" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SystemSetting_key_key" ON "SystemSetting"("key")
    `)
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SystemSetting_key_idx" ON "SystemSetting"("key")
    `)
  }

  // Ensure SessionState table exists
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const sessionStateTableRows = await client.$queryRawUnsafe(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'SessionState'
     LIMIT 1`
  )
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const sessionStateExists = Array.isArray(sessionStateTableRows) && sessionStateTableRows.length > 0
  if (!sessionStateExists) {
    console.warn('[Database] Creating SessionState table')
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SessionState" (
        "id" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "checkpoint" JSONB NOT NULL DEFAULT '{}',
        "context" JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SessionState_pkey" PRIMARY KEY ("id")
      )
    `)
    await client.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SessionState_sessionId_key" ON "SessionState"("sessionId")
    `)
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SessionState_sessionId_idx" ON "SessionState"("sessionId")
    `)
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SessionState_status_idx" ON "SessionState"("status")
    `)
  }

  const models = await client.model.findMany({
    select: {
      id: true,
      provider: true,
      modelName: true,
      config: true
    }
  })

  let migratedCount = 0
  for (const model of models as Array<{
    id: string
    provider: string
    modelName: string
    config: unknown
  }>) {
    const provider = model.provider.trim().toLowerCase()
    if (!OPENAI_PROTOCOL_REQUIRED_PROVIDERS.has(provider)) {
      continue
    }

    const protocol = readApiProtocol(model.config)
    if (protocol === 'chat/completions' || protocol === 'responses') {
      continue
    }

    const nextConfig =
      model.config && typeof model.config === 'object' && !Array.isArray(model.config)
        ? { ...(model.config as Record<string, unknown>) }
        : {}
    nextConfig.apiProtocol = 'responses'

    await client.model.update({
      where: { id: model.id },
      data: { config: nextConfig }
    })

    migratedCount += 1
    console.warn(
      `[Database] Patched model protocol to responses: ${model.provider}/${model.modelName} (${model.id})`
    )
  }

  if (migratedCount > 0) {
    console.warn(`[Database] Model protocol migration complete: ${migratedCount} model(s) updated`)
  }
}

async function tableExists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string
): Promise<boolean> {
  if (typeof client?.$queryRawUnsafe !== 'function') return false

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const rows = await client.$queryRawUnsafe(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = '${table}'
     LIMIT 1`
  )
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return Array.isArray(rows) && rows.length > 0
}

function splitSqlStatements(sql: string): string[] {
  // Minimal SQL splitter for Prisma-generated migration.sql (PostgreSQL):
  // - Supports ';' terminators
  // - Tracks single/double quotes to avoid splitting inside strings/identifiers
  // - Handles doubled quotes ('' / "") escape style
  const out: string[] = []
  let buf = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = i + 1 < sql.length ? sql[i + 1] : ''

    if (!inDouble && ch === "'") {
      if (inSingle && next === "'") {
        buf += "''"
        i++
        continue
      }
      inSingle = !inSingle
      buf += ch
      continue
    }

    if (!inSingle && ch === '"') {
      if (inDouble && next === '"') {
        buf += '""'
        i++
        continue
      }
      inDouble = !inDouble
      buf += ch
      continue
    }

    if (!inSingle && !inDouble && ch === ';') {
      const stmt = buf.trim()
      if (stmt) out.push(stmt)
      buf = ''
      continue
    }

    buf += ch
  }

  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

function resolvePrismaMigrationsDir(): string {
  const bundledAppPath = path.join(app.getAppPath(), 'prisma', 'migrations')
  const resourcesPath = path.join(process.resourcesPath, 'prisma', 'migrations')
  const devFromBundlePath = path.join(__dirname, '..', '..', 'prisma', 'migrations')
  const cwdPath = path.join(process.cwd(), 'prisma', 'migrations')

  const candidates = Array.from(new Set([bundledAppPath, resourcesPath, devFromBundlePath, cwdPath]))

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }

  throw new Error(
    `Prisma migrations not found. Checked: ${candidates.join(', ')}. Cannot bootstrap schema.`
  )
}

export async function ensureBaseSchema(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): Promise<void> {
  const isVitest = !!process.env.VITEST
  const isNodeTest = process.env.NODE_ENV === 'test'
  const isElectronE2E = process.env.CODEALL_E2E_TEST === '1'
  if (isVitest || (isNodeTest && !isElectronE2E)) return

  // On a fresh database, tables may not exist because we don't run Prisma migrations at runtime.
  // Bootstrap schema from bundled/dev Prisma migration.sql files.
  const hasSpace = await tableExists(client, 'Space')
  const hasAgentBinding = await tableExists(client, 'AgentBinding')
  if (hasSpace && hasAgentBinding) return

  if (typeof client?.$executeRawUnsafe !== 'function' || typeof client?.$queryRawUnsafe !== 'function') {
    throw new Error(
      'Database schema is missing, and Prisma raw SQL APIs are not available. ' +
        'Run `pnpm prisma migrate deploy` (preferred) or `pnpm prisma db push --force-reset` to initialize schema.'
    )
  }

  const migrationsDir = resolvePrismaMigrationsDir()

  const dirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()

  if (dirs.length === 0) {
    throw new Error(`No Prisma migrations found under ${migrationsDir}. Cannot bootstrap schema.`)
  }

  console.warn('[Database] Base schema missing. Bootstrapping from Prisma migrations...')

  for (const dir of dirs) {
    const migrationSqlPath = path.join(migrationsDir, dir, 'migration.sql')
    if (!fs.existsSync(migrationSqlPath)) continue

    console.warn('[Database] Applying migration:', dir)
    const sql = fs.readFileSync(migrationSqlPath, 'utf-8')
    const statements = splitSqlStatements(sql)

    for (const stmt of statements) {
      // Skip pure comments (Prisma migrations include "-- CreateTable" blocks).
      const cleaned = stmt
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
      if (!cleaned) continue

      try {
        await client.$executeRawUnsafe(cleaned)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Make schema bootstrap idempotent enough for partial runs.
        if (
          /already exists/i.test(msg) ||
          /duplicate/i.test(msg) ||
          /violates unique constraint/i.test(msg)
        ) {
          continue
        }
        throw e
      }
    }
  }

  console.log('[Database] Base schema bootstrap complete')
}

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
  private initPromise: Promise<void> | null = null

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

    if (this.initPromise) {
      console.log('[Database] Initialization in progress, waiting...')
      await this.initPromise
      return
    }

    const startTime = Date.now()
    console.log('[Database] Starting initialization...')

    this.initPromise = (async () => {
      const initPromise = this._doInit()
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Database initialization timeout (120s)')),
          INIT_TIMEOUT_MS
        )
      })

      try {
        await Promise.race([initPromise, timeoutPromise])
        console.log(`[Database] Initialization complete (${Date.now() - startTime}ms)`)
      } catch (error) {
        console.error('[Database] Initialization failed:', error)
        throw error
      }
    })()

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
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

    // Clean up any zombie postgres processes before starting
    console.log('[Database] Cleaning up zombie processes...')
    await killPostgresProcesses()

    await postgresManager.start()

    const databaseUrl = `postgresql://${credentials.user}:${credentials.password}@localhost:${credentials.port}/postgres`
    process.env.DATABASE_URL = databaseUrl

    // Set Prisma query engine path for packaged app.
    // NOTE: Do NOT force Windows engine on non-Windows systems.
    // Prisma can auto-resolve the correct engine from generated client files.
    if (app.isPackaged && process.platform === 'win32') {
      const enginePath = path.join(
        process.resourcesPath,
        'prisma-client',
        'query_engine-windows.dll.node'
      )
      console.log('[Database] Setting PRISMA_QUERY_ENGINE_LIBRARY:', enginePath)

      // Verify engine exists
      if (!fs.existsSync(enginePath)) {
        console.error('[Database] Prisma query engine NOT found at:', enginePath)
        // Try alternative path
        const altPath = path.join(
          process.resourcesPath,
          'prisma-engines',
          'query_engine-windows.dll.node'
        )
        if (fs.existsSync(altPath)) {
          console.log('[Database] Using alternative engine path:', altPath)
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = altPath
        } else {
          throw new Error(`Prisma query engine not found at ${enginePath} or ${altPath}`)
        }
      } else {
        process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath
      }
    }

    // Ensure Prisma can resolve its generated client from unpacked node_modules in packaged apps.
    // In ASAR builds, the `.prisma` directory may not be inside app.asar, so we add the unpacked
    // node_modules folder to NODE_PATH before importing `@prisma/client`.
    if (app.isPackaged) {
      try {
        const unpackedNodeModules = path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'node_modules'
        )
        const moduleMod = await import('module')
        const Module = moduleMod.Module as typeof import('module').Module

        process.env.NODE_PATH = [process.env.NODE_PATH, unpackedNodeModules]
          .filter(Boolean)
          .join(path.delimiter)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(Module as any)._initPaths()
        console.log('[Database] Added NODE_PATH for unpacked node_modules:', unpackedNodeModules)
      } catch (e) {
        console.warn(
          '[Database] Failed to extend NODE_PATH for Prisma resolution:',
          (e as Error).message
        )
      }
    }

    console.log('[Database] Phase 5: Connecting Prisma...')

    // Prisma loading strategy:
    // - In packaged apps, `require()` is more reliable due to module resolution/NODE_PATH tweaks.
    // - In tests, prefer ESM import so Vitest `vi.mock('@prisma/client')` works (createRequire bypasses it).
    const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.VITEST

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let PrismaClient: any

    if (isTestEnv) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prismaModule = (await import('@prisma/client')) as any
      PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient
    } else {
      // Use createRequire to robustly load Prisma Client in both dev and prod
      const { createRequire } = await import('module')
      const require = createRequire(import.meta.url)

      try {
        const prismaModule = require('@prisma/client')
        PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient
      } catch (e) {
        console.warn('[Database] Failed to require @prisma/client, trying import:', e)
        // Fallback to import if require fails
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prismaModule = (await import('@prisma/client')) as any
        PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient
      }
    }

    if (!PrismaClient) {
      throw new Error('Failed to load PrismaClient from @prisma/client')
    }

    prismaClient = new PrismaClient()

    // PostgreSQL may still be starting up even after pg_ctl reports "server started".
    // Retry Prisma connect for a short period to avoid failing init on transient startup states.
    const maxConnectAttempts = 20
    let lastConnectError: unknown = null

    for (let attempt = 1; attempt <= maxConnectAttempts; attempt++) {
      try {
        await prismaClient.$connect()
        lastConnectError = null
        break
      } catch (error) {
        lastConnectError = error
        const message = error instanceof Error ? error.message : String(error)

        // Common transient errors while postgres is still starting or recovering
        if (
          /database system is starting up/i.test(message) ||
          /starting up/i.test(message) ||
          /database system is in recovery mode/i.test(message) ||
          /the database system is in recovery/i.test(message)
        ) {
          const delay = Math.min(2000, 200 + attempt * 150)
          console.warn(
            `[Database] Prisma connect retry ${attempt}/${maxConnectAttempts} in ${delay}ms: ${message}`
          )
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw error
      }
    }

    if (lastConnectError) {
      throw lastConnectError instanceof Error
        ? lastConnectError
        : new Error(String(lastConnectError))
    }

    console.log('[Database] Phase 6: Ensuring schema exists...')
    await ensureBaseSchema(prismaClient)

    console.log('[Database] Phase 7: Ensuring schema compatibility...')
    await ensureBindingSchemaCompatibility(prismaClient)

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

import { describe, test, expect, vi, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import { DatabaseService } from '../../src/main/services/database'

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/codeall-perf-startup'
        return '/tmp'
      }),
      isPackaged: false
    }
  }
})

// Mock child_process for PostgresManager
vi.mock('child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('child_process')>()
  const spawnMock = vi.fn(() => ({
    stdout: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => {
            cb(Buffer.from('server started'))
            cb(Buffer.from('database cluster initialized'))
          }, 10)
        }
      })
    },
    stderr: {
      on: vi.fn()
    },
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') {
        setTimeout(() => cb(0), 20)
      }
    })
  }))
  return {
    ...actual,
    spawn: spawnMock,
    default: {
      ...actual,
      spawn: spawnMock
    }
  }
})

// Mock fs for PostgresManager
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (p.indexOf('bin') !== -1 || p.indexOf('native') !== -1) return true
      if (p.indexOf('PG_VERSION') !== -1) return false
      return actual.existsSync(p)
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn((p: string, encoding: any) => {
      if (p.indexOf('db-credentials.json') !== -1) {
        return JSON.stringify({
          user: 'test-user',
          password: 'test-password',
          port: 54321
        })
      }
      return actual.readFileSync(p, encoding)
    })
  }
})

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const delegate = () => ({
    create: vi.fn(async ({ data }: any) => ({ id: 'mock-id', ...data })),
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }: any) => ({ id: where?.id ?? 'mock-id', ...data })),
    delete: vi.fn(async ({ where }: any) => ({ id: where?.id ?? 'mock-id' })),
    deleteMany: vi.fn(async () => ({ count: 0 }))
  })

  return {
    PrismaClient: class {
      space = delegate()
      model = delegate()
      agentBinding = delegate()
      categoryBinding = delegate()
      systemSetting = delegate()
      session = delegate()
      message = delegate()
      task = delegate()
      artifact = delegate()
      $connect() {
        return Promise.resolve()
      }
      $disconnect() {
        return Promise.resolve()
      }
    }
  }
})

describe('Performance: Startup Time', () => {
  afterEach(async () => {
    // Reset singleton instance to ensure clean state
    // @ts-ignore
    DatabaseService.instance = undefined
    const db = DatabaseService.getInstance()
    await db.shutdown()
  })

  test('database init completes in <5s', async () => {
    // @ts-ignore
    DatabaseService.instance = undefined
    const db = DatabaseService.getInstance()

    const start = Date.now()
    await db.init()
    const elapsed = Date.now() - start

    console.log(`Database Startup time: ${elapsed}ms`)
    expect(elapsed).toBeLessThan(5000)

    // Verify it is initialized
    const client = db.getClient()
    expect(client).toBeDefined()
  })
})

import { describe, test, expect, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/godcode-perf-startup'
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
    writeFileSync: vi.fn((...args: Parameters<typeof actual.writeFileSync>) =>
      actual.writeFileSync(...args)
    ),
    mkdirSync: vi.fn((...args: Parameters<typeof actual.mkdirSync>) => actual.mkdirSync(...args)),
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

async function measureDatabaseInitMs(): Promise<number> {
  // @ts-ignore
  DatabaseService.instance = undefined
  const db = DatabaseService.getInstance()

  const start = Date.now()
  await db.init()
  const elapsed = Date.now() - start

  await db.shutdown()
  // @ts-ignore
  DatabaseService.instance = undefined
  return elapsed
}

describe('Performance: Startup Time', () => {
  test('database init remains stable under repeated runs (<5s avg, <5.5s worst)', async () => {
    const warmupMs = await measureDatabaseInitMs()

    const sampleResults: Array<{
      elapsedMs: number
      heapUsedMB: number
      rssMB: number
      externalMB: number
    }> = []

    for (let i = 0; i < 3; i++) {
      const elapsedMs = await measureDatabaseInitMs()
      const usage = process.memoryUsage()
      sampleResults.push({
        elapsedMs,
        heapUsedMB: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
        rssMB: Math.round((usage.rss / 1024 / 1024) * 100) / 100,
        externalMB: Math.round((usage.external / 1024 / 1024) * 100) / 100
      })
    }

    const samples = sampleResults.map(item => item.elapsedMs)
    const averageMs = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
    const worstMs = Math.max(...samples)

    const startupSamplesDir = '/tmp/godcode-performance-samples'
    const startupSamplesPath = `${startupSamplesDir}/startup-memory-samples.json`
    const peakHeapMB = Math.max(...sampleResults.map(item => item.heapUsedMB))
    const peakRssMB = Math.max(...sampleResults.map(item => item.rssMB))

    const fs = await import('node:fs')
    fs.mkdirSync(startupSamplesDir, { recursive: true })
    fs.writeFileSync(
      startupSamplesPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          warmupMs,
          samples,
          averageMs,
          worstMs,
          sampleResults,
          peakHeapMB,
          peakRssMB
        },
        null,
        2
      )
    )

    console.log(`
=== Startup Stability Sampling ===
Warmup: ${warmupMs}ms
Samples: ${samples.join(', ')}ms
Average: ${averageMs}ms
Worst: ${worstMs}ms
Peak Heap Used: ${peakHeapMB}MB
Peak RSS: ${peakRssMB}MB
Memory Samples: ${startupSamplesPath}
`)

    expect(averageMs).toBeLessThan(5000)
    expect(worstMs).toBeLessThan(5500)

    // Verify service can still be initialized after sampled runs
    // @ts-ignore
    DatabaseService.instance = undefined
    const db = DatabaseService.getInstance()
    await db.init()
    const client = db.getClient()
    expect(client).toBeDefined()
    await db.shutdown()
  }, 30000)
})

import { describe, test, expect, vi, afterEach } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/codeall-perf-startup'
        return '/tmp'
      })
    }
  }
})

// Mock Embedded Postgres
vi.mock('embedded-postgres', () => {
  return {
    default: class MockEmbeddedPostgres {
      initialise() {
        return Promise.resolve()
      }
      start() {
        return new Promise(resolve => setTimeout(resolve, 100)) // Simulate slight delay
      }
      stop() {
        return Promise.resolve()
      }
    }
  }
})

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
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
    // Reset singleton instance to ensure clean state for other tests if needed
    // However, DatabaseService is a singleton and doesn't expose a reset method directly.
    // For this specific test, we might just shutdown if possible.
    const db = DatabaseService.getInstance()
    await db.shutdown()
  })

  test('database init completes in <5s', async () => {
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

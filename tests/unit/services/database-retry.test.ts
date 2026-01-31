import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { spawn } from 'child_process'
import { DatabaseService, dbUtils } from '@/main/services/database'
import { killPostgresProcesses } from '@/main/services/process-utils'

// Mocks
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'temp') return os.tmpdir()
      return path.join(os.tmpdir(), `test-db-retry-${Date.now()}`)
    }),
    isPackaged: false
  }
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn((p: any) => {
      // Mock presence of embedded-postgres binaries
      if (
        p.toString().includes('embedded-postgres') &&
        (p.toString().includes('bin') || p.toString().includes('native'))
      )
        return true
      if (p.toString().includes('PG_VERSION')) return false
      return true
    }),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}')
  }
})

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  const newFs = {
    ...actual,
    existsSync: vi.fn((p: any) => {
      const str = p.toString()
      if (str.includes('initdb') || str.includes('pg_ctl') || str.includes('postgres')) return true
      if (str.includes('PG_VERSION')) return false
      return true
    }),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}')
  }
  return {
    ...newFs,
    default: newFs
  }
})

vi.mock('child_process', async (importOriginal: any) => {
  const actual = await importOriginal()
  const spawnMock = vi.fn()
  return {
    ...actual,
    spawn: spawnMock,
    default: {
      ...actual,
      spawn: spawnMock
    }
  }
})

vi.mock('@/main/services/process-utils', () => ({
  killPostgresProcesses: vi.fn().mockResolvedValue(undefined),
  findPostgresProcesses: vi.fn().mockResolvedValue([])
}))

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    $connect = vi.fn().mockResolvedValue(undefined)
    $disconnect = vi.fn().mockResolvedValue(undefined)
  }
}))

describe('DatabaseService Retry Logic', () => {
  let db: DatabaseService
  let spawnMockCalls: Array<{ code: number; stderr?: string; error?: Error }> = []
  let callIndex = 0

  beforeEach(() => {
    vi.clearAllMocks()
    callIndex = 0
    spawnMockCalls = []

    // @ts-ignore
    DatabaseService.instance = undefined

    // Mock dbUtils.sleepFn for testing
    vi.spyOn(dbUtils, 'sleepFn').mockResolvedValue(undefined)

    vi.mocked(spawn).mockImplementation((command: any, args: any) => {
      const outcome = spawnMockCalls[callIndex]

      const proc = {
        stdout: {
          on: vi.fn((event: any, cb: any) => {
            if (event === 'data' && !outcome) {
              // Default success output for pg_ctl start
              setTimeout(() => cb(Buffer.from('server started')), 10)
            }
          })
        },
        stderr: {
          on: vi.fn((event: any, cb: any) => {
            if (event === 'data' && outcome?.stderr) {
              cb(Buffer.from(outcome.stderr))
            }
          })
        },
        on: vi.fn((event: any, cb: any) => {
          if (outcome) {
            if (event === 'error' && outcome.error) {
              setTimeout(() => cb(outcome.error), 10)
            } else if ((event === 'close' || event === 'exit') && !outcome.error) {
              setTimeout(() => cb(outcome.code), 10)
            }
          } else {
            // Default success for subsequent calls (e.g. postgres server start)
            if (event === 'close' || event === 'exit') setTimeout(() => cb(0), 10)
          }
        }),
        kill: vi.fn()
      }

      if (outcome) callIndex++
      return proc as any
    })

    db = DatabaseService.getInstance()
  })

  const setOutcomes = (outcomes: Array<{ code: number; stderr?: string; error?: Error }>) => {
    spawnMockCalls = outcomes
  }

  it('Scenario 1: initdb succeeds first time -> no retry, no sleep', async () => {
    setOutcomes([{ code: 0 }])

    await db.init()

    expect(dbUtils.sleepFn).not.toHaveBeenCalled()
    expect(killPostgresProcesses).toHaveBeenCalledTimes(1)
  })

  it('Scenario 2: initdb fails twice then succeeds -> retries with backoff', async () => {
    setOutcomes([{ code: 1 }, { code: 1 }, { code: 0 }])

    await db.init()

    expect(dbUtils.sleepFn).toHaveBeenCalledTimes(2)
    expect(dbUtils.sleepFn).toHaveBeenNthCalledWith(1, 1000)
    expect(dbUtils.sleepFn).toHaveBeenNthCalledWith(2, 3000)

    expect(killPostgresProcesses).toHaveBeenCalledTimes(3)
  })

  it('Scenario 3: initdb fails 3 times -> throws error', async () => {
    setOutcomes([{ code: 1 }, { code: 1 }, { code: 1 }])

    await expect(db.init()).rejects.toThrow()

    expect(dbUtils.sleepFn).toHaveBeenCalledTimes(2)
    expect(dbUtils.sleepFn).toHaveBeenNthCalledWith(1, 1000)
    expect(dbUtils.sleepFn).toHaveBeenNthCalledWith(2, 3000)
  })

  it('Scenario 4: verify killPostgresProcesses called before retries', async () => {
    setOutcomes([{ code: 1 }, { code: 1 }, { code: 0 }])

    await db.init()

    expect(killPostgresProcesses).toHaveBeenCalledTimes(3)
  })

  it('Scenario 5: verify sleepFn parameters are correct (1000, 3000)', async () => {
    setOutcomes([{ code: 1 }, { code: 1 }, { code: 0 }])

    await db.init()

    expect(dbUtils.sleepFn).toHaveBeenCalledTimes(2)
    expect(dbUtils.sleepFn).toHaveBeenNthCalledWith(1, 1000)
    expect(dbUtils.sleepFn).toHaveBeenNthCalledWith(2, 3000)
  })

  it('Scenario 6: ENOENT error -> no retry', async () => {
    setOutcomes([{ code: 1, error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) }])

    await expect(db.init()).rejects.toThrow()

    expect(dbUtils.sleepFn).not.toHaveBeenCalled()
    expect(killPostgresProcesses).not.toHaveBeenCalled()
  })

  it('Scenario 7: permission denied stderr -> no retry', async () => {
    setOutcomes([{ code: 1, stderr: 'permission denied' }])

    await expect(db.init()).rejects.toThrow()

    expect(dbUtils.sleepFn).not.toHaveBeenCalled()
    expect(killPostgresProcesses).not.toHaveBeenCalled()
  })
}, 30000)

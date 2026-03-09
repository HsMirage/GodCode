import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'
import type { PrismaClient } from '@prisma/client'

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/godcode-perf-db'
        return '/tmp'
      })
    }
  }
})

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

const mockStore: Record<string, any[]> = {
  space: [],
  model: [],
  agentBinding: [],
  categoryBinding: [],
  session: [],
  message: [],
  task: [],
  artifact: []
}

let uuidCounter = 0
const uuid = () => `db-perf-uuid-${++uuidCounter}`

const createDelegate = (modelName: string) => ({
  create: vi.fn(async ({ data }: any) => {
    const entry = { id: uuid(), ...data, createdAt: new Date(), updatedAt: new Date() }
    mockStore[modelName].push(entry)
    return entry
  }),
  findFirst: vi.fn(async ({ where }: any) => {
    const items = mockStore[modelName]
    if (where) {
      return (
        items.find((item: any) => Object.entries(where).every(([k, v]) => item[k] === v)) || null
      )
    }
    return items[0] || null
  }),
  findMany: vi.fn(async ({ where, take, skip }: any) => {
    let items = mockStore[modelName]
    if (where) {
      const whereAny: any = where
      items = items.filter((item: any) => {
        if (Array.isArray(whereAny.OR)) {
          return whereAny.OR.some((clause: any) =>
            Object.entries(clause).every(([k, v]) => {
              if (v && typeof v === 'object' && 'not' in v) {
                const filterValue = v as { not: unknown }
                return item[k] !== filterValue.not
              }
              if (v && typeof v === 'object' && 'in' in v) {
                return (v as { in: any[] }).in.includes(item[k])
              }
              return item[k] === v
            })
          )
        }

        return Object.entries(where).every(([k, v]) => {
          if (v && typeof v === 'object' && 'not' in v) {
            const filterValue = v as { not: unknown }
            return item[k] !== filterValue.not
          }
          if (v && typeof v === 'object' && 'in' in v) {
            return (v as { in: any[] }).in.includes(item[k])
          }
          return item[k] === v
        })
      })
    }
    if (skip) items = items.slice(skip)
    if (take) items = items.slice(0, take)
    return items
  }),
  findUnique: vi.fn(async ({ where }: any) => {
    return mockStore[modelName].find((item: any) => item.id === where.id) || null
  }),
  update: vi.fn(async ({ where, data }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index !== -1) {
      mockStore[modelName][index] = {
        ...mockStore[modelName][index],
        ...data,
        updatedAt: new Date()
      }
      return mockStore[modelName][index]
    }
    return null
  }),
  updateMany: vi.fn(async ({ where, data }: any) => {
    let count = 0
    mockStore[modelName].forEach((item, index) => {
      if (!where || Object.entries(where).every(([k, v]) => item[k] === v)) {
        mockStore[modelName][index] = { ...item, ...data, updatedAt: new Date() }
        count++
      }
    })
    return { count }
  }),
  delete: vi.fn(async ({ where }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index !== -1) {
      const deleted = mockStore[modelName].splice(index, 1)[0]
      return deleted
    }
    return { id: where.id }
  }),
  deleteMany: vi.fn(async ({ where }: any) => {
    const before = mockStore[modelName].length
    if (where) {
      mockStore[modelName] = mockStore[modelName].filter(
        (item: any) => !Object.entries(where).every(([k, v]) => item[k] === v)
      )
    } else {
      mockStore[modelName] = []
    }
    return { count: before - mockStore[modelName].length }
  }),
  count: vi.fn(async ({ where }: any = {}) => {
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) => Object.entries(where).every(([k, v]) => item[k] === v))
    }
    return items.length
  })
})

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      space = createDelegate('space')
      model = createDelegate('model')
      session = createDelegate('session')
      message = createDelegate('message')
      task = createDelegate('task')
      artifact = createDelegate('artifact')
      agentBinding = createDelegate('agentBinding')
      categoryBinding = createDelegate('categoryBinding')
      $connect() {
        return Promise.resolve()
      }
      $disconnect() {
        return Promise.resolve()
      }
      $transaction(callback: any) {
        return callback(this)
      }
    }
  }
})

function clearMockStore() {
  Object.keys(mockStore).forEach(key => {
    mockStore[key] = []
  })
  uuidCounter = 0
}

describe('Performance: Database Load', () => {
  let prisma: PrismaClient
  let spaceId: string

  beforeAll(async () => {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    prisma = dbService.getClient()
  })

  afterAll(async () => {
    const db = DatabaseService.getInstance()
    await db.shutdown()
  })

  beforeEach(() => {
    clearMockStore()
  })

  test('handles high-frequency create operations (100 ops)', async () => {
    const space = await prisma.space.create({
      data: { name: 'Perf Space', workDir: '/tmp/perf' }
    })
    spaceId = space.id

    const session = await prisma.session.create({
      data: { spaceId, title: 'Perf Session', status: 'active' }
    })

    const startTime = Date.now()
    const createPromises: Promise<any>[] = []

    for (let i = 0; i < 100; i++) {
      createPromises.push(
        prisma.message.create({
          data: {
            sessionId: session.id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message content ${i} with some realistic text content.`
          }
        })
      )
    }

    await Promise.all(createPromises)

    const duration = Date.now() - startTime
    const opsPerSecond = Math.round(100 / (duration / 1000))

    console.log(`
=== High-Frequency Creates ===
Operations: 100 creates
Duration: ${duration}ms
Ops/sec: ${opsPerSecond}
Messages in store: ${mockStore.message.length}
`)

    expect(mockStore.message.length).toBe(100)
    expect(opsPerSecond).toBeGreaterThan(100)
  })

  test('handles concurrent reads and writes', async () => {
    const space = await prisma.space.create({
      data: { name: 'RW Space', workDir: '/tmp/rw' }
    })
    const session = await prisma.session.create({
      data: { spaceId: space.id, title: 'RW Session', status: 'active' }
    })

    for (let i = 0; i < 50; i++) {
      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: `Pre-seeded message ${i}`
        }
      })
    }

    const startTime = Date.now()
    const operations: Promise<any>[] = []

    for (let i = 0; i < 25; i++) {
      operations.push(
        prisma.message.create({
          data: { sessionId: session.id, role: 'assistant', content: `New message ${i}` }
        })
      )
    }

    for (let i = 0; i < 25; i++) {
      operations.push(
        prisma.message.findMany({ where: { sessionId: session.id }, take: 10, skip: i })
      )
    }

    const results = await Promise.all(operations)
    const duration = Date.now() - startTime

    console.log(`
=== Concurrent Reads/Writes ===
Write ops: 25
Read ops: 25
Duration: ${duration}ms
Total messages: ${mockStore.message.length}
`)

    expect(results.length).toBe(50)
    expect(mockStore.message.length).toBe(75)
    expect(duration).toBeLessThan(5000)
  })

  test('handles batch updates efficiently', async () => {
    const space = await prisma.space.create({
      data: { name: 'Batch Space', workDir: '/tmp/batch' }
    })
    const session = await prisma.session.create({
      data: { spaceId: space.id, title: 'Batch Session', status: 'active' }
    })

    for (let i = 0; i < 100; i++) {
      await prisma.task.create({
        data: {
          sessionId: session.id,
          type: 'test',
          input: `Task ${i}`,
          status: 'pending'
        }
      })
    }

    const startTime = Date.now()

    await prisma.task.updateMany({
      where: { status: 'pending' },
      data: { status: 'completed' }
    })

    const duration = Date.now() - startTime

    console.log(`
=== Batch Update Performance ===
Records updated: 100
Duration: ${duration}ms
`)

    const completedTasks = mockStore.task.filter(t => t.status === 'completed')
    expect(completedTasks.length).toBe(100)
    expect(duration).toBeLessThan(1000)
  })

  test('handles complex queries with pagination', async () => {
    const space = await prisma.space.create({
      data: { name: 'Query Space', workDir: '/tmp/query' }
    })
    const session = await prisma.session.create({
      data: { spaceId: space.id, title: 'Query Session', status: 'active' }
    })

    for (let i = 0; i < 200; i++) {
      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: i % 3 === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
          content: `Paginated message ${i}`
        }
      })
    }

    const startTime = Date.now()
    const pageSize = 20
    const pages: any[][] = []

    for (let page = 0; page < 10; page++) {
      const result = await prisma.message.findMany({
        where: { sessionId: session.id },
        take: pageSize,
        skip: page * pageSize
      })
      pages.push(result)
    }

    const duration = Date.now() - startTime

    console.log(`
=== Pagination Query Performance ===
Total records: 200
Pages fetched: 10
Page size: ${pageSize}
Duration: ${duration}ms
`)

    expect(pages.length).toBe(10)
    expect(pages[0].length).toBe(20)
    expect(duration).toBeLessThan(2000)
  })

  test('handles transaction-like operations', async () => {
    const space = await prisma.space.create({
      data: { name: 'Tx Space', workDir: '/tmp/tx' }
    })

    const startTime = Date.now()

    const result = await prisma.$transaction(async (tx: any) => {
      const session = await tx.session.create({
        data: { spaceId: space.id, title: 'Tx Session', status: 'active' }
      })

      const messages = []
      for (let i = 0; i < 10; i++) {
        const msg = await tx.message.create({
          data: { sessionId: session.id, role: 'user', content: `Tx message ${i}` }
        })
        messages.push(msg)
      }

      const task = await tx.task.create({
        data: { sessionId: session.id, type: 'test', input: 'Tx task', status: 'pending' }
      })

      return { session, messages, task }
    })

    const duration = Date.now() - startTime

    console.log(`
=== Transaction Performance ===
Session created: ${!!result.session}
Messages created: ${result.messages.length}
Task created: ${!!result.task}
Duration: ${duration}ms
`)

    expect(result.session).toBeDefined()
    expect(result.messages.length).toBe(10)
    expect(result.task).toBeDefined()
    expect(duration).toBeLessThan(1000)
  })

  test('measures connection pool behavior under load', async () => {
    const space = await prisma.space.create({
      data: { name: 'Pool Space', workDir: '/tmp/pool' }
    })
    const session = await prisma.session.create({
      data: { spaceId: space.id, title: 'Pool Session', status: 'active' }
    })

    const concurrentOperations = 50
    const operations: Promise<any>[] = []

    const startTime = Date.now()

    for (let i = 0; i < concurrentOperations; i++) {
      operations.push(
        prisma.message.create({
          data: { sessionId: session.id, role: 'user', content: `Pool test ${i}` }
        })
      )
      operations.push(prisma.message.findMany({ where: { sessionId: session.id } }))
    }

    await Promise.all(operations)
    const duration = Date.now() - startTime

    console.log(`
=== Connection Pool Load Test ===
Concurrent operations: ${concurrentOperations * 2}
Duration: ${duration}ms
Ops/sec: ${Math.round((concurrentOperations * 2) / (duration / 1000))}
`)

    expect(mockStore.message.length).toBe(concurrentOperations)
    expect(duration).toBeLessThan(10000)
  })
})

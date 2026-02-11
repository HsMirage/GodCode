import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'
import { WorkforceEngine } from '../../src/main/services/workforce/workforce-engine'
import type { PrismaClient } from '@prisma/client'

// Avoid real network LLM calls in perf tests.
process.env.CODEALL_E2E_TEST = '1'

// DelegateEngine now resolves model via BindingService; mock it to avoid DB binding tables in test fakes.
vi.mock('@/main/services/binding.service', () => ({
  BindingService: {
    getInstance: vi.fn(() => ({
      getCategoryModelConfig: vi.fn(async () => ({
        model: 'gpt-4o',
        provider: 'openai-compatible',
        temperature: 0.2,
        apiKey: 'test',
        baseURL: 'https://api.openai.com/v1'
      })),
      getAgentModelConfig: vi.fn(async () => ({
        model: 'gpt-4o',
        provider: 'openai-compatible',
        temperature: 0.2,
        apiKey: 'test',
        baseURL: 'https://api.openai.com/v1'
      })),
      getCategoryBinding: vi.fn(async () => null),
      getAgentBinding: vi.fn(async () => null)
    }))
  }
}))

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/codeall-perf-concurrent'
        return '/tmp'
      })
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

// Mock Prisma Client (In-Memory Fake)
const mockStore: any = {
  space: [],
  model: [],
  agentBinding: [],
  categoryBinding: [],
  session: [],
  message: [],
  task: [],
  artifact: []
}

// Simple UUID generator
let uuidCounter = 0
const uuid = () => `perf-uuid-${++uuidCounter}`

const createDelegate = (modelName: string) => ({
  create: vi.fn(async ({ data }: any) => {
    const entry = { id: uuid(), ...data, createdAt: new Date(), updatedAt: new Date() }
    mockStore[modelName].push(entry)
    return entry
  }),
  findUnique: vi.fn(async ({ where }: any) => {
    if (!where) return null
    const key = Object.keys(where)[0]
    const value = (where as any)[key]
    return mockStore[modelName].find((item: any) => item[key] === value) || null
  }),
  findFirst: vi.fn(async ({ where }: any) => {
    const items = mockStore[modelName]
    if (where) {
      // Very basic filter
      return (
        items.find((item: any) => Object.entries(where).every(([k, v]) => item[k] === v)) || null
      )
    }
    return items[0] || null
  }),
  findMany: vi.fn(async ({ where }: any) => {
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
                const filterValue = v as { in: any[] }
                return filterValue.in.includes(item[k])
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
            const filterValue = v as { in: any[] }
            return filterValue.in.includes(item[k])
          }
          return item[k] === v
        })
      })
    }
    return items
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
  delete: vi.fn(async ({ where }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index !== -1) mockStore[modelName].splice(index, 1)
    return { id: where.id }
  }),
  deleteMany: vi.fn(async () => ({ count: 0 }))
})

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      space = createDelegate('space')
      model = createDelegate('model')
      agentBinding = createDelegate('agentBinding')
      categoryBinding = createDelegate('categoryBinding')
      session = createDelegate('session')
      message = createDelegate('message')
      task = createDelegate('task')
      artifact = createDelegate('artifact')
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

// Mock LLM Adapter Factory
vi.mock('../../src/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => {
    return {
      sendMessage: vi.fn().mockImplementation(async messages => {
        // Mock decomposition response
        if (messages.some((m: any) => m.content.includes('Decompose the following task'))) {
          return {
            content: JSON.stringify({
              subtasks: [
                { id: `t-${Date.now()}-1`, description: 'Subtask 1', dependencies: [] },
                { id: `t-${Date.now()}-2`, description: 'Subtask 2', dependencies: [] }
              ]
            })
          }
        }
        // Mock execution response
        return { content: 'Task executed successfully via mock' }
      })
    }
  })
}))

describe('Performance: Concurrent Tasks', () => {
  let prisma: PrismaClient
  let workforceEngine: WorkforceEngine
  let spaceId: string
  let sessionId: string

  beforeAll(async () => {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    prisma = dbService.getClient()
    workforceEngine = new WorkforceEngine()

    // Setup basic data
    const space = await prisma.space.create({
      data: { name: 'Perf Space', workDir: '/tmp/perf-work-dir' }
    })
    spaceId = space.id

    await prisma.model.create({
      data: { provider: 'anthropic', modelName: 'claude-3-5-sonnet', apiKey: 'test', config: {} }
    })

    const session = await prisma.session.create({
      data: { spaceId: space.id, title: 'Perf Session', status: 'active' }
    })
    sessionId = session.id
  })

  afterAll(async () => {
    const db = DatabaseService.getInstance()
    await db.shutdown()
  })

  test('executes 3 concurrent workflows successfully', async () => {
    const tasks = ['Task A: Build header', 'Task B: Build sidebar', 'Task C: Build footer']

    const start = Date.now()

    // Execute 3 concurrent workflows
    const results = await Promise.all(tasks.map(t => workforceEngine.executeWorkflow(t, sessionId)))

    const elapsed = Date.now() - start
    console.log(`Concurrent execution time (3 workflows): ${elapsed}ms`)

    // Verification
    results.forEach(result => {
      expect(result.success).toBe(true)
      expect(result.tasks.length).toBeGreaterThan(0)
    })

    // Check we have roughly correct number of tasks in store
    expect(mockStore.task.length).toBeGreaterThanOrEqual(3) // At least 3 workflow tasks
  })
})

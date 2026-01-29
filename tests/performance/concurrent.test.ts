import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'
import { WorkforceEngine } from '../../src/main/services/workforce/workforce-engine'
import type { PrismaClient } from '@prisma/client'

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

// Mock Embedded Postgres
vi.mock('embedded-postgres', () => {
  return {
    default: class MockEmbeddedPostgres {
      initialise() {
        return Promise.resolve()
      }
      start() {
        return Promise.resolve()
      }
      stop() {
        return Promise.resolve()
      }
    }
  }
})

// Mock Prisma Client (In-Memory Fake)
const mockStore: any = {
  space: [],
  model: [],
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
      items = items.filter((item: any) =>
        Object.entries(where).every(([k, v]) => {
          if (v && typeof v === 'object' && 'in' in v) {
            const filterValue = v as { in: any[] }
            return filterValue.in.includes(item[k])
          }
          return item[k] === v
        })
      )
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
    const results = await Promise.all(tasks.map(t => workforceEngine.executeWorkflow(t)))

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

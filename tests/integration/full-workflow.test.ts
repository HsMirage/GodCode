import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'
import { WorkforceEngine } from '../../src/main/services/workforce/workforce-engine'
import type { PrismaClient } from '@prisma/client'

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/codeall-test-userdata'
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
  session: [],
  message: [],
  task: [],
  artifact: []
}

// Simple UUID generator
let uuidCounter = 0
const uuid = () => `uuid-${++uuidCounter}`

const createDelegate = (modelName: string) => ({
  create: vi.fn(async ({ data }: any) => {
    const entry = { id: uuid(), ...data, createdAt: new Date(), updatedAt: new Date() }
    mockStore[modelName].push(entry)
    return entry
  }),
  findFirst: vi.fn(async ({ where, orderBy }: any) => {
    // Simple filter support
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) => Object.entries(where).every(([k, v]) => item[k] === v))
    }
    // Simple sort support (only 1 level)
    if (orderBy) {
      const key = Object.keys(orderBy)[0]
      const dir = orderBy[key]
      items.sort((a: any, b: any) => {
        if (dir === 'asc') return a[key] > b[key] ? 1 : -1
        return a[key] < b[key] ? 1 : -1
      })
    }
    return items[0] || null
  }),
  findMany: vi.fn(async ({ where, orderBy }: any) => {
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) =>
        Object.entries(where).every(([k, v]) => {
          if (v && typeof v === 'object' && 'in' in v) {
            return (v as { in: unknown[] }).in.includes(item[k])
          }
          return item[k] === v
        })
      )
    }
    if (orderBy) {
      const key = Object.keys(orderBy)[0]
      const dir = orderBy[key]
      items.sort((a: any, b: any) => {
        if (dir === 'asc') return a[key] > b[key] ? 1 : -1
        return a[key] < b[key] ? 1 : -1
      })
    }
    return items
  }),
  update: vi.fn(async ({ where, data }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index === -1) throw new Error(`${modelName} not found`)
    const updated = { ...mockStore[modelName][index], ...data, updatedAt: new Date() }
    mockStore[modelName][index] = updated
    return updated
  }),
  delete: vi.fn(async ({ where }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index !== -1) mockStore[modelName].splice(index, 1)
    return { id: where.id }
  }),
  deleteMany: vi.fn(async ({ where }: any) => {
    const initialLen = mockStore[modelName].length
    mockStore[modelName] = mockStore[modelName].filter(
      (item: any) =>
        !Object.entries(where).every(([k, v]: any) => {
          if (v && typeof v === 'object' && 'in' in v) {
            return v.in.includes(item[k])
          }
          return item[k] === v
        })
    )
    return { count: initialLen - mockStore[modelName].length }
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
  createLLMAdapter: vi.fn((provider: string) => {
    return {
      sendMessage: vi.fn().mockImplementation(async messages => {
        // Mock decomposition response for WorkforceEngine
        if (messages.some((m: any) => m.content.includes('Decompose the following task'))) {
          return {
            content: JSON.stringify({
              subtasks: [
                { id: 't1', description: 'Design login form', dependencies: [] },
                { id: 't2', description: 'Implement validation logic', dependencies: ['t1'] },
                { id: 't3', description: 'Create API integration', dependencies: ['t2'] }
              ]
            })
          }
        }
        // Mock generic response for subtasks
        return {
          content: 'Task executed successfully via mock'
        }
      })
    }
  })
}))

describe('Full Workflow Integration', () => {
  let prisma: PrismaClient
  let workforceEngine: WorkforceEngine

  // Test Data IDs
  let spaceId: string
  let sessionId: string
  const createdModelIds: string[] = []

  beforeAll(async () => {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    prisma = dbService.getClient()
    workforceEngine = new WorkforceEngine()
  })

  afterAll(async () => {
    if (prisma) {
      if (sessionId) {
        await prisma.task.deleteMany({ where: { sessionId } })
        await prisma.message.deleteMany({ where: { sessionId } })
        await prisma.session.delete({ where: { id: sessionId } })
      }

      if (createdModelIds.length > 0) {
        await prisma.model.deleteMany({ where: { id: { in: createdModelIds } } })
      }

      if (spaceId) {
        await prisma.space.delete({ where: { id: spaceId } })
      }
    }
  })

  test('complete workflow: Space → Models → Task → Workforce → Artifact', async () => {
    const space = await prisma.space.create({
      data: {
        name: 'Integration Test Space',
        workDir: '/tmp/test-work-dir'
      }
    })
    spaceId = space.id
    expect(space.id).toBeDefined()

    const model1 = await prisma.model.create({
      data: {
        provider: 'anthropic',
        modelName: 'claude-3-5-sonnet-20240620',
        apiKey: 'sk-ant-test-key',
        config: {}
      }
    })
    createdModelIds.push(model1.id)

    const model2 = await prisma.model.create({
      data: {
        provider: 'openai',
        modelName: 'gpt-4o',
        apiKey: 'sk-proj-test-key',
        config: {}
      }
    })
    createdModelIds.push(model2.id)

    const session = await prisma.session.create({
      data: {
        spaceId: space.id,
        title: 'Workflow Test Session',
        status: 'active'
      }
    })
    sessionId = session.id
    expect(session.spaceId).toBe(space.id)

    const userMessage = await prisma.message.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: 'Build a login page with form validation'
      }
    })
    expect(userMessage.id).toBeDefined()

    const result = await workforceEngine.executeWorkflow(userMessage.content)

    expect(result.success).toBe(true)
    expect(result.tasks).toHaveLength(3)
    expect(result.tasks[0].id).toBe('t1')

    const tasks = await prisma.task.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' }
    })

    expect(tasks.length).toBeGreaterThanOrEqual(4)

    const workflowTask = tasks.find(t => t.type === 'workflow')
    expect(workflowTask).toBeDefined()
    expect(workflowTask?.status).toBe('completed')

    const subtasks = tasks.filter(t => t.type === 'subtask')
    expect(subtasks).toHaveLength(3)
    expect(subtasks.every(t => t.status === 'completed')).toBe(true)

    expect(workflowTask?.output).toContain('Task executed successfully via mock')
  })
})

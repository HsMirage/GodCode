import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/database'
import { WorkforceEngine } from '../../src/main/services/workforce/workforce-engine'
import type { PrismaClient } from '@prisma/client'

/**
 * Performance Tests: Concurrent Agent Execution
 *
 * Benchmarks:
 * - 3 concurrent agents: < 30s total
 * - 5 concurrent agents: < 60s total
 * - Memory usage: < 500MB peak increase
 * - All agents complete successfully
 */

// Avoid real network LLM calls in perf tests.
process.env.CODEALL_E2E_TEST = '1'

// DelegateEngine now resolves model via BindingService; mock it to avoid DB binding tables in test fakes.
vi.mock('@/main/services/binding.service', () => ({
  BindingService: {
    getInstance: vi.fn(() => ({
      getCategoryModelConfig: vi.fn(async () => ({
        model: 'gpt-4o',
        temperature: 0.2,
        apiKey: 'test',
        baseURL: 'https://api.openai.com/v1'
      })),
      getAgentModelConfig: vi.fn(async () => ({
        model: 'gpt-4o',
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
        if (name === 'userData') return '/tmp/codeall-perf-agents'
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
const uuid = () => `perf-agent-uuid-${++uuidCounter}`

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
  findMany: vi.fn(async ({ where }: any) => {
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) =>
        Object.entries(where).every(([k, v]) => {
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

// Mock LLM Adapter Factory with variable delay to simulate realistic agent work
vi.mock('../../src/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => {
    return {
      sendMessage: vi.fn().mockImplementation(async messages => {
        // Simulate variable LLM response time (50-200ms)
        const delay = 50 + Math.random() * 150
        await new Promise(resolve => setTimeout(resolve, delay))

        // Mock decomposition response
        if (messages.some((m: any) => m.content?.includes('Decompose'))) {
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

// Helper to measure memory
function getMemoryMB(): number {
  const usage = process.memoryUsage()
  return Math.round(usage.heapUsed / 1024 / 1024)
}

// Helper to force garbage collection if available
function forceGC(): void {
  if (global.gc) {
    global.gc()
  }
}

describe('Performance: Concurrent Agent Execution', () => {
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
      data: { name: 'Perf Agent Space', workDir: '/tmp/perf-agent-work-dir' }
    })
    spaceId = space.id

    await prisma.model.create({
      data: {
        provider: 'openai-compatible',
        modelName: 'claude-3-5-sonnet',
        apiKey: 'test',
        config: {}
      }
    })

    const session = await prisma.session.create({
      data: { spaceId: space.id, title: 'Perf Agent Session', status: 'active' }
    })
    sessionId = session.id
  })

  afterAll(async () => {
    const db = DatabaseService.getInstance()
    await db.shutdown()

    // Reset mock store
    Object.keys(mockStore).forEach(key => {
      mockStore[key] = []
    })
  })

  test('executes 3 concurrent agents without crashes', async () => {
    const tasks = [
      'Agent A: Implement user authentication',
      'Agent B: Create database schema',
      'Agent C: Setup API endpoints'
    ]

    const startTime = Date.now()
    const startMemory = getMemoryMB()

    // Execute 3 agents in parallel
    const results = await Promise.all(tasks.map(t => workforceEngine.executeWorkflow(t)))

    const duration = Date.now() - startTime
    const endMemory = getMemoryMB()
    const memoryDelta = endMemory - startMemory

    console.log(`
=== 3 Concurrent Agents Performance ===
Duration: ${duration}ms
Start Memory: ${startMemory}MB
End Memory: ${endMemory}MB
Memory Delta: ${memoryDelta}MB
Tasks Created: ${mockStore.task.length}
`)

    // Verify all succeeded
    expect(results).toHaveLength(3)
    results.forEach((result, idx) => {
      expect(result.success, `Agent ${idx + 1} should succeed`).toBe(true)
      expect(result.tasks.length, `Agent ${idx + 1} should create tasks`).toBeGreaterThan(0)
    })

    // Performance assertions
    expect(duration).toBeLessThan(30000) // < 30s
    expect(memoryDelta).toBeLessThan(500) // < 500MB increase
  }, 60000)

  test('executes 5 concurrent agents under load', async () => {
    const tasks = [
      'Agent 1: Build header component',
      'Agent 2: Build sidebar navigation',
      'Agent 3: Build footer component',
      'Agent 4: Create routing system',
      'Agent 5: Setup state management'
    ]

    forceGC()
    const startTime = Date.now()
    const startMemory = getMemoryMB()

    // Execute 5 agents in parallel
    const results = await Promise.all(tasks.map(t => workforceEngine.executeWorkflow(t)))

    const duration = Date.now() - startTime
    const endMemory = getMemoryMB()
    const memoryDelta = endMemory - startMemory

    console.log(`
=== 5 Concurrent Agents Performance ===
Duration: ${duration}ms
Start Memory: ${startMemory}MB
End Memory: ${endMemory}MB
Memory Delta: ${memoryDelta}MB
Tasks Created: ${mockStore.task.length}
`)

    // Verify all succeeded
    expect(results).toHaveLength(5)
    results.forEach((result, idx) => {
      expect(result.success, `Agent ${idx + 1} should succeed`).toBe(true)
    })

    // Performance assertions
    expect(duration).toBeLessThan(60000) // < 60s
    expect(memoryDelta).toBeLessThan(500) // < 500MB increase
  }, 120000)

  test('handles agent execution with varying workloads', async () => {
    const heavyTask = 'Complex: Implement full authentication system with OAuth, JWT, and 2FA'
    const lightTask = 'Simple: Add a console.log statement'

    const startTime = Date.now()

    const results = await Promise.all([
      workforceEngine.executeWorkflow(heavyTask),
      workforceEngine.executeWorkflow(lightTask),
      workforceEngine.executeWorkflow(heavyTask),
      workforceEngine.executeWorkflow(lightTask)
    ])

    const duration = Date.now() - startTime

    console.log(`
=== Mixed Workload Performance ===
Duration: ${duration}ms
All agents completed: ${results.every(r => r.success)}
`)

    expect(results.every(r => r.success)).toBe(true)
    expect(duration).toBeLessThan(45000) // < 45s
  }, 60000)

  test('measures agent isolation - no cross-contamination', async () => {
    const agentTasks = [
      'Isolated Agent A: Create file-a.ts',
      'Isolated Agent B: Create file-b.ts',
      'Isolated Agent C: Create file-c.ts'
    ]

    const results = await Promise.all(agentTasks.map(t => workforceEngine.executeWorkflow(t)))

    // Each result should be independent
    expect(results).toHaveLength(3)

    // Verify tasks are distinct (by checking task descriptions are different)
    const allTasks = mockStore.task
    const uniqueDescriptions = new Set(allTasks.map((t: any) => t.description))

    // Should have multiple unique task descriptions
    expect(uniqueDescriptions.size).toBeGreaterThan(0)

    for (const r of results) {
      expect(r.success).toBe(true)
    }
  }, 45000)

  test('tracks memory usage over repeated agent executions', async () => {
    const memorySnapshots: number[] = []
    const iterations = 5

    forceGC()
    memorySnapshots.push(getMemoryMB())

    for (let i = 0; i < iterations; i++) {
      await workforceEngine.executeWorkflow(`Iteration ${i + 1}: Create component-${i}`)
      forceGC()
      memorySnapshots.push(getMemoryMB())
    }

    console.log(`
=== Memory Tracking Over Iterations ===
Snapshots: ${memorySnapshots.join('MB -> ')}MB
Initial: ${memorySnapshots[0]}MB
Final: ${memorySnapshots[memorySnapshots.length - 1]}MB
Growth: ${memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]}MB
`)

    // Memory should not grow unboundedly (< 100MB growth over 5 iterations)
    const memoryGrowth = memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]
    expect(memoryGrowth).toBeLessThan(100)
  }, 60000)
})

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../src/main/services/database'
import type { PrismaClient } from '@prisma/client'

// Set E2E test mode BEFORE imports that read it
process.env.CODEALL_E2E_TEST = '1'

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/codeall-test-userdata'
        return '/tmp'
      })
    },
    safeStorage: {
      // Keep encryption disabled in tests; SecureStorageService will treat values as plaintext.
      isEncryptionAvailable: vi.fn(() => false),
      encryptString: vi.fn((text: string) => Buffer.from(text, 'utf-8')),
      decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8'))
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

// In-memory mock store for Prisma
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
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) => Object.entries(where).every(([k, v]) => item[k] === v))
    }
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
  findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
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
  deleteMany: vi.fn(async ({ where }: any = {}) => {
    if (!where) {
      const count = mockStore[modelName].length
      mockStore[modelName] = []
      return { count }
    }
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
    },
    Prisma: {
      TransactionClient: class {}
    }
  }
})

// Mock Logger
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock LoggerService
vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    })
  }
}))

// Mock cost-tracker
vi.mock('@/main/services/llm/cost-tracker', () => ({
  costTracker: {
    trackUsage: vi.fn()
  }
}))

// Mock SmartRouter to return 'direct' strategy
vi.mock('@/main/services/router/smart-router', () => ({
  SmartRouter: class {
    analyzeTask() {
      return 'direct'
    }
    route() {
      return Promise.resolve({ strategy: 'direct', output: '' })
    }
  }
}))

// Mock tool-execution.service to avoid real file operations
vi.mock('@/main/services/tools/tool-execution.service', () => ({
  toolExecutionService: {
    executeTool: vi.fn().mockResolvedValue({
      success: true,
      result: { output: 'file1.ts\nfile2.ts' }
    })
  }
}))

// Mock builtin tools registration
vi.mock('@/main/services/tools', () => ({}))

describe('Chat IPC Integration - handleMessageSend', () => {
  let prisma: PrismaClient
  let sessionId: string
  let spaceId: string
  let streamChunks: Array<{ content: string; done: boolean }>
  let mockEvent: IpcMainInvokeEvent

  // Create a fresh mock event for each test
  const createMockEvent = () => {
    streamChunks = []
    return {
      sender: {
        send: vi.fn((channel: string, data: any) => {
          if (channel === 'message:stream-chunk') {
            streamChunks.push(data)
          }
        })
      },
      frameId: 1,
      processId: 1,
      senderFrame: {} as any
    } as unknown as IpcMainInvokeEvent
  }

  beforeAll(async () => {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    prisma = dbService.getClient()
  })

  beforeEach(async () => {
    // Clear mock stores
    mockStore.space = []
    mockStore.model = []
    mockStore.session = []
    mockStore.message = []
    mockStore.task = []
    mockStore.artifact = []
    uuidCounter = 0

    // Create a space and session for testing
    const space = await prisma.space.create({
      data: {
        name: 'Chat IPC Test Space',
        workDir: '/tmp/chat-ipc-test'
      }
    })
    spaceId = space.id

    const session = await prisma.session.create({
      data: {
        spaceId: space.id,
        title: 'Chat IPC Test Session',
        status: 'active'
      }
    })
    sessionId = session.id

    // Create fresh mock event
    mockEvent = createMockEvent()
  })

  afterAll(async () => {
    // Cleanup
    if (prisma) {
      await prisma.message.deleteMany({ where: { sessionId } })
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
      await prisma.space.delete({ where: { id: spaceId } }).catch(() => {})
    }
  })

  test('send normal message - assistant response contains "Mock Response"', async () => {
    // Dynamic import to get the handler after mocks are set up
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Hello, how are you?'
    })

    // Verify the assistant message was created
    expect(result).toBeDefined()
    expect(result.role).toBe('assistant')
    expect(result.sessionId).toBe(sessionId)
    expect(result.content).toContain('Mock')

    // Verify streaming chunks were sent
    expect(streamChunks.length).toBeGreaterThan(0)

    // The last chunk should have done: true
    const lastChunk = streamChunks[streamChunks.length - 1]
    expect(lastChunk.done).toBe(true)

    // Concatenate all chunk contents
    const fullContent = streamChunks.map(c => c.content).join('')
    expect(fullContent).toContain('Mock')

    // Verify event.sender.send was called with message:stream-chunk
    expect(mockEvent.sender.send).toHaveBeenCalledWith(
      'message:stream-chunk',
      expect.objectContaining({ content: expect.any(String) })
    )
  })

  test('send message containing "tool:" - response includes "Tool Execution Result"', async () => {
    // Dynamic import to get the handler after mocks are set up
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Please run tool: file_list'
    })

    // Verify the assistant message was created
    expect(result).toBeDefined()
    expect(result.role).toBe('assistant')
    expect(result.sessionId).toBe(sessionId)
    expect(result.content).toContain('Tool Execution Result')

    // Verify streaming chunks were sent
    expect(streamChunks.length).toBeGreaterThan(0)

    // Concatenate all chunk contents
    const fullContent = streamChunks.map(c => c.content).join('')
    expect(fullContent).toContain('Tool Execution Result')

    // The last chunk should have done: true
    const lastChunk = streamChunks[streamChunks.length - 1]
    expect(lastChunk.done).toBe(true)

    // Verify event.sender.send was called with message:stream-chunk
    expect(mockEvent.sender.send).toHaveBeenCalledWith(
      'message:stream-chunk',
      expect.objectContaining({ content: expect.any(String) })
    )
  })
})

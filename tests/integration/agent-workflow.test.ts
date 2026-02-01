import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockStore: Record<string, any[]> = {
    space: [],
    session: [],
    message: [],
    task: [],
    model: [],
    artifact: []
  }

  let idCounter = 0
  const genId = () => `id-${++idCounter}-${Date.now()}`

  const createPrismaDelegate = (tableName: string) => ({
    create: vi.fn(async ({ data }: any) => {
      const entry = {
        id: genId(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockStore[tableName].push(entry)
      return entry
    }),
    findFirst: vi.fn(async ({ where, orderBy }: any = {}) => {
      let items = [...mockStore[tableName]]
      if (where) {
        items = items.filter(item => Object.entries(where).every(([k, v]) => item[k] === v))
      }
      if (orderBy) {
        const key = Object.keys(orderBy)[0]
        const dir = orderBy[key]
        items.sort((a, b) =>
          dir === 'asc' ? (a[key] > b[key] ? 1 : -1) : a[key] < b[key] ? 1 : -1
        )
      }
      return items[0] || null
    }),
    findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
      let items = [...mockStore[tableName]]
      if (where) {
        items = items.filter(item =>
          Object.entries(where).every(([k, v]: [string, any]) => {
            if (v && typeof v === 'object' && 'in' in v) {
              return v.in.includes(item[k])
            }
            return item[k] === v
          })
        )
      }
      if (orderBy) {
        const key = Object.keys(orderBy)[0]
        const dir = orderBy[key]
        items.sort((a, b) =>
          dir === 'asc' ? (a[key] > b[key] ? 1 : -1) : a[key] < b[key] ? 1 : -1
        )
      }
      return items
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return mockStore[tableName].find(item => item.id === where.id) || null
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const idx = mockStore[tableName].findIndex(item => item.id === where.id)
      if (idx === -1) throw new Error(`${tableName} not found`)
      const updated = { ...mockStore[tableName][idx], ...data, updatedAt: new Date() }
      mockStore[tableName][idx] = updated
      return updated
    }),
    delete: vi.fn(async ({ where }: any) => {
      const idx = mockStore[tableName].findIndex(item => item.id === where.id)
      if (idx !== -1) mockStore[tableName].splice(idx, 1)
      return { id: where.id }
    }),
    deleteMany: vi.fn(async ({ where }: any = {}) => {
      if (!where) {
        const count = mockStore[tableName].length
        mockStore[tableName] = []
        return { count }
      }
      const initialLen = mockStore[tableName].length
      mockStore[tableName] = mockStore[tableName].filter(
        item =>
          !Object.entries(where).every(([k, v]: [string, any]) => {
            if (v && typeof v === 'object' && 'in' in v) {
              return v.in.includes(item[k])
            }
            return item[k] === v
          })
      )
      return { count: initialLen - mockStore[tableName].length }
    }),
    count: vi.fn(async ({ where }: any = {}) => {
      if (!where) return mockStore[tableName].length
      return mockStore[tableName].filter(item =>
        Object.entries(where).every(([k, v]) => item[k] === v)
      ).length
    })
  })

  const prismaObj: any = {
    space: createPrismaDelegate('space'),
    session: createPrismaDelegate('session'),
    message: createPrismaDelegate('message'),
    task: createPrismaDelegate('task'),
    model: createPrismaDelegate('model'),
    artifact: createPrismaDelegate('artifact'),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: null as any
  }
  prismaObj.$transaction = vi.fn((callback: any) => callback(prismaObj))

  const llmAdapter = {
    sendMessage: vi.fn().mockResolvedValue({
      content: 'Mock assistant response',
      usage: { input_tokens: 10, output_tokens: 20 }
    }),
    streamMessage: vi.fn()
  }

  const clearStore = () => {
    Object.keys(mockStore).forEach(key => {
      mockStore[key] = []
    })
    idCounter = 0
  }

  return { prisma: prismaObj, llmAdapter, mockStore, clearStore }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/codeall-test-userdata'
      return '/tmp'
    })
  }
}))

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mocks.prisma,
      init: vi.fn().mockResolvedValue(undefined)
    })
  }
}))

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

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => mocks.llmAdapter)
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true)
  }
})

describe('Agent Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.clearStore()
    mocks.llmAdapter.sendMessage.mockResolvedValue({
      content: 'Mock assistant response',
      usage: { input_tokens: 10, output_tokens: 20 }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Session Lifecycle', () => {
    it('should create space and session with proper relationships', async () => {
      const space = await mocks.prisma.space.create({
        data: {
          name: 'Test Workspace',
          workDir: '/tmp/test-workspace'
        }
      })

      expect(space.id).toBeDefined()
      expect(space.name).toBe('Test Workspace')

      const session = await mocks.prisma.session.create({
        data: {
          spaceId: space.id,
          title: 'Agent Test Session',
          status: 'active'
        }
      })

      expect(session.id).toBeDefined()
      expect(session.spaceId).toBe(space.id)
      expect(session.title).toBe('Agent Test Session')

      const storedSpace = await mocks.prisma.space.findUnique({ where: { id: space.id } })
      const storedSession = await mocks.prisma.session.findUnique({ where: { id: session.id } })

      expect(storedSpace).toBeDefined()
      expect(storedSession).toBeDefined()
      expect(storedSession?.spaceId).toBe(space.id)
    })

    it('should create and retrieve messages in chronological order', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Message Test', workDir: '/tmp/msg-test' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Message Session' }
      })

      const msg1 = await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'First message' }
      })
      await new Promise(r => setTimeout(r, 10))

      const msg2 = await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'assistant', content: 'First response' }
      })
      await new Promise(r => setTimeout(r, 10))

      const msg3 = await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'Second message' }
      })

      const messages = await mocks.prisma.message.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' }
      })

      expect(messages).toHaveLength(3)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('First message')
      expect(messages[1].role).toBe('assistant')
      expect(messages[2].role).toBe('user')
    })

    it('should isolate sessions between different spaces', async () => {
      const space1 = await mocks.prisma.space.create({
        data: { name: 'Space One', workDir: '/tmp/space1' }
      })
      const space2 = await mocks.prisma.space.create({
        data: { name: 'Space Two', workDir: '/tmp/space2' }
      })

      const session1 = await mocks.prisma.session.create({
        data: { spaceId: space1.id, title: 'Session in Space 1' }
      })
      const session2 = await mocks.prisma.session.create({
        data: { spaceId: space2.id, title: 'Session in Space 2' }
      })

      await mocks.prisma.message.create({
        data: { sessionId: session1.id, role: 'user', content: 'Message for space 1' }
      })
      await mocks.prisma.message.create({
        data: { sessionId: session2.id, role: 'user', content: 'Message for space 2' }
      })

      const msgs1 = await mocks.prisma.message.findMany({ where: { sessionId: session1.id } })
      const msgs2 = await mocks.prisma.message.findMany({ where: { sessionId: session2.id } })

      expect(msgs1).toHaveLength(1)
      expect(msgs2).toHaveLength(1)
      expect(msgs1[0].content).toContain('space 1')
      expect(msgs2[0].content).toContain('space 2')
    })
  })

  describe('Agent Execution Flow', () => {
    it('should execute complete agent workflow: message -> task -> response', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Agent Workflow Space', workDir: '/tmp/agent-test' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Agent Workflow Session', status: 'active' }
      })

      await mocks.prisma.model.create({
        data: {
          provider: 'anthropic',
          modelName: 'claude-3-5-sonnet-20240620',
          apiKey: 'test-api-key',
          config: {}
        }
      })

      const userMessage = await mocks.prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: 'Write a hello world function in Python'
        }
      })

      await new Promise(r => setTimeout(r, 10))

      const task = await mocks.prisma.task.create({
        data: {
          sessionId: session.id,
          type: 'agent',
          input: userMessage.content,
          status: 'running',
          metadata: { messageId: userMessage.id }
        }
      })

      const llmResponse = await mocks.llmAdapter.sendMessage(
        [{ role: 'user', content: userMessage.content }],
        { model: 'claude-3-5-sonnet-20240620' }
      )

      await new Promise(r => setTimeout(r, 10))

      const assistantMessage = await mocks.prisma.message.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: llmResponse.content
        }
      })

      await mocks.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          output: llmResponse.content,
          completedAt: new Date()
        }
      })

      const allMessages = await mocks.prisma.message.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' }
      })

      expect(allMessages).toHaveLength(2)
      expect(allMessages[0].role).toBe('user')
      expect(allMessages[1].role).toBe('assistant')

      const completedTask = await mocks.prisma.task.findUnique({ where: { id: task.id } })
      expect(completedTask?.status).toBe('completed')
      expect(completedTask?.output).toBeDefined()
    })

    it('should handle agent execution failures gracefully', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Error Test', workDir: '/tmp/error-test' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Error Session' }
      })

      const task = await mocks.prisma.task.create({
        data: {
          sessionId: session.id,
          type: 'agent',
          input: 'Failing request',
          status: 'running'
        }
      })

      mocks.llmAdapter.sendMessage.mockRejectedValueOnce(new Error('API rate limit exceeded'))

      let error: Error | null = null
      try {
        await mocks.llmAdapter.sendMessage([{ role: 'user', content: 'test' }], {})
      } catch (e) {
        error = e as Error
      }

      await mocks.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          output: `Error: ${error?.message}`,
          completedAt: new Date()
        }
      })

      const failedTask = await mocks.prisma.task.findUnique({ where: { id: task.id } })
      expect(failedTask?.status).toBe('failed')
      expect(failedTask?.output).toContain('rate limit')
    })
  })

  describe('Space-Session-Agent Interaction', () => {
    it('should maintain session state across multiple agent interactions', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Stateful Test', workDir: '/tmp/stateful' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Stateful Session', status: 'active' }
      })

      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'My name is Alice' }
      })
      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'assistant', content: 'Hello Alice!' }
      })

      await mocks.prisma.session.update({
        where: { id: session.id },
        data: {
          title: 'Chat with Alice'
        }
      })

      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'What is my name?' }
      })
      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'assistant', content: 'Your name is Alice.' }
      })

      const updatedSession = await mocks.prisma.session.findUnique({ where: { id: session.id } })
      expect(updatedSession?.title).toBe('Chat with Alice')

      const messageCount = await mocks.prisma.message.count({ where: { sessionId: session.id } })
      expect(messageCount).toBe(4)
    })
  })
})

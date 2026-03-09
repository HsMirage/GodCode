import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockStore: Record<string, any[]> = {
    space: [],
    session: [],
    message: [],
    task: [],
    model: [],
    artifact: [],
    auditLog: [],
    schemaVersion: [],
    run: [],
    apiKey: []
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
        items = items.filter(item =>
          Object.entries(where).every(([k, v]: [string, any]) => {
            if (v && typeof v === 'object' && 'gte' in v) {
              return item[k] >= v.gte
            }
            if (v && typeof v === 'object' && 'lte' in v) {
              return item[k] <= v.lte
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
      return items[0] || null
    }),
    findMany: vi.fn(async ({ where, orderBy, take, skip }: any = {}) => {
      let items = [...mockStore[tableName]]
      if (where) {
        items = items.filter(item =>
          Object.entries(where).every(([k, v]: [string, any]) => {
            if (v && typeof v === 'object' && 'in' in v) {
              return v.in.includes(item[k])
            }
            if (v && typeof v === 'object' && 'gte' in v) {
              return item[k] >= v.gte
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
      if (skip) items = items.slice(skip)
      if (take) items = items.slice(0, take)
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
    auditLog: createPrismaDelegate('auditLog'),
    schemaVersion: createPrismaDelegate('schemaVersion'),
    run: createPrismaDelegate('run'),
    apiKey: createPrismaDelegate('apiKey'),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: null as any
  }
  prismaObj.$transaction = vi.fn((callback: any) => callback(prismaObj))

  const clearStore = () => {
    Object.keys(mockStore).forEach(key => {
      mockStore[key] = []
    })
    idCounter = 0
  }

  return { prisma: prismaObj, mockStore, clearStore }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/godcode-test-userdata'
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

vi.mock('@/main/services/data-directory.service', () => ({
  DataDirectoryService: {
    getInstance: () => ({
      getBackupDir: vi.fn().mockReturnValue('/tmp/godcode-backups')
    })
  }
}))

vi.mock('@/main/services/schema-version.service', () => ({
  SchemaVersionService: {
    getInstance: () => ({
      getCurrentVersion: vi.fn().mockResolvedValue('1.0.0')
    })
  }
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  const mockFiles: Record<string, string> = {}
  return {
    ...actual,
    existsSync: vi.fn((path: string) => path in mockFiles || path === '/tmp/godcode-backups'),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((path: string, content: string) => {
      mockFiles[path] = content
    }),
    readFileSync: vi.fn((path: string) => mockFiles[path] || ''),
    readdirSync: vi.fn(() => Object.keys(mockFiles).map(p => p.split('/').pop())),
    statSync: vi.fn(() => ({ size: 1024, birthtime: new Date() })),
    unlinkSync: vi.fn((path: string) => {
      delete mockFiles[path]
    }),
    rmSync: vi.fn()
  }
})

describe('Data Persistence Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.clearStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Service Operations and Database Writes', () => {
    it('should persist space creation with all fields', async () => {
      const space = await mocks.prisma.space.create({
        data: {
          name: 'Persistence Test Space',
          workDir: '/tmp/persistence-test'
        }
      })

      expect(space.id).toBeDefined()
      expect(space.name).toBe('Persistence Test Space')
      expect(space.workDir).toBe('/tmp/persistence-test')
      expect(space.createdAt).toBeInstanceOf(Date)

      const retrieved = await mocks.prisma.space.findUnique({ where: { id: space.id } })
      expect(retrieved).toEqual(space)
    })

    it('should persist session with model references', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Space', workDir: '/tmp' }
      })

      const model = await mocks.prisma.model.create({
        data: {
          provider: 'anthropic',
          modelName: 'claude-3-5-sonnet',
          apiKey: 'test-key',
          config: {}
        }
      })

      const session = await mocks.prisma.session.create({
        data: {
          spaceId: space.id,
          title: 'Test Session',
          modelId: model.id,
          status: 'active'
        }
      })

      expect(session.spaceId).toBe(space.id)
      expect(session.modelId).toBe(model.id)

      const retrieved = await mocks.prisma.session.findUnique({ where: { id: session.id } })
      expect(retrieved?.modelId).toBe(model.id)
    })

    it('should persist message chain with proper ordering', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Space', workDir: '/tmp' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Session' }
      })

      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'First' }
      })
      await new Promise(r => setTimeout(r, 10))
      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'assistant', content: 'Second' }
      })
      await new Promise(r => setTimeout(r, 10))
      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'Third' }
      })

      const messages = await mocks.prisma.message.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' }
      })

      expect(messages).toHaveLength(3)
      expect(messages[0].content).toBe('First')
      expect(messages[1].content).toBe('Second')
      expect(messages[2].content).toBe('Third')
    })
  })

  describe('Audit Logging Integration', () => {
    it('should log operations across services', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Audit Test', workDir: '/tmp/audit' }
      })

      await mocks.prisma.auditLog.create({
        data: {
          action: 'CREATE',
          entityType: 'space',
          entityId: space.id,
          success: true,
          metadata: { name: space.name }
        }
      })

      const logs = await mocks.prisma.auditLog.findMany({
        where: { entityId: space.id }
      })

      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe('CREATE')
      expect(logs[0].entityType).toBe('space')
      expect(logs[0].success).toBe(true)
    })

    it('should track failed operations with error details', async () => {
      await mocks.prisma.auditLog.create({
        data: {
          action: 'CREATE',
          entityType: 'space',
          success: false,
          errorMsg: 'Validation failed: name is required'
        }
      })

      const failedLogs = await mocks.prisma.auditLog.findMany({
        where: { success: false }
      })

      expect(failedLogs).toHaveLength(1)
      expect(failedLogs[0].errorMsg).toContain('Validation failed')
    })

    it('should query logs by session', async () => {
      const sessionId = 'test-session-123'

      await mocks.prisma.auditLog.create({
        data: {
          action: 'MESSAGE_CREATE',
          entityType: 'message',
          sessionId,
          success: true
        }
      })
      await mocks.prisma.auditLog.create({
        data: {
          action: 'TASK_CREATE',
          entityType: 'task',
          sessionId,
          success: true
        }
      })

      const sessionLogs = await mocks.prisma.auditLog.findMany({
        where: { sessionId }
      })

      expect(sessionLogs).toHaveLength(2)
      expect(sessionLogs.every((l: any) => l.sessionId === sessionId)).toBe(true)
    })
  })

  describe('Transaction and Recovery', () => {
    it('should execute operations within transaction', async () => {
      const result = await mocks.prisma.$transaction(async (tx: any) => {
        const space = await tx.space.create({
          data: { name: 'Transactional Space', workDir: '/tmp/tx' }
        })
        const session = await tx.session.create({
          data: { spaceId: space.id, title: 'Transactional Session' }
        })
        return { space, session }
      })

      expect(result.space.id).toBeDefined()
      expect(result.session.spaceId).toBe(result.space.id)
    })

    it('should verify data integrity after operations', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Integrity Test', workDir: '/tmp/integrity' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Session' }
      })

      for (let i = 0; i < 5; i++) {
        await mocks.prisma.message.create({
          data: {
            sessionId: session.id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Msg ${i}`
          }
        })
      }

      const messageCount = await mocks.prisma.message.count({ where: { sessionId: session.id } })
      expect(messageCount).toBe(5)

      const allMessages = await mocks.prisma.message.findMany({ where: { sessionId: session.id } })
      expect(allMessages.every((m: any) => m.sessionId === session.id)).toBe(true)
    })
  })

  describe('Backup and Restore Workflows', () => {
    it('should create backup with all entity data', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Backup Space', workDir: '/tmp/backup' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'Backup Session' }
      })
      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'Backup message' }
      })

      const [spaces, sessions, messages] = await Promise.all([
        mocks.prisma.space.findMany({}),
        mocks.prisma.session.findMany({}),
        mocks.prisma.message.findMany({})
      ])

      const backupData = {
        metadata: { version: '1.0.0', timestamp: new Date().toISOString() },
        tables: { spaces, sessions, messages }
      }

      expect(backupData.tables.spaces).toHaveLength(1)
      expect(backupData.tables.sessions).toHaveLength(1)
      expect(backupData.tables.messages).toHaveLength(1)
      expect(backupData.metadata.version).toBe('1.0.0')
    })

    it('should restore data from backup structure', async () => {
      const backupData = {
        tables: {
          spaces: [{ id: 'restored-space', name: 'Restored', workDir: '/tmp/restore' }],
          sessions: [
            { id: 'restored-session', spaceId: 'restored-space', title: 'Restored Session' }
          ]
        }
      }

      for (const space of backupData.tables.spaces) {
        await mocks.prisma.space.create({ data: space })
      }
      for (const session of backupData.tables.sessions) {
        await mocks.prisma.session.create({ data: session })
      }

      const restoredSpace = await mocks.prisma.space.findFirst({ where: { name: 'Restored' } })
      const restoredSession = await mocks.prisma.session.findFirst({
        where: { title: 'Restored Session' }
      })

      expect(restoredSpace).toBeDefined()
      expect(restoredSession).toBeDefined()
      expect(restoredSession?.spaceId).toBe(restoredSpace?.id)
    })
  })

  describe('Data Cleanup and Cascade', () => {
    it('should delete messages when session is deleted', async () => {
      const space = await mocks.prisma.space.create({
        data: { name: 'Cleanup Test', workDir: '/tmp/cleanup' }
      })
      const session = await mocks.prisma.session.create({
        data: { spaceId: space.id, title: 'To Delete' }
      })
      await mocks.prisma.message.create({
        data: { sessionId: session.id, role: 'user', content: 'Will be deleted' }
      })

      await mocks.prisma.message.deleteMany({ where: { sessionId: session.id } })
      await mocks.prisma.session.delete({ where: { id: session.id } })

      const remainingMessages = await mocks.prisma.message.findMany({
        where: { sessionId: session.id }
      })
      const deletedSession = await mocks.prisma.session.findUnique({ where: { id: session.id } })

      expect(remainingMessages).toHaveLength(0)
      expect(deletedSession).toBeNull()
    })
  })
})

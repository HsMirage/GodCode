import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import os from 'os'

const prismaClientState = vi.hoisted(() => ({
  client: {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    model: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    agentBinding: {
      findUnique: vi.fn()
    },
    categoryBinding: {
      findUnique: vi.fn()
    },
    session: {},
    systemSetting: {
      findUnique: vi.fn()
    }
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'temp') return os.tmpdir()
      return path.join(os.tmpdir(), 'codeall-test-db')
    }),
    isPackaged: false
  }
}))

vi.mock('child_process', async (importOriginal: any) => {
  const actual = await importOriginal()
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
  const newFs = {
    ...actual,
    existsSync: vi.fn((p: string) => {
      const str = p.toString()
      if (str.includes('initdb') || str.includes('pg_ctl') || str.includes('postgres')) return true
      if (str.includes('PG_VERSION')) return false
      return actual.existsSync(p)
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn((p: string, encoding: any) => {
      if (p.includes('db-credentials.json')) {
        return JSON.stringify({
          user: 'test-user',
          password: 'test-password',
          port: 54321
        })
      }
      return actual.readFileSync(p, encoding)
    })
  }

  return {
    ...newFs,
    default: newFs
  }
})

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => prismaClientState.client)
}))

import { DatabaseService, ensureBindingSchemaCompatibility } from '@/main/services/database'

function resetPrismaClientMocks() {
  prismaClientState.client.$connect.mockReset()
  prismaClientState.client.$connect.mockResolvedValue(undefined)
  prismaClientState.client.$disconnect.mockReset()
  prismaClientState.client.$disconnect.mockResolvedValue(undefined)
  prismaClientState.client.$queryRawUnsafe.mockReset()
  prismaClientState.client.$queryRawUnsafe.mockResolvedValue([])
  prismaClientState.client.$executeRawUnsafe.mockReset()
  prismaClientState.client.$executeRawUnsafe.mockResolvedValue(undefined)
  prismaClientState.client.model.create.mockReset()
  prismaClientState.client.model.create.mockImplementation((args: any) =>
    Promise.resolve({ id: '1', ...args.data })
  )
  prismaClientState.client.model.findUnique.mockReset()
  prismaClientState.client.model.findUnique.mockResolvedValue({
    id: '1',
    modelName: 'Test Model',
    provider: 'anthropic',
    apiKey: 'test-key-12345',
    config: { temperature: 0.7 }
  })
  prismaClientState.client.model.delete.mockReset()
  prismaClientState.client.model.delete.mockResolvedValue({ id: '1' })
  prismaClientState.client.model.findMany.mockReset()
  prismaClientState.client.model.findMany.mockResolvedValue([])
  prismaClientState.client.model.update.mockReset()
  prismaClientState.client.model.update.mockResolvedValue(undefined)
  prismaClientState.client.agentBinding.findUnique.mockReset()
  prismaClientState.client.agentBinding.findUnique.mockResolvedValue(null)
  prismaClientState.client.categoryBinding.findUnique.mockReset()
  prismaClientState.client.categoryBinding.findUnique.mockResolvedValue(null)
  prismaClientState.client.systemSetting.findUnique.mockReset()
  prismaClientState.client.systemSetting.findUnique.mockResolvedValue(null)
}

describe('DatabaseService', () => {
  let db: DatabaseService

  beforeEach(() => {
    vi.clearAllMocks()
    resetPrismaClientMocks()

    // @ts-expect-error reset singleton for tests
    DatabaseService.instance = undefined
    db = DatabaseService.getInstance()
  })

  it('should be a singleton', () => {
    const db2 = DatabaseService.getInstance()
    expect(db).toBe(db2)
  })

  it('should provide Prisma client', async () => {
    await db.init()

    const client = db.getClient()
    expect(client).toBeDefined()
    expect(client.model).toBeDefined()
    expect(client.session).toBeDefined()
  })

  it('should create and retrieve a model', async () => {
    await db.init()
    const client = db.getClient()

    const model = await client.model.create({
      data: {
        modelName: 'Test Model',
        provider: 'anthropic',
        apiKey: 'test-key-12345',
        config: { temperature: 0.7 }
      }
    })

    expect(model.id).toBeDefined()
    expect(model.modelName).toBe('Test Model')
    expect(model.provider).toBe('anthropic')

    const retrieved = await client.model.findUnique({
      where: { id: model.id }
    })

    expect(retrieved).toBeDefined()
    expect(retrieved?.modelName).toBe('Test Model')

    await client.model.delete({ where: { id: model.id } })
  })

  it('should handle concurrent writes', async () => {
    await db.init()
    const client = db.getClient()

    const promises = Array.from({ length: 5 }, (_, i) =>
      client.model.create({
        data: {
          modelName: `Model ${i}`,
          provider: 'openai',
          apiKey: `key-${i}`
        }
      })
    )

    const results = await Promise.all(promises)
    expect(results).toHaveLength(5)

    for (const model of results) {
      await client.model.delete({ where: { id: model.id } })
    }
  })

  it('retries prisma connection when postgres is still starting', async () => {
    prismaClientState.client.$connect
      .mockRejectedValueOnce(new Error('database system is starting up'))
      .mockRejectedValueOnce(new Error('the database system is in recovery mode'))
      .mockResolvedValue(undefined)

    await db.init()

    expect(prismaClientState.client.$connect).toHaveBeenCalledTimes(3)
  })
})

describe('ensureBindingSchemaCompatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies additive patches and migrates openai protocol defaults', async () => {
    const fakeClient = {
      $queryRawUnsafe: vi.fn(async (sql: string) => {
        if (sql.includes("table_name = 'CategoryBinding'") && sql.includes("column_name = 'systemPrompt'")) {
          return []
        }
        if (sql.includes("table_name = 'CategoryBinding'")) {
          return [{}]
        }
        if (sql.includes("table_name = 'AgentBinding'") && sql.includes("column_name = 'systemPrompt'")) {
          return []
        }
        if (sql.includes("table_name = 'AgentBinding'")) {
          return [{}]
        }
        if (sql.includes("table_name = 'Model'") && sql.includes("column_name = 'apiKeyId'")) {
          return []
        }
        if (sql.includes("table_name = 'Model'")) {
          return [{}]
        }
        if (sql.includes("table_name = 'SystemSetting'")) {
          return []
        }
        if (sql.includes("table_name = 'SessionState'")) {
          return []
        }
        return []
      }),
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      model: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'model-openai-needs-patch',
            provider: 'openai',
            modelName: 'gpt-4.1',
            config: {}
          },
          {
            id: 'model-custom-valid',
            provider: 'custom',
            modelName: 'custom-model',
            config: { apiProtocol: 'chat/completions' }
          },
          {
            id: 'model-anthropic-skip',
            provider: 'anthropic',
            modelName: 'claude-sonnet',
            config: {}
          }
        ]),
        update: vi.fn().mockResolvedValue(undefined)
      }
    }

    await ensureBindingSchemaCompatibility(fakeClient)

    expect(fakeClient.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "CategoryBinding" ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT')
    )
    expect(fakeClient.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "AgentBinding" ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT')
    )
    expect(fakeClient.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "Model" ADD COLUMN IF NOT EXISTS "apiKeyId" TEXT')
    )
    expect(fakeClient.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "SystemSetting"')
    )
    expect(fakeClient.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS "SessionState"')
    )
    expect(fakeClient.model.update).toHaveBeenCalledTimes(1)
    expect(fakeClient.model.update).toHaveBeenCalledWith({
      where: { id: 'model-openai-needs-patch' },
      data: {
        config: {
          apiProtocol: 'responses'
        }
      }
    })
  })
})

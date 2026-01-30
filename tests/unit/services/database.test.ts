import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'temp') return os.tmpdir()
      return path.join(os.tmpdir(), `test-db-${Date.now()}`)
    }),
    isPackaged: false
  }
}))

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

vi.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    $connect = vi.fn().mockResolvedValue(undefined)
    $disconnect = vi.fn().mockResolvedValue(undefined)
    model = {
      create: vi.fn().mockImplementation(args =>
        Promise.resolve({
          id: '1',
          ...args.data
        })
      ),
      findUnique: vi.fn().mockResolvedValue({
        id: '1',
        modelName: 'Test Model',
        provider: 'anthropic',
        apiKey: 'test-key-12345',
        config: { temperature: 0.7 }
      }),
      delete: vi.fn().mockResolvedValue({ id: '1' })
    }
    session = {}
  }
}))

import { DatabaseService } from '@/main/services/database'

describe('DatabaseService', () => {
  let db: DatabaseService

  beforeEach(async () => {
    // @ts-ignore
    DatabaseService.instance = undefined

    db = DatabaseService.getInstance()
    await db.init()
  })

  it('should be a singleton', () => {
    const db2 = DatabaseService.getInstance()
    expect(db).toBe(db2)
  })

  it('should provide Prisma client', () => {
    const client = db.getClient()
    expect(client).toBeDefined()
    expect(client.model).toBeDefined()
    expect(client.session).toBeDefined()
  })

  it('should create and retrieve a model', async () => {
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
})

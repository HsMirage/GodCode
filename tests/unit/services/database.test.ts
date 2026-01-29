import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), `test-db-${Date.now()}`))
  }
}))

vi.mock('embedded-postgres', () => ({
  default: class MockEmbeddedPostgres {
    constructor() {}
    initialise = vi.fn().mockResolvedValue(undefined)
    start = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(undefined)
  }
}))

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

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseService } from '@/main/services/database'

describe('DatabaseService', () => {
  let db: DatabaseService

  beforeEach(() => {
    db = DatabaseService.getInstance()
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
        name: 'Test Model',
        provider: 'anthropic',
        apiKey: 'test-key-12345',
        config: { temperature: 0.7 }
      }
    })

    expect(model.id).toBeDefined()
    expect(model.name).toBe('Test Model')
    expect(model.provider).toBe('anthropic')

    const retrieved = await client.model.findUnique({
      where: { id: model.id }
    })

    expect(retrieved).toBeDefined()
    expect(retrieved?.name).toBe('Test Model')

    await client.model.delete({ where: { id: model.id } })
  })

  it('should handle concurrent writes', async () => {
    const client = db.getClient()

    const promises = Array.from({ length: 5 }, (_, i) =>
      client.model.create({
        data: {
          name: `Model ${i}`,
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

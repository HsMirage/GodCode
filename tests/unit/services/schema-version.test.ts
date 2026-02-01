import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SchemaVersionService } from '@/main/services/schema-version.service'

// Mock database
const mockVersions: any[] = []

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => ({
        schemaVersion: {
          create: vi.fn(async ({ data }) => {
            const version = {
              id: 'uuid-' + Date.now(),
              ...data,
              appliedAt: new Date()
            }
            mockVersions.push(version)
            return version
          }),
          findMany: vi.fn(async ({ orderBy }) => {
            return [...mockVersions].sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
          }),
          findFirst: vi.fn(async ({ orderBy }) => {
            const sorted = [...mockVersions].sort(
              (a, b) => b.appliedAt.getTime() - a.appliedAt.getTime()
            )
            return sorted[0] || null
          }),
          count: vi.fn(async ({ where }) => {
            return mockVersions.filter(v => v.version === where.version).length
          }),
          upsert: vi.fn(async ({ where, create, update }) => {
            const existing = mockVersions.find(v => v.version === where.version)
            if (existing) {
              Object.assign(existing, update, { appliedAt: new Date() })
              return existing
            } else {
              const newVersion = {
                id: 'uuid-' + Date.now(),
                ...create,
                appliedAt: new Date()
              }
              mockVersions.push(newVersion)
              return newVersion
            }
          })
        }
      })
    })
  }
}))

describe('SchemaVersionService', () => {
  let service: SchemaVersionService

  beforeEach(() => {
    mockVersions.length = 0 // Clear mock data
    // Reset singleton instance if possible, but for this test we can just reuse since state is in mock
    service = SchemaVersionService.getInstance()
  })

  it('should implement singleton pattern', () => {
    const instance1 = SchemaVersionService.getInstance()
    const instance2 = SchemaVersionService.getInstance()
    expect(instance1).toBe(instance2)
  })

  describe('getCurrentVersion', () => {
    it('should return null when no versions exist', async () => {
      const version = await service.getCurrentVersion()
      expect(version).toBeNull()
    })

    it('should return most recent version', async () => {
      mockVersions.push(
        { version: '1.0.0', appliedAt: new Date('2025-01-01') },
        { version: '1.0.1', appliedAt: new Date('2025-01-02') }
      )
      const version = await service.getCurrentVersion()
      expect(version).toBe('1.0.1')
    })
  })

  describe('setVersion', () => {
    it('should create new version record', async () => {
      await service.setVersion('1.0.0', 'Initial version')
      expect(mockVersions).toHaveLength(1)
      expect(mockVersions[0].version).toBe('1.0.0')
      expect(mockVersions[0].description).toBe('Initial version')
    })

    it('should update existing version (upsert behavior)', async () => {
      await service.setVersion('1.0.0', 'Initial')
      const firstDate = mockVersions[0].appliedAt

      // Wait a bit to ensure timestamp difference
      await new Promise(r => setTimeout(r, 10))

      await service.setVersion('1.0.0', 'Updated description')

      expect(mockVersions).toHaveLength(1)
      expect(mockVersions[0].description).toBe('Updated description')
      expect(mockVersions[0].appliedAt.getTime()).toBeGreaterThan(firstDate.getTime())
    })

    it('should handle optional description', async () => {
      await service.setVersion('1.0.0')
      expect(mockVersions[0].description).toBeUndefined()
    })
  })

  describe('getVersionHistory', () => {
    it('should return empty array when no versions', async () => {
      const history = await service.getVersionHistory()
      expect(history).toEqual([])
    })

    it('should return all versions ordered by date DESC', async () => {
      mockVersions.push(
        { version: '1.0.0', description: 'v1', appliedAt: new Date('2025-01-01') },
        { version: '1.0.1', description: 'v2', appliedAt: new Date('2025-01-02') },
        { version: '0.9.0', description: 'beta', appliedAt: new Date('2024-12-31') }
      )

      const history = await service.getVersionHistory()
      expect(history).toHaveLength(3)
      expect(history[0].version).toBe('1.0.1')
      expect(history[1].version).toBe('1.0.0')
      expect(history[2].version).toBe('0.9.0')
    })
  })

  describe('hasVersion', () => {
    it('should return false for non-existent version', async () => {
      const exists = await service.hasVersion('9.9.9')
      expect(exists).toBe(false)
    })

    it('should return true for existing version', async () => {
      mockVersions.push({ version: '1.0.0', appliedAt: new Date() })
      const exists = await service.hasVersion('1.0.0')
      expect(exists).toBe(true)
    })
  })
})

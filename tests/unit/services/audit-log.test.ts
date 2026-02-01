import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditLogService } from '../../../src/main/services/audit-log.service'
import { v4 as uuid } from 'uuid'

// Mock database
const mockAuditLogs: any[] = []

const mockPrisma = {
  auditLog: {
    create: vi.fn(async ({ data }) => {
      const entry = {
        id: uuid(),
        ...data,
        createdAt: new Date(),
        success: data.success ?? true
      }
      mockAuditLogs.push(entry)
      return entry
    }),
    findMany: vi.fn(async ({ where, orderBy, take, skip }) => {
      let results = [...mockAuditLogs]

      // Filter
      if (where) {
        if (where.action) results = results.filter(l => l.action === where.action)
        if (where.entityType) results = results.filter(l => l.entityType === where.entityType)
        if (where.entityId) results = results.filter(l => l.entityId === where.entityId)
        if (where.sessionId) results = results.filter(l => l.sessionId === where.sessionId)
        if (where.success !== undefined) results = results.filter(l => l.success === where.success)

        if (where.createdAt) {
          if (where.createdAt.gte) {
            results = results.filter(l => l.createdAt >= where.createdAt.gte)
          }
          if (where.createdAt.lte) {
            results = results.filter(l => l.createdAt <= where.createdAt.lte)
          }
        }
      }

      // Sort
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      // Pagination
      const start = skip || 0
      const end = start + (take || 100)
      return results.slice(start, end)
    }),
    count: vi.fn(async ({ where }) => {
      let results = [...mockAuditLogs]
      if (where) {
        if (where.action) results = results.filter(l => l.action === where.action)
        if (where.entityType) results = results.filter(l => l.entityType === where.entityType)
        if (where.entityId) results = results.filter(l => l.entityId === where.entityId)
        if (where.sessionId) results = results.filter(l => l.sessionId === where.sessionId)
        if (where.success !== undefined) results = results.filter(l => l.success === where.success)
      }
      return results.length
    })
  }
}

vi.mock('../../../src/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mockPrisma
    })
  }
}))

describe('AuditLogService', () => {
  let service: AuditLogService

  beforeEach(() => {
    mockAuditLogs.length = 0 // Clear mock data
    vi.clearAllMocks()
    service = AuditLogService.getInstance()
  })

  it('should create singleton instance', () => {
    const instance1 = AuditLogService.getInstance()
    const instance2 = AuditLogService.getInstance()
    expect(instance1).toBe(instance2)
  })

  it('should log successful operation', async () => {
    const entry = await service.log({
      action: 'create',
      entityType: 'space',
      entityId: 'space-1',
      userId: 'user-1'
    })

    expect(entry.action).toBe('create')
    expect(entry.entityType).toBe('space')
    expect(entry.success).toBe(true)
    expect(mockPrisma.auditLog.create).toHaveBeenCalled()
  })

  it('should log failed operation with error message', async () => {
    const entry = await service.log({
      action: 'delete',
      entityType: 'task',
      success: false,
      errorMsg: 'Permission denied'
    })

    expect(entry.success).toBe(false)
    expect(entry.errorMsg).toBe('Permission denied')
  })

  it('should query logs by action', async () => {
    await service.log({ action: 'create', entityType: 'space' })
    await service.log({ action: 'update', entityType: 'space' })
    await service.log({ action: 'create', entityType: 'session' })

    const logs = await service.queryLogs({ action: 'create' })
    expect(logs).toHaveLength(2)
    expect(logs.every(l => l.action === 'create')).toBe(true)
  })

  it('should query logs by entity type and ID', async () => {
    await service.log({ action: 'update', entityType: 'space', entityId: 's1' })
    await service.log({ action: 'update', entityType: 'space', entityId: 's2' })

    const logs = await service.getLogsByEntity('space', 's1')
    expect(logs).toHaveLength(1)
    expect(logs[0].entityId).toBe('s1')
  })

  it('should query logs by session', async () => {
    await service.log({ action: 'chat', entityType: 'message', sessionId: 'sess-1' })
    await service.log({ action: 'chat', entityType: 'message', sessionId: 'sess-2' })

    const logs = await service.getLogsBySession('sess-1')
    expect(logs).toHaveLength(1)
    expect(logs[0].sessionId).toBe('sess-1')
  })

  it('should query logs with date range', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000)
    const tomorrow = new Date(now.getTime() + 86400000)

    const entry1 = await service.log({ action: 'test1', entityType: 'test' })
    // Manually adjust time for testing
    const logs = mockAuditLogs
    logs[0].createdAt = yesterday

    const entry2 = await service.log({ action: 'test2', entityType: 'test' })
    logs[1].createdAt = now

    const results = await service.queryLogs({
      startDate: new Date(now.getTime() - 1000),
      endDate: tomorrow
    })

    expect(results).toHaveLength(1)
    expect(results[0].action).toBe('test2')
  })

  it('should get recent logs with limit', async () => {
    for (let i = 0; i < 5; i++) {
      await service.log({ action: `action-${i}`, entityType: 'test' })
    }

    const logs = await service.getRecentLogs(3)
    expect(logs).toHaveLength(3)
  })

  it('should count logs matching filter', async () => {
    await service.log({ action: 'create', entityType: 'space' })
    await service.log({ action: 'create', entityType: 'space' })
    await service.log({ action: 'delete', entityType: 'space' })

    const count = await service.countLogs({ action: 'create' })
    expect(count).toBe(2)
  })

  it('should get failed logs only', async () => {
    await service.log({ action: 'op1', entityType: 'test', success: true })
    await service.log({ action: 'op2', entityType: 'test', success: false })

    const failed = await service.getFailedLogs()
    expect(failed).toHaveLength(1)
    expect(failed[0].success).toBe(false)
  })

  it('should support pagination (limit + offset)', async () => {
    for (let i = 0; i < 10; i++) {
      await service.log({ action: `action-${i}`, entityType: 'test' })
    }

    const page1 = await service.queryLogs({}, { limit: 5, offset: 0 })
    expect(page1).toHaveLength(5)

    const page2 = await service.queryLogs({}, { limit: 5, offset: 5 })
    expect(page2).toHaveLength(5)

    // Check they are different items
    const ids1 = page1.map(l => l.action)
    const ids2 = page2.map(l => l.action)
    expect(ids1.some(id => ids2.includes(id))).toBe(false)
  })

  it('should store metadata as JSON', async () => {
    const metadata = { foo: 'bar', nested: { val: 123 } }
    const entry = await service.log({
      action: 'meta-test',
      entityType: 'test',
      metadata
    })

    expect(entry.metadata).toEqual(metadata)
  })
})

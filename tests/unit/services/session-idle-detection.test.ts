import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionIdleDetectionService } from '@/main/services/session-idle-detection.service'

// Mock state
let mockSessions: any[] = []

// Mock DatabaseService
vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => ({
        session: {
          update: vi.fn(async ({ where, data }) => {
            const index = mockSessions.findIndex(s => s.id === where.id)
            if (index === -1) throw new Error('Session not found')

            const updatedSession = {
              ...mockSessions[index],
              ...data,
              updatedAt: data.updatedAt || new Date()
            }
            mockSessions[index] = updatedSession
            return updatedSession
          }),
          findUnique: vi.fn(async ({ where }) => {
            return mockSessions.find(s => s.id === where.id) || null
          }),
          findMany: vi.fn(async () => [...mockSessions])
        }
      })
    })
  }
}))

describe('SessionIdleDetectionService', () => {
  beforeEach(() => {
    mockSessions = []
    SessionIdleDetectionService.getInstance().setIdleThreshold(5 * 60 * 1000)
  })

  it('should be a singleton', () => {
    const s1 = SessionIdleDetectionService.getInstance()
    const s2 = SessionIdleDetectionService.getInstance()
    expect(s1).toBe(s2)
  })

  it('should get last activity', async () => {
    const now = new Date()
    mockSessions.push({ id: 's1', updatedAt: now })

    const activity = await SessionIdleDetectionService.getInstance().getLastActivity('s1')
    expect(activity).toEqual(now)
  })

  it('should return null for non-existent session last activity', async () => {
    const activity = await SessionIdleDetectionService.getInstance().getLastActivity('non-existent')
    expect(activity).toBeNull()
  })

  it('should update activity', async () => {
    const oldTime = new Date('2020-01-01')
    mockSessions.push({ id: 's1', updatedAt: oldTime })

    await SessionIdleDetectionService.getInstance().updateActivity('s1')

    const newTime = mockSessions[0].updatedAt
    expect(newTime.getTime()).toBeGreaterThan(oldTime.getTime())
  })

  it('should calculate idle duration', async () => {
    const now = new Date()
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
    mockSessions.push({ id: 's1', updatedAt: tenMinutesAgo })

    const duration = await SessionIdleDetectionService.getInstance().getIdleDuration('s1')
    // Allow small delta
    expect(duration).toBeGreaterThanOrEqual(10 * 60 * 1000)
    expect(duration).toBeLessThan(10 * 60 * 1000 + 1000)
  })

  it('should return 0 duration for missing session', async () => {
    const duration = await SessionIdleDetectionService.getInstance().getIdleDuration('missing')
    expect(duration).toBe(0)
  })

  it('should detect idle session based on default threshold', async () => {
    const now = new Date()
    // 6 minutes ago > 5 minutes default
    const idleTime = new Date(now.getTime() - 6 * 60 * 1000)
    mockSessions.push({ id: 's1', updatedAt: idleTime })

    const isIdle = await SessionIdleDetectionService.getInstance().isSessionIdle('s1')
    expect(isIdle).toBe(true)
  })

  it('should detect active session based on default threshold', async () => {
    const now = new Date()
    // 4 minutes ago < 5 minutes default
    const activeTime = new Date(now.getTime() - 4 * 60 * 1000)
    mockSessions.push({ id: 's1', updatedAt: activeTime })

    const isIdle = await SessionIdleDetectionService.getInstance().isSessionIdle('s1')
    expect(isIdle).toBe(false)
  })

  it('should respect custom threshold in isSessionIdle', async () => {
    const now = new Date()
    // 4 minutes ago
    const time = new Date(now.getTime() - 4 * 60 * 1000)
    mockSessions.push({ id: 's1', updatedAt: time })

    // Custom threshold 3 minutes -> should be idle
    const isIdle = await SessionIdleDetectionService.getInstance().isSessionIdle(
      's1',
      3 * 60 * 1000
    )
    expect(isIdle).toBe(true)
  })

  it('should get idle sessions', async () => {
    const now = new Date()
    mockSessions.push(
      { id: 'idle1', updatedAt: new Date(now.getTime() - 10 * 60 * 1000) },
      { id: 'active1', updatedAt: new Date(now.getTime() - 1 * 60 * 1000) }
    )

    const idle = await SessionIdleDetectionService.getInstance().getIdleSessions()
    expect(idle).toHaveLength(1)
    expect(idle[0].sessionId).toBe('idle1')
  })

  it('should get active sessions', async () => {
    const now = new Date()
    mockSessions.push(
      { id: 'idle1', updatedAt: new Date(now.getTime() - 10 * 60 * 1000) },
      { id: 'active1', updatedAt: new Date(now.getTime() - 1 * 60 * 1000) }
    )

    const active = await SessionIdleDetectionService.getInstance().getActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0].sessionId).toBe('active1')
  })

  it('should configure idle threshold', () => {
    const service = SessionIdleDetectionService.getInstance()
    service.setIdleThreshold(1000)
    expect(service.getIdleThreshold()).toBe(1000)
  })

  it('should throw on negative threshold', () => {
    expect(() => SessionIdleDetectionService.getInstance().setIdleThreshold(-1)).toThrow()
  })

  it('should get session stats', async () => {
    const now = new Date()
    mockSessions.push(
      { id: 'idle1', updatedAt: new Date(now.getTime() - 10 * 60 * 1000) }, // Idle (>5m)
      { id: 'active1', updatedAt: new Date(now.getTime() - 1 * 60 * 1000) }, // Active (<5m)
      { id: 'active2', updatedAt: new Date(now.getTime() - 2 * 60 * 1000) } // Active (<5m)
    )

    const stats = await SessionIdleDetectionService.getInstance().getSessionStats()
    expect(stats).toEqual({
      total: 3,
      idle: 1,
      active: 2
    })
  })
})

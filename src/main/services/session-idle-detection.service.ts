import { DatabaseService } from './database'

export interface SessionActivity {
  sessionId: string
  lastActivity: Date
  idleDuration: number // milliseconds
  isIdle: boolean
}

export interface IdleDetectionConfig {
  idleThresholdMs: number // Default: 5 minutes (300000ms)
}

export class SessionIdleDetectionService {
  private static instance: SessionIdleDetectionService | null = null
  private config: IdleDetectionConfig

  private constructor() {
    this.config = {
      idleThresholdMs: 5 * 60 * 1000 // 5 minutes default
    }
  }

  static getInstance(): SessionIdleDetectionService {
    if (!SessionIdleDetectionService.instance) {
      SessionIdleDetectionService.instance = new SessionIdleDetectionService()
    }
    return SessionIdleDetectionService.instance
  }

  // Activity tracking
  async updateActivity(sessionId: string): Promise<void> {
    const db = DatabaseService.getInstance().getClient()

    // Touching session.updatedAt automatically updates timestamp
    await db.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    })
  }

  async getLastActivity(sessionId: string): Promise<Date | null> {
    const db = DatabaseService.getInstance().getClient()

    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { updatedAt: true }
    })

    return session?.updatedAt || null
  }

  async getIdleDuration(sessionId: string): Promise<number> {
    const lastActivity = await this.getLastActivity(sessionId)

    if (!lastActivity) {
      return 0
    }

    const now = new Date()
    return now.getTime() - lastActivity.getTime()
  }

  // Idle detection
  async isSessionIdle(sessionId: string, thresholdMs?: number): Promise<boolean> {
    const threshold = thresholdMs || this.config.idleThresholdMs
    const idleDuration = await this.getIdleDuration(sessionId)

    return idleDuration >= threshold
  }

  async getIdleSessions(thresholdMs?: number): Promise<SessionActivity[]> {
    const db = DatabaseService.getInstance().getClient()
    const threshold = thresholdMs || this.config.idleThresholdMs

    const sessions = await db.session.findMany({
      select: {
        id: true,
        updatedAt: true
      }
    })

    const now = new Date()
    const activities: SessionActivity[] = []

    for (const session of sessions) {
      const idleDuration = now.getTime() - session.updatedAt.getTime()
      const isIdle = idleDuration >= threshold

      if (isIdle) {
        activities.push({
          sessionId: session.id,
          lastActivity: session.updatedAt,
          idleDuration,
          isIdle
        })
      }
    }

    return activities
  }

  async getActiveSessions(thresholdMs?: number): Promise<SessionActivity[]> {
    const db = DatabaseService.getInstance().getClient()
    const threshold = thresholdMs || this.config.idleThresholdMs

    const sessions = await db.session.findMany({
      select: {
        id: true,
        updatedAt: true
      }
    })

    const now = new Date()
    const activities: SessionActivity[] = []

    for (const session of sessions) {
      const idleDuration = now.getTime() - session.updatedAt.getTime()
      const isIdle = idleDuration >= threshold

      if (!isIdle) {
        activities.push({
          sessionId: session.id,
          lastActivity: session.updatedAt,
          idleDuration,
          isIdle
        })
      }
    }

    return activities
  }

  // Configuration
  setIdleThreshold(ms: number): void {
    if (ms < 0) {
      throw new Error('Idle threshold must be non-negative')
    }
    this.config.idleThresholdMs = ms
  }

  getIdleThreshold(): number {
    return this.config.idleThresholdMs
  }

  // Statistics
  async getSessionStats(): Promise<{ total: number; idle: number; active: number }> {
    const db = DatabaseService.getInstance().getClient()
    const sessions = await db.session.findMany({
      select: {
        updatedAt: true
      }
    })

    const now = new Date()
    const threshold = this.config.idleThresholdMs
    let idleCount = 0
    let activeCount = 0

    for (const session of sessions) {
      const idleDuration = now.getTime() - session.updatedAt.getTime()
      if (idleDuration >= threshold) {
        idleCount++
      } else {
        activeCount++
      }
    }

    return {
      total: sessions.length,
      idle: idleCount,
      active: activeCount
    }
  }
}

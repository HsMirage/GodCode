import { DatabaseService } from './database'

export interface AuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string | null
  userId: string | null
  sessionId: string | null
  ipAddress: string | null
  metadata: any
  success: boolean
  errorMsg: string | null
  createdAt: Date
}

export interface CreateAuditLogInput {
  action: string
  entityType: string
  entityId?: string
  userId?: string
  sessionId?: string
  ipAddress?: string
  metadata?: any
  success?: boolean
  errorMsg?: string
}

export interface AuditLogFilter {
  action?: string
  entityType?: string
  entityId?: string
  sessionId?: string
  success?: boolean
  startDate?: Date
  endDate?: Date
}

export class AuditLogService {
  private static instance: AuditLogService | null = null

  private constructor() {}

  static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService()
    }
    return AuditLogService.instance
  }

  /**
   * Log an operation
   */
  async log(input: CreateAuditLogInput): Promise<AuditLogEntry> {
    const db = DatabaseService.getInstance().getClient()
    const entry = await db.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        userId: input.userId || null,
        sessionId: input.sessionId || null,
        ipAddress: input.ipAddress || null,
        metadata: input.metadata || null,
        success: input.success !== false, // default true
        errorMsg: input.errorMsg || null
      }
    })
    return entry
  }

  /**
   * Query logs with filters
   */
  async queryLogs(
    filter: AuditLogFilter = {},
    options: { limit?: number; offset?: number } = {}
  ): Promise<AuditLogEntry[]> {
    const db = DatabaseService.getInstance().getClient()

    const where: any = {}
    if (filter.action) where.action = filter.action
    if (filter.entityType) where.entityType = filter.entityType
    if (filter.entityId) where.entityId = filter.entityId
    if (filter.sessionId) where.sessionId = filter.sessionId
    if (filter.success !== undefined) where.success = filter.success
    if (filter.startDate || filter.endDate) {
      where.createdAt = {}
      if (filter.startDate) where.createdAt.gte = filter.startDate
      if (filter.endDate) where.createdAt.lte = filter.endDate
    }

    return await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100,
      skip: options.offset || 0
    })
  }

  /**
   * Get logs by entity
   */
  async getLogsByEntity(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.queryLogs({ entityType, entityId })
  }

  /**
   * Get logs by session
   */
  async getLogsBySession(sessionId: string): Promise<AuditLogEntry[]> {
    return this.queryLogs({ sessionId })
  }

  /**
   * Get recent logs
   */
  async getRecentLogs(limit: number = 50): Promise<AuditLogEntry[]> {
    const db = DatabaseService.getInstance().getClient()
    return await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  /**
   * Get count of logs matching filter
   */
  async countLogs(filter: AuditLogFilter = {}): Promise<number> {
    const db = DatabaseService.getInstance().getClient()

    const where: any = {}
    if (filter.action) where.action = filter.action
    if (filter.entityType) where.entityType = filter.entityType
    if (filter.entityId) where.entityId = filter.entityId
    if (filter.sessionId) where.sessionId = filter.sessionId
    if (filter.success !== undefined) where.success = filter.success
    if (filter.startDate || filter.endDate) {
      where.createdAt = {}
      if (filter.startDate) where.createdAt.gte = filter.startDate
      if (filter.endDate) where.createdAt.lte = filter.endDate
    }

    return await db.auditLog.count({ where })
  }

  /**
   * Get failed operations
   */
  async getFailedLogs(limit: number = 50): Promise<AuditLogEntry[]> {
    return this.queryLogs({ success: false }, { limit })
  }
}

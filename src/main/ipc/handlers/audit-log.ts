import { ipcMain } from 'electron'
import { AuditLogService } from '../../services/audit-log.service'

export function registerAuditLogHandlers() {
  const auditLogService = AuditLogService.getInstance()

  ipcMain.handle('audit-log:query', async (_, filter: any, options: any) => {
    return await auditLogService.queryLogs(filter, options)
  })

  ipcMain.handle('audit-log:get-by-entity', async (_, entityType: string, entityId: string) => {
    return await auditLogService.getLogsByEntity(entityType, entityId)
  })

  ipcMain.handle('audit-log:get-by-session', async (_, sessionId: string) => {
    return await auditLogService.getLogsBySession(sessionId)
  })

  ipcMain.handle('audit-log:get-recent', async (_, limit: number) => {
    return await auditLogService.getRecentLogs(limit)
  })

  ipcMain.handle('audit-log:count', async (_, filter: any) => {
    return await auditLogService.countLogs(filter)
  })

  ipcMain.handle('audit-log:get-failed', async (_, limit: number) => {
    return await auditLogService.getFailedLogs(limit)
  })
}

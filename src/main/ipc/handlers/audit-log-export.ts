import { ipcMain, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { AuditLogService } from '../../services/audit-log.service'
import { LoggerService } from '../../services/logger'

export function registerAuditLogExportHandlers() {
  const auditLogService = AuditLogService.getInstance()
  const logger = LoggerService.getInstance().getLogger()

  ipcMain.handle('audit-log:export', async (_, format: 'json' | 'csv', filter: any) => {
    try {
      // 1. Get logs based on filter
      const logs = await auditLogService.queryLogs(filter, { limit: 10000 }) // Limit export to 10k for now

      // 2. Show save dialog
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export Audit Logs',
        defaultPath: `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`,
        filters: [{ name: format === 'json' ? 'JSON' : 'CSV', extensions: [format] }]
      })

      if (!filePath) return { success: false, reason: 'cancelled' }

      // 3. Format content
      let content = ''
      if (format === 'json') {
        content = JSON.stringify(logs, null, 2)
      } else {
        // Simple CSV conversion
        const headers = [
          'id',
          'action',
          'entityType',
          'entityId',
          'userId',
          'sessionId',
          'success',
          'createdAt',
          'errorMsg'
        ]
        const rows = logs.map(log => {
          return headers
            .map(header => {
              const val = (log as any)[header]
              if (val === null || val === undefined) return ''
              if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`
              if (val instanceof Date) return val.toISOString()
              return val
            })
            .join(',')
        })
        content = [headers.join(','), ...rows].join('\n')
      }

      console.log('Writing to file:', filePath, 'Content length:', content.length)

      // 4. Write to file
      await writeFile(filePath, content, 'utf-8')

      return { success: true, filePath, count: logs.length }
    } catch (error) {
      logger.error('Failed to export audit logs', { error })
      throw error
    }
  })
}

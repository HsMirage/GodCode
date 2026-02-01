import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerAuditLogHandlers } from '../../../src/main/ipc/handlers/audit-log'
import { registerAuditLogExportHandlers } from '../../../src/main/ipc/handlers/audit-log-export'
import { ipcMain, dialog } from 'electron'
import { AuditLogService } from '../../../src/main/services/audit-log.service'

// Mock dependencies
const mockWriteFile = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  dialog: {
    showSaveDialog: vi.fn()
  }
}))

vi.mock('fs/promises', () => ({
  writeFile: (...args: any[]) => mockWriteFile(...args),
  default: {
    writeFile: (...args: any[]) => mockWriteFile(...args)
  }
}))

vi.mock('../../../src/main/services/audit-log.service', () => ({
  AuditLogService: {
    getInstance: vi.fn().mockReturnValue({
      queryLogs: vi.fn(),
      getLogsByEntity: vi.fn(),
      getLogsBySession: vi.fn(),
      getRecentLogs: vi.fn(),
      countLogs: vi.fn(),
      getFailedLogs: vi.fn()
    })
  }
}))

vi.mock('../../../src/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
      })
    })
  }
}))

describe('Audit Log IPC Handlers', () => {
  let mockAuditLogService: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditLogService = AuditLogService.getInstance()
  })

  it('should register query handlers', () => {
    registerAuditLogHandlers()

    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:query', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:get-by-entity', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:get-by-session', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:get-recent', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:count', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:get-failed', expect.any(Function))
  })

  it('should call service methods when handlers are invoked', async () => {
    registerAuditLogHandlers()

    // Get the handler function for 'audit-log:query'
    const queryHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any) => call[0] === 'audit-log:query'
    )[1]

    await queryHandler({}, { action: 'create' }, { limit: 10 })
    expect(mockAuditLogService.queryLogs).toHaveBeenCalledWith({ action: 'create' }, { limit: 10 })
  })

  it('should register export handler', () => {
    registerAuditLogExportHandlers()
    expect(ipcMain.handle).toHaveBeenCalledWith('audit-log:export', expect.any(Function))
  })

  it('should handle JSON export', async () => {
    registerAuditLogExportHandlers()

    const logs = [{ id: '1', action: 'test' }]
    mockAuditLogService.queryLogs.mockResolvedValue(logs)
    ;(dialog.showSaveDialog as any).mockResolvedValue({ filePath: '/tmp/logs.json' })

    const exportHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any) => call[0] === 'audit-log:export'
    )[1]

    const result = await exportHandler({}, 'json', {})

    expect(mockAuditLogService.queryLogs).toHaveBeenCalled()
    expect(dialog.showSaveDialog).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/logs.json',
      JSON.stringify(logs, null, 2),
      'utf-8'
    )
    expect(result).toEqual({ success: true, filePath: '/tmp/logs.json', count: 1 })
  })

  it('should handle CSV export', async () => {
    registerAuditLogExportHandlers()

    const logs = [
      {
        id: '1',
        action: 'test',
        entityType: 'space',
        entityId: null,
        userId: null,
        sessionId: null,
        success: true,
        createdAt: new Date('2023-01-01'),
        errorMsg: null
      }
    ]
    mockAuditLogService.queryLogs.mockResolvedValue(logs)
    ;(dialog.showSaveDialog as any).mockResolvedValue({ filePath: '/tmp/logs.csv' })

    const exportHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any) => call[0] === 'audit-log:export'
    )[1]

    await exportHandler({}, 'csv', {})

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/logs.csv',
      expect.stringContaining('id,action,entityType'),
      'utf-8'
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/logs.csv',
      expect.stringContaining('"1","test","space"'),
      'utf-8'
    )
  })

  it('should handle export cancellation', async () => {
    registerAuditLogExportHandlers()
    mockAuditLogService.queryLogs.mockResolvedValue([])
    ;(dialog.showSaveDialog as any).mockResolvedValue({ filePath: null })

    const exportHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any) => call[0] === 'audit-log:export'
    )[1]

    const result = await exportHandler({}, 'json', {})

    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, reason: 'cancelled' })
  })
})

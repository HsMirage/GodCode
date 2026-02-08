import { ipcMain } from 'electron'
import { BackupService } from '../../services/backup.service'

export function registerBackupHandlers() {
  const backupService = BackupService.getInstance()

  ipcMain.handle('backup:list', async () => {
    return await backupService.listBackups()
  })

  ipcMain.handle('backup:create', async (_, name?: string) => {
    return await backupService.createBackup(name)
  })

  ipcMain.handle('backup:delete', async (_, filename: string) => {
    return await backupService.deleteBackup(filename)
  })

  ipcMain.handle('restore:from-file', async (_, filePath: string) => {
    return await backupService.restoreFromFile(filePath)
  })
}

import { ipcMain } from 'electron'
import { handlePing } from './handlers/ping'

export function registerIpcHandlers(): void {
  ipcMain.handle('ping', handlePing)
}

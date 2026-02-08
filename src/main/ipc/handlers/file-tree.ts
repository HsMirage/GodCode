import { ipcMain, type BrowserWindow } from 'electron'
import { fileTreeService } from '../../services/file-tree.service'

export function registerFileTreeHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle('file-tree:get', async (_event, rootDir: string, relativePath: string = '.') => {
    try {
      const tree = await fileTreeService.getTree(rootDir, relativePath)
      return { success: true, data: tree }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('file-tree:watch', async (_event, watchId: string, rootDir: string) => {
    try {
      fileTreeService.watchDirectory(watchId, rootDir)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('file-tree:unwatch', async (_event, watchId: string) => {
    try {
      await fileTreeService.unwatchDirectory(watchId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  fileTreeService.on('change', (watchId, event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-tree:changed', watchId, event)
    }
  })
}

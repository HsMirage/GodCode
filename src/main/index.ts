import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { DatabaseService } from './services/database'
import { logger } from '../shared/logger'

process.on('uncaughtException', error => {
  console.error('[Main] Uncaught Exception:', error)
  logger.error('[Main] Uncaught Exception:', error)
})

process.on('unhandledRejection', reason => {
  console.error('[Main] Unhandled Rejection:', reason)
  logger.error('[Main] Unhandled Rejection:', reason)
})

function createWindow() {
  logger.info('Creating main window')
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  logger.info('Application starting')
  const db = DatabaseService.getInstance()
  logger.info('Database initialization started')
  await db.init()
  logger.info('Database initialization completed')

  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('will-quit', async event => {
  logger.info('[Main] Resource cleanup started')

  // Clean up BrowserViews
  try {
    const { browserViewManager } = await import('./services/browser-view.service')
    browserViewManager.destroyAll()
    logger.info('[Main] BrowserViews destroyed')
  } catch (error) {
    logger.error('[Main] Failed to destroy BrowserViews:', error)
  }

  // Clean up Database
  try {
    const db = DatabaseService.getInstance()
    await db.shutdown()
    logger.info('[Main] Database shutdown complete')
  } catch (error) {
    logger.error('[Main] Failed to shutdown database:', error)
  }

  logger.info('[Main] Resource cleanup complete')
})

app.on('quit', () => {
  logger.info('Application quit')
})

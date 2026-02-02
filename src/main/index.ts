import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'path'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { registerIpcHandlers } from './ipc'
import { DatabaseService } from './services/database'
import { processCleanupService } from './services/process-cleanup.service'
import { browserViewManager } from './services/browser-view.service'
import { logger } from '../shared/logger'

process.on('uncaughtException', error => {
  console.error('[Main] Uncaught Exception:', error)
  logger.error('[Main] Uncaught Exception:', error)
})

process.on('unhandledRejection', reason => {
  console.error('[Main] Unhandled Rejection:', reason)
  logger.error('[Main] Unhandled Rejection:', reason)
})

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    logger.info('Application starting')

    mainWindow = createWindow()
    registerIpcHandlers(mainWindow)
    if (mainWindow) initAutoUpdater(mainWindow)

    // Skip database initialization in E2E test environment
    if (process.env.CODEALL_E2E_TEST === '1') {
      logger.info('[E2E] Skipping database initialization in test environment')
    } else {
      try {
        const db = DatabaseService.getInstance()
        logger.info('Database initialization started')
        await db.init()
        logger.info('Database initialization completed')
      } catch (error) {
        logger.error('Database initialization failed:', error)
        const locale = app.getLocale()
        const isChinese = locale.startsWith('zh')

        const logDir = path.join(app.getPath('userData'), 'logs')
        const logPathHint = app.isPackaged
          ? `${logDir}/app-YYYY-MM-DD.log`
          : `Console (开发模式，日志输出到控制台)`

        const title = isChinese ? '数据库初始化失败' : 'Database Initialization Failed'

        const message = isChinese
          ? `CodeAll 无法初始化数据库。\n\n` +
            `可能原因：\n` +
            `1. 杀毒软件拦截\n` +
            `2. 磁盘空间不足\n` +
            `3. 权限问题\n\n` +
            `建议解决方案：\n` +
            `1. 临时禁用杀毒软件后重试\n` +
            `2. 检查磁盘空间\n` +
            `3. 查看日志获取详细信息：${logPathHint}\n\n` +
            `错误详情：${error instanceof Error ? error.message : String(error)}`
          : `CodeAll failed to initialize the database.\n\n` +
            `Possible causes:\n` +
            `1. Antivirus software blocking\n` +
            `2. Insufficient disk space\n` +
            `3. Permission issues\n\n` +
            `Suggested solutions:\n` +
            `1. Temporarily disable antivirus and retry\n` +
            `2. Check available disk space\n` +
            `3. Check logs for details: ${logPathHint}\n\n` +
            `Error details: ${error instanceof Error ? error.message : String(error)}`

        dialog.showErrorBox(title, message)
      }
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })

  app.on('will-quit', async _event => {
    logger.info('[Main] Resource cleanup started')

    try {
      await processCleanupService.cleanupAll()
      logger.info('[Main] Process cleanup complete')
    } catch (error) {
      logger.error('[Main] Failed to cleanup processes:', error)
    }

    try {
      browserViewManager.destroyAll()
      logger.info('[Main] BrowserViews destroyed')
    } catch (error) {
      logger.error('[Main] Failed to destroy BrowserViews:', error)
    }

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
}

function createWindow() {
  logger.info('Creating main window')
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Disable sandbox to allow file:// module loading in production
      sandbox: false
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

function initAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = false

  // IPC Handlers
  ipcMain.handle('updater:check-for-updates', () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:download-update', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:quit-and-install', () => autoUpdater.quitAndInstall())

  autoUpdater.on('checking-for-update', () => {
    logger.info('[Updater] Checking for update...')
    win.webContents.send('updater:checking-for-update')
  })

  autoUpdater.on('update-available', info => {
    logger.info('[Updater] Update available:', info)
    win.webContents.send('updater:update-available', info)
  })

  autoUpdater.on('update-not-available', info => {
    logger.info('[Updater] Update not available:', info)
    win.webContents.send('updater:update-not-available', info)
  })

  autoUpdater.on('error', err => {
    logger.error('[Updater] Error in auto-updater:', err)
    win.webContents.send('updater:error', err.message)
  })

  autoUpdater.on('download-progress', progressObj => {
    logger.info(`[Updater] Download speed: ${progressObj.bytesPerSecond} - ${progressObj.percent}%`)
    win.webContents.send('updater:download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', info => {
    logger.info('[Updater] Update downloaded:', info)
    win.webContents.send('updater:update-downloaded', info)
  })

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(err => {
      logger.warn('[Updater] Failed to check for updates:', err.message)
    })
  }
}

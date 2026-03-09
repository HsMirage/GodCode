import { app, BrowserWindow, dialog, Menu } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { DatabaseService } from './services/database'
import { BindingService } from './services/binding.service'
import { processCleanupService } from './services/process-cleanup.service'
import { browserViewManager } from './services/browser-view.service'
import { initEventBridge } from './services/event-bridge.service'
import { sessionContinuityService } from './services/session-continuity.service'
import { sessionStateRecoveryService } from './services/session-state-recovery.service'
import { hookManager } from './services/hooks/manager'
import { initializeDefaultHooks, restorePersistedHookGovernance } from './services/hooks'
import { logger } from '../shared/logger'
import {
  GODCODE_ALLOW_CHROMIUM_NOISE_ENV,
  LEGACY_CODEALL_ALLOW_CHROMIUM_NOISE_ENV
} from '../shared/brand-compat'
import { isGodCodeE2ETestEnvironment, readGodCodeEnvValue } from './services/brand-runtime-compat'
import { initializePermissionTemplateFromSettings } from './services/tools/permission-policy'
import { migrateLegacyPackagedUserDataIfNeeded } from './services/user-data-migration'

// Chromium on some Windows environments emits a misleading stderr line like:
//   ERROR:network_change_notifier_win.cc(...) WSALookupServiceBegin failed with: 0
// It is typically benign (Chromium fails to query NLA once and falls back) but it
// confuses users and pollutes logs. Filter only this exact known-noise line.
// If you need raw Chromium logs for debugging, set `GODCODE_ALLOW_CHROMIUM_NOISE=1`.
if (
  process.platform === 'win32' &&
  readGodCodeEnvValue(GODCODE_ALLOW_CHROMIUM_NOISE_ENV, LEGACY_CODEALL_ALLOW_CHROMIUM_NOISE_ENV) !==
    '1'
) {
  const noisyLineRe =
    /^\[\d+:\d+\/\d{6}\.\d+:ERROR:network_change_notifier_win\.cc\(\d+\)\] WSALookupServiceBegin failed with: 0\r?\n?$/gm

  const origWrite = process.stderr.write.bind(process.stderr)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(process.stderr as any).write = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunk: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => {
    try {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      // Remove only the known-noise line(s), keep everything else intact.
      const filtered = text.replace(noisyLineRe, '')
      if (filtered.length === 0) return true
      return origWrite(filtered, ...args)
    } catch {
      return origWrite(chunk, ...args)
    }
  }
}

// In dev, keep app data under the repo so it is easy to reset between runs.
// This also prevents accidentally mixing dev/test data with the packaged app's userData.
if (!app.isPackaged && !isGodCodeE2ETestEnvironment()) {
  const devUserData = path.join(process.cwd(), 'dev-data')
  app.setPath('userData', devUserData)
  // Helpful when debugging "data not reset" / "changes not applied" issues.
  console.log('[Main] Dev userData:', devUserData)
}

process.on('uncaughtException', error => {
  console.error('[Main] Uncaught Exception:', error)
  logger.error('[Main] Uncaught Exception:', error)
})

process.on('unhandledRejection', reason => {
  console.error('[Main] Unhandled Rejection:', reason)
  logger.error('[Main] Unhandled Rejection:', reason)
})

// In dev, allow multiple instances so the packaged app (or a stuck dev instance) doesn't block `pnpm dev`.
// Packaged builds still enforce single-instance behavior.
const enforceSingleInstance = app.isPackaged
const gotTheLock = enforceSingleInstance ? app.requestSingleInstanceLock() : true

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  if (enforceSingleInstance) {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
  }

  app.whenReady().then(async () => {
    const migratedFrom = migrateLegacyPackagedUserDataIfNeeded()
    if (migratedFrom) {
      console.info(`[Main] Migrated packaged userData from ${migratedFrom}`)
    }

    logger.info('Application starting')
    hookManager.getStats()
    initializeDefaultHooks()
    logger.info('HookManager initialized with default hooks registered')

    Menu.setApplicationMenu(null)
    mainWindow = createWindow()
    registerIpcHandlers(mainWindow)
    initEventBridge()
    // Skip database initialization in E2E test environment
    if (isGodCodeE2ETestEnvironment()) {
      logger.info('[E2E] Skipping database initialization in test environment')
    } else {
      try {
        const db = DatabaseService.getInstance()
        logger.info('Database initialization started')
        await db.init()
        logger.info('Database initialization completed')

        await initializePermissionTemplateFromSettings()
        logger.info('Permission template initialized from settings')

        await restorePersistedHookGovernance()
        logger.info('Hook governance config restored from persistence')

        // Initialize default agent and category bindings
        const bindingService = BindingService.getInstance()
        await bindingService.initializeDefaults()
        logger.info('Agent and category bindings initialized')

        // Initialize session continuity service for crash recovery
        const crashInfo = await sessionContinuityService.initialize()
        if (crashInfo.detected) {
          logger.warn(`Session crash detected: ${crashInfo.sessionIds.length} sessions affected`)
          // Notify renderer about crash recovery
          if (mainWindow) {
            mainWindow.webContents.send('session:crash-detected', crashInfo)
          }
        }
        logger.info('Session continuity service initialized')

        const recoveredSnapshotCount = await sessionStateRecoveryService.initialize()
        logger.info(`Session state recovery initialized with ${recoveredSnapshotCount} snapshots`)
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
          ? `GodCode 无法初始化数据库。\n\n` +
            `可能原因：\n` +
            `1. 杀毒软件拦截\n` +
            `2. 磁盘空间不足\n` +
            `3. 权限问题\n\n` +
            `建议解决方案：\n` +
            `1. 临时禁用杀毒软件后重试\n` +
            `2. 检查磁盘空间\n` +
            `3. 查看日志获取详细信息：${logPathHint}\n\n` +
            `错误详情：${error instanceof Error ? error.message : String(error)}`
          : `GodCode failed to initialize the database.\n\n` +
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
      await sessionContinuityService.shutdown()
      logger.info('[Main] Session continuity service shutdown complete')
    } catch (error) {
      logger.error('[Main] Failed to shutdown session continuity service:', error)
    }

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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Disable sandbox to allow file:// module loading in production
      sandbox: false
    }
  })

  console.log('[Main] VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL)
  console.log('[Main] ELECTRON_RENDERER_URL:', process.env.ELECTRON_RENDERER_URL)

  mainWindow.maximize()

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    if (!app.isPackaged) {
      console.warn(
        '[Main] No dev server URL detected; loading built renderer. Hot reload will NOT work in this mode.'
      )
      // Fallback for cases where electron-vite didn't inject VITE_DEV_SERVER_URL (common on Windows tooling issues).
      // `electron.vite.config.ts` pins the dev server to 5173 in dev.
      const fallbackDevURL = 'http://localhost:5173'
      console.warn('[Main] Dev fallback URL:', fallbackDevURL)
      void mainWindow
        .loadURL(fallbackDevURL)
        .then(() => mainWindow.webContents.openDevTools())
        .catch(() => {
          console.warn('[Main] Dev fallback URL failed; loading built renderer instead.')
          void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
        })
      return mainWindow
    }
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

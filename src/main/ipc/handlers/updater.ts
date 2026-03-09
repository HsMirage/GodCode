import { app, ipcMain, type BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import { logger } from '@/shared/logger'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@/shared/ipc-channels'

const { autoUpdater } = pkg

let updaterWindow: BrowserWindow | null = null
let updaterRegistered = false

function emitUpdaterEvent(channel: string, payload?: unknown): void {
  if (!updaterWindow || updaterWindow.isDestroyed()) {
    return
  }

  if (payload === undefined) {
    updaterWindow.webContents.send(channel)
    return
  }

  updaterWindow.webContents.send(channel, payload)
}

function buildUnavailablePayload(reason: string) {
  return {
    available: false,
    reason,
    version: app.getVersion()
  }
}

function skipUpdateCheck(reason: string) {
  const payload = buildUnavailablePayload(reason)
  logger.info('[Updater] Skipping update check', payload)
  emitUpdaterEvent(EVENT_CHANNELS.UPDATER_UPDATE_NOT_AVAILABLE, payload)
  return payload
}

function emitUpdaterError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  logger.error('[Updater] Error in auto-updater:', error)
  emitUpdaterEvent(EVENT_CHANNELS.UPDATER_ERROR, message)
  return message
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow | null): void {
  updaterWindow = mainWindow

  if (updaterRegistered) {
    return
  }

  updaterRegistered = true
  autoUpdater.autoDownload = false

  ipcMain.handle(INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES, async () => {
    if (!app.isPackaged) {
      return skipUpdateCheck('development-mode')
    }

    try {
      return await autoUpdater.checkForUpdates()
    } catch (error) {
      emitUpdaterError(error)
      throw error
    }
  })

  ipcMain.handle(INVOKE_CHANNELS.UPDATER_DOWNLOAD_UPDATE, async () => {
    if (!app.isPackaged) {
      return
    }

    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle(INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL, () => {
    if (!app.isPackaged) {
      logger.info('[Updater] Skip quitAndInstall in development mode')
      return
    }

    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('checking-for-update', () => {
    logger.info('[Updater] Checking for update...')
    emitUpdaterEvent(EVENT_CHANNELS.UPDATER_CHECKING_FOR_UPDATE)
  })

  autoUpdater.on('update-available', info => {
    logger.info('[Updater] Update available:', info)
    emitUpdaterEvent(EVENT_CHANNELS.UPDATER_UPDATE_AVAILABLE, info)
  })

  autoUpdater.on('update-not-available', info => {
    logger.info('[Updater] Update not available:', info)
    emitUpdaterEvent(EVENT_CHANNELS.UPDATER_UPDATE_NOT_AVAILABLE, info)
  })

  autoUpdater.on('error', error => {
    emitUpdaterError(error)
  })

  autoUpdater.on('download-progress', progress => {
    logger.info(`[Updater] Download speed: ${progress.bytesPerSecond} - ${progress.percent}%`)
    emitUpdaterEvent(EVENT_CHANNELS.UPDATER_DOWNLOAD_PROGRESS, progress)
  })

  autoUpdater.on('update-downloaded', info => {
    logger.info('[Updater] Update downloaded:', info)
    emitUpdaterEvent(EVENT_CHANNELS.UPDATER_UPDATE_DOWNLOADED, info)
  })

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(error => {
      emitUpdaterError(error)
    })
  }
}

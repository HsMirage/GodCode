import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../../src/shared/ipc-channels'

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const autoUpdater: {
    autoDownload: boolean
    checkForUpdates: ReturnType<typeof vi.fn>
    downloadUpdate: ReturnType<typeof vi.fn>
    quitAndInstall: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
  } = {
    autoDownload: true,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn()
  }
  autoUpdater.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    listeners.set(event, handler)
    return autoUpdater
  })

  return {
    app: {
      isPackaged: false,
      getVersion: vi.fn(() => '1.0.0')
    },
    autoUpdater,
    handle: vi.fn(),
    listeners,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  ipcMain: {
    handle: mocks.handle
  }
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: mocks.autoUpdater
  }
}))

vi.mock('../../../src/shared/logger', () => ({
  logger: mocks.logger
}))

async function loadUpdaterHandlers() {
  vi.resetModules()
  return import('../../../src/main/ipc/handlers/updater')
}

describe('registerUpdaterHandlers', () => {
  beforeEach(() => {
    mocks.app.isPackaged = false
    mocks.autoUpdater.autoDownload = true
    mocks.handle.mockReset()
    mocks.autoUpdater.checkForUpdates.mockReset()
    mocks.autoUpdater.downloadUpdate.mockReset()
    mocks.autoUpdater.quitAndInstall.mockReset()
    mocks.autoUpdater.on.mockClear()
    mocks.listeners.clear()
    mocks.logger.info.mockReset()
    mocks.logger.warn.mockReset()
    mocks.logger.error.mockReset()
  })

  it('registers updater invoke handlers and disables auto download', async () => {
    const { registerUpdaterHandlers } = await loadUpdaterHandlers()

    registerUpdaterHandlers(null as never)

    expect(mocks.autoUpdater.autoDownload).toBe(false)
    expect(mocks.handle).toHaveBeenCalledWith(
      INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES,
      expect.any(Function)
    )
    expect(mocks.handle).toHaveBeenCalledWith(
      INVOKE_CHANNELS.UPDATER_DOWNLOAD_UPDATE,
      expect.any(Function)
    )
    expect(mocks.handle).toHaveBeenCalledWith(
      INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL,
      expect.any(Function)
    )

    const checkHandler = mocks.handle.mock.calls.find(
      ([channel]: [string]) => channel === INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES
    )?.[1]
    const downloadHandler = mocks.handle.mock.calls.find(
      ([channel]: [string]) => channel === INVOKE_CHANNELS.UPDATER_DOWNLOAD_UPDATE
    )?.[1]
    const installHandler = mocks.handle.mock.calls.find(
      ([channel]: [string]) => channel === INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL
    )?.[1]

    mocks.autoUpdater.downloadUpdate.mockResolvedValueOnce(undefined)

    await expect(checkHandler?.({})).resolves.toEqual({
      available: false,
      reason: 'development-mode',
      version: '1.0.0'
    })
    await expect(downloadHandler?.({})).resolves.toBeUndefined()
    expect(installHandler?.({})).toBeUndefined()

    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('forwards updater events to renderer via the shared event channels', async () => {
    const send = vi.fn()
    const { registerUpdaterHandlers } = await loadUpdaterHandlers()

    registerUpdaterHandlers({ isDestroyed: () => false, webContents: { send } } as never)

    const availableInfo = { version: '1.2.3' }
    const progressInfo = { bytesPerSecond: 12, percent: 34 }
    const downloadedInfo = { version: '1.2.3', path: '/tmp/update.zip' }

    mocks.listeners.get('checking-for-update')?.()
    mocks.listeners.get('update-available')?.(availableInfo)
    mocks.listeners.get('update-not-available')?.({ version: '1.0.0' })
    mocks.listeners.get('download-progress')?.(progressInfo)
    mocks.listeners.get('update-downloaded')?.(downloadedInfo)
    mocks.listeners.get('error')?.(new Error('network down'))

    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.UPDATER_CHECKING_FOR_UPDATE)
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.UPDATER_UPDATE_AVAILABLE, availableInfo)
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.UPDATER_UPDATE_NOT_AVAILABLE, {
      version: '1.0.0'
    })
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.UPDATER_DOWNLOAD_PROGRESS, progressInfo)
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.UPDATER_UPDATE_DOWNLOADED, downloadedInfo)
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.UPDATER_ERROR, 'network down')
  })

  it('checks for updates on startup when packaged', async () => {
    mocks.app.isPackaged = true
    mocks.autoUpdater.checkForUpdates.mockResolvedValueOnce({})
    const { registerUpdaterHandlers } = await loadUpdaterHandlers()

    registerUpdaterHandlers({ isDestroyed: () => false, webContents: { send: vi.fn() } } as never)

    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })
})

import { ipcMain, BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron'
import { browserViewManager, type BrowserViewBounds } from '../../services/browser-view.service'

interface BrowserMenuOptions {
  viewId: string
  url?: string
  zoomLevel: number
}

export function registerBrowserHandlers(mainWindow: BrowserWindow | null) {
  if (!mainWindow) {
    console.warn('[Browser IPC] No main window provided, skipping registration')
    return
  }

  browserViewManager.initialize(mainWindow)

  ipcMain.handle(
    'browser:create',
    async (_event, { viewId, url }: { viewId: string; url?: string }) => {
      try {
        const state = await browserViewManager.create(viewId, url)
        return { success: true, data: state }
      } catch (error) {
        console.error('[Browser IPC] Create failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('browser:destroy', async (_event, { viewId }: { viewId: string }) => {
    try {
      browserViewManager.destroy(viewId)
      return { success: true }
    } catch (error) {
      console.error('[Browser IPC] Destroy failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'browser:show',
    async (_event, { viewId, bounds }: { viewId: string; bounds: BrowserViewBounds }) => {
      try {
        const result = browserViewManager.show(viewId, bounds)
        return { success: result }
      } catch (error) {
        console.error('[Browser IPC] Show failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('browser:hide', async (_event, { viewId }: { viewId: string }) => {
    try {
      const result = browserViewManager.hide(viewId)
      return { success: result }
    } catch (error) {
      console.error('[Browser IPC] Hide failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'browser:resize',
    async (_event, { viewId, bounds }: { viewId: string; bounds: BrowserViewBounds }) => {
      try {
        const result = browserViewManager.resize(viewId, bounds)
        return { success: result }
      } catch (error) {
        console.error('[Browser IPC] Resize failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'browser:navigate',
    async (_event, { viewId, url }: { viewId: string; url: string }) => {
      try {
        const result = await browserViewManager.navigate(viewId, url)
        return { success: result }
      } catch (error) {
        console.error('[Browser IPC] Navigate failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('browser:go-back', async (_event, { viewId }: { viewId: string }) => {
    try {
      const result = browserViewManager.goBack(viewId)
      return { success: result }
    } catch (error) {
      console.error('[Browser IPC] GoBack failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:go-forward', async (_event, { viewId }: { viewId: string }) => {
    try {
      const result = browserViewManager.goForward(viewId)
      return { success: result }
    } catch (error) {
      console.error('[Browser IPC] GoForward failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:reload', async (_event, { viewId }: { viewId: string }) => {
    try {
      const result = browserViewManager.reload(viewId)
      return { success: result }
    } catch (error) {
      console.error('[Browser IPC] Reload failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:stop', async (_event, { viewId }: { viewId: string }) => {
    try {
      const result = browserViewManager.stop(viewId)
      return { success: result }
    } catch (error) {
      console.error('[Browser IPC] Stop failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:get-state', async (_event, { viewId }: { viewId: string }) => {
    try {
      const state = browserViewManager.getState(viewId)
      return { success: true, data: state }
    } catch (error) {
      console.error('[Browser IPC] GetState failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:list-tabs', async () => {
    try {
      const states = browserViewManager.getAllStates()
      return { success: true, data: states }
    } catch (error) {
      console.error('[Browser IPC] ListTabs failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:capture', async (_event, { viewId }: { viewId: string }) => {
    try {
      const dataUrl = await browserViewManager.capture(viewId)
      return { success: true, data: dataUrl }
    } catch (error) {
      console.error('[Browser IPC] Capture failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'browser:execute-js',
    async (_event, { viewId, code }: { viewId: string; code: string }) => {
      try {
        const result = await browserViewManager.executeJS(viewId, code)
        return { success: true, data: result }
      } catch (error) {
        console.error('[Browser IPC] ExecuteJS failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'browser:zoom',
    async (_event, { viewId, level }: { viewId: string; level: number }) => {
      try {
        const result = browserViewManager.setZoom(viewId, level)
        return { success: result }
      } catch (error) {
        console.error('[Browser IPC] Zoom failed:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('browser:toggle-devtools', async (_event, { viewId }: { viewId: string }) => {
    try {
      const result = browserViewManager.toggleDevTools(viewId)
      return { success: result }
    } catch (error) {
      console.error('[Browser IPC] ToggleDevTools failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('browser:show-context-menu', async (_event, options: BrowserMenuOptions) => {
    const { viewId, zoomLevel } = options

    const zoomSubmenu: MenuItemConstructorOptions[] = [
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        enabled: zoomLevel < 200,
        click: () => {
          const newZoom = Math.min(200, zoomLevel + 10)
          browserViewManager.setZoom(viewId, newZoom / 100)
          mainWindow?.webContents.send('browser:zoom-changed', { viewId, zoomLevel: newZoom })
        }
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        enabled: zoomLevel > 50,
        click: () => {
          const newZoom = Math.max(50, zoomLevel - 10)
          browserViewManager.setZoom(viewId, newZoom / 100)
          mainWindow?.webContents.send('browser:zoom-changed', { viewId, zoomLevel: newZoom })
        }
      },
      {
        label: `Reset (${zoomLevel}%)`,
        accelerator: 'CmdOrCtrl+0',
        enabled: zoomLevel !== 100,
        click: () => {
          browserViewManager.setZoom(viewId, 1)
          mainWindow?.webContents.send('browser:zoom-changed', { viewId, zoomLevel: 100 })
        }
      }
    ]

    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: 'Zoom',
        submenu: zoomSubmenu
      }
    ]

    const menu = Menu.buildFromTemplate(menuTemplate)
    menu.popup({ window: mainWindow || undefined })

    return { success: true }
  })

  console.log('[Browser IPC] Handlers registered')
}

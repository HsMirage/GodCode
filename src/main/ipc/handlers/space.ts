import { ipcMain, dialog } from 'electron'
import {
  createSpace,
  listSpaces,
  getSpace,
  deleteSpace,
  updateSpace
} from '../../services/space.service'
import {
  isGodCodeE2ETestEnvironment,
  resolveGodCodeE2ESpaceDir
} from '@/main/services/brand-runtime-compat'

export function registerSpaceHandlers(): void {
  // 1. space:create
  ipcMain.handle('space:create', async (_event, input: { name: string; workDir: string }) => {
    try {
      const space = await createSpace(input)
      return { success: true, data: space }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 2. space:list
  ipcMain.handle('space:list', async () => {
    try {
      const spaces = await listSpaces()
      return { success: true, data: spaces }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 3. space:get
  ipcMain.handle('space:get', async (_event, spaceId: string) => {
    try {
      const space = await getSpace(spaceId)
      return { success: true, data: space }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 4. space:delete
  ipcMain.handle('space:delete', async (_event, spaceId: string) => {
    try {
      const result = await deleteSpace(spaceId)
      return { success: result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 5. space:update
  ipcMain.handle(
    'space:update',
    async (_event, spaceId: string, updates: { name?: string; workDir?: string }) => {
      try {
        const space = await updateSpace(spaceId, updates)
        return { success: true, data: space }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 6. dialog:select-folder (for directory picker)
  ipcMain.handle('dialog:select-folder', async () => {
    try {
      // Avoid native OS dialogs in E2E runs.
      if (isGodCodeE2ETestEnvironment()) {
        const e2eDir = resolveGodCodeE2ESpaceDir()
        return { success: true, data: e2eDir }
      }

      const result = await dialog.showOpenDialog({
        title: 'Select Space Location',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select Folder'
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null }
      }

      return { success: true, data: result.filePaths[0] }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

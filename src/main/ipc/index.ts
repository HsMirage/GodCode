import { ipcMain } from 'electron'
import { handleModelCreate, handleModelDelete, handleModelList, handleModelUpdate } from './handlers/model'
import { handlePing } from './handlers/ping'

export function registerIpcHandlers(): void {
  ipcMain.handle('model:create', handleModelCreate)
  ipcMain.handle('model:list', handleModelList)
  ipcMain.handle('model:update', handleModelUpdate)
  ipcMain.handle('model:delete', handleModelDelete)
  ipcMain.handle('ping', handlePing)
}

import { ipcMain } from 'electron'
import {
  handleModelCreate,
  handleModelDelete,
  handleModelList,
  handleModelUpdate
} from './handlers/model'
import { handlePing } from './handlers/ping'
import {
  handleSessionCreate,
  handleSessionGet,
  handleSessionGetOrCreateDefault,
  handleSessionList
} from './handlers/session'
import { handleMessageList, handleMessageSend } from './handlers/message'
import { handleRouterGetRules, handleRouterSaveRules } from './handlers/router'

export function registerIpcHandlers(): void {
  ipcMain.handle('model:create', handleModelCreate)
  ipcMain.handle('model:list', handleModelList)
  ipcMain.handle('model:update', handleModelUpdate)
  ipcMain.handle('model:delete', handleModelDelete)
  ipcMain.handle('ping', handlePing)

  // Session handlers
  ipcMain.handle('session:create', handleSessionCreate)
  ipcMain.handle('session:get', handleSessionGet)
  ipcMain.handle('session:get-or-create-default', handleSessionGetOrCreateDefault)
  ipcMain.handle('session:list', handleSessionList)

  // Message handlers
  ipcMain.handle('message:send', handleMessageSend)
  ipcMain.handle('message:list', handleMessageList)

  // Router handlers
  ipcMain.handle('router:get-rules', handleRouterGetRules)
  ipcMain.handle('router:save-rules', handleRouterSaveRules)
}

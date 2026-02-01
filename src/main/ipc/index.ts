import { ipcMain, type BrowserWindow } from 'electron'
import { registerBrowserHandlers } from './handlers/browser'
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
import {
  handleProviderCacheGetAvailableModels,
  handleProviderCacheGetStats,
  handleProviderCacheIsConnected,
  handleProviderCacheSetStatus
} from './handlers/provider-cache'
import { handleRouterGetRules, handleRouterSaveRules } from './handlers/router'
import { handleTaskList } from './handlers/task'
import {
  handleTaskContinuationAbort,
  handleTaskContinuationGetStatus,
  handleTaskContinuationSetTodos
} from './handlers/task-continuation'
import { registerSpaceHandlers } from './handlers/space'
import { registerArtifactHandlers } from './handlers/artifact'
import { registerAuditLogHandlers } from './handlers/audit-log'
import { registerAuditLogExportHandlers } from './handlers/audit-log-export'

export function registerIpcHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle('model:create', handleModelCreate)
  ipcMain.handle('model:list', handleModelList)
  ipcMain.handle('model:update', handleModelUpdate)
  ipcMain.handle('model:delete', handleModelDelete)
  ipcMain.handle('ping', handlePing)

  registerBrowserHandlers(mainWindow)

  // Session handlers
  ipcMain.handle('session:create', handleSessionCreate)
  ipcMain.handle('session:get', handleSessionGet)
  ipcMain.handle('session:get-or-create-default', handleSessionGetOrCreateDefault)
  ipcMain.handle('session:list', handleSessionList)

  // Message handlers
  ipcMain.handle('message:send', handleMessageSend)
  ipcMain.handle('message:list', handleMessageList)

  // Provider cache handlers
  ipcMain.handle('provider-cache:get-stats', handleProviderCacheGetStats)
  ipcMain.handle('provider-cache:is-connected', handleProviderCacheIsConnected)
  ipcMain.handle('provider-cache:get-available-models', handleProviderCacheGetAvailableModels)
  ipcMain.handle('provider-cache:set-status', handleProviderCacheSetStatus)

  // Router handlers
  ipcMain.handle('router:get-rules', handleRouterGetRules)
  ipcMain.handle('router:save-rules', handleRouterSaveRules)

  // Task handlers
  ipcMain.handle('task:list', handleTaskList)

  // Task continuation handlers
  ipcMain.handle('task-continuation:get-status', handleTaskContinuationGetStatus)
  ipcMain.handle('task-continuation:abort', handleTaskContinuationAbort)
  ipcMain.handle('task-continuation:set-todos', handleTaskContinuationSetTodos)

  // Space handlers
  registerSpaceHandlers()

  // Artifact handlers
  registerArtifactHandlers()

  // Audit Log handlers
  registerAuditLogHandlers()
  registerAuditLogExportHandlers()
}

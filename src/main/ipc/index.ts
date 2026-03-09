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
  handleSessionDelete,
  handleSessionGet,
  handleSessionGetOrCreateDefault,
  handleSessionList,
  handleSessionUpdate
} from './handlers/session'
import { handleMessageAbort, handleMessageList, handleMessageSend } from './handlers/message'
import {
  handleProviderCacheGetAvailableModels,
  handleProviderCacheGetStats,
  handleProviderCacheIsConnected,
  handleProviderCacheSetStatus
} from './handlers/provider-cache'
import { handleTaskCreate, handleTaskGet, handleTaskList, handleTaskUpdate } from './handlers/task'
import { handleToolApprovalList, handleToolApprovalResolve } from './handlers/tool-approval'
import {
  handleTaskContinuationAbort,
  handleTaskContinuationGetStatus,
  handleTaskContinuationSetTodos,
  handleTaskContinuationGetConfig,
  handleTaskContinuationSetConfig
} from './handlers/task-continuation'
import { registerSpaceHandlers } from './handlers/space'
import { registerArtifactHandlers } from './handlers/artifact'
import { registerAuditLogHandlers } from './handlers/audit-log'
import { registerAuditLogExportHandlers } from './handlers/audit-log-export'
import { registerBackupHandlers } from './handlers/backup'
import {
  handleKeychainDeletePassword,
  handleKeychainGetPassword,
  handleKeychainSetPassword,
  handleKeychainList,
  handleKeychainListWithModels,
  handleKeychainGetWithModels
} from './handlers/keychain'
import {
  handleAgentBindingList,
  handleAgentBindingGet,
  handleAgentBindingUpdate,
  handleAgentBindingReset,
  handleCategoryBindingList,
  handleCategoryBindingGet,
  handleCategoryBindingUpdate,
  handleCategoryBindingReset
} from './handlers/binding'
import { handleAgentRunList, handleAgentRunGet, handleAgentRunGetLogs } from './handlers/agent-run'
import {
  handleSettingGet,
  handleSettingSet,
  handleSettingGetAll,
  handleSettingGetResolved,
  handleSettingSchemaList
} from './handlers/setting'
import { registerFileTreeHandlers } from './handlers/file-tree'
import { registerSessionContinuityHandlers } from './handlers/session-continuity'
import {
  handleWorkflowObservabilityGet,
  handleHookGovernanceGet,
  handleHookGovernanceSet
} from './handlers/workflow-observability'
import { registerBackgroundTaskHandlers } from './handlers/background-task'
import { registerUpdaterHandlers } from './handlers/updater'
import { handleSkillCommandItems } from './handlers/skill'
import { INVOKE_CHANNELS } from '@/shared/ipc-channels'

export function registerIpcHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle(INVOKE_CHANNELS.MODEL_CREATE, handleModelCreate)
  ipcMain.handle(INVOKE_CHANNELS.MODEL_LIST, handleModelList)
  ipcMain.handle(INVOKE_CHANNELS.MODEL_UPDATE, handleModelUpdate)
  ipcMain.handle(INVOKE_CHANNELS.MODEL_DELETE, handleModelDelete)
  ipcMain.handle(INVOKE_CHANNELS.PING, handlePing)

  registerBrowserHandlers(mainWindow)

  // Session handlers
  ipcMain.handle(INVOKE_CHANNELS.SESSION_CREATE, handleSessionCreate)
  ipcMain.handle(INVOKE_CHANNELS.SESSION_GET, handleSessionGet)
  ipcMain.handle(INVOKE_CHANNELS.SESSION_GET_OR_CREATE_DEFAULT, handleSessionGetOrCreateDefault)
  ipcMain.handle(INVOKE_CHANNELS.SESSION_LIST, handleSessionList)
  ipcMain.handle(INVOKE_CHANNELS.SESSION_UPDATE, handleSessionUpdate)
  ipcMain.handle(INVOKE_CHANNELS.SESSION_DELETE, handleSessionDelete)

  // Message handlers
  ipcMain.handle(INVOKE_CHANNELS.MESSAGE_SEND, handleMessageSend)
  ipcMain.handle(INVOKE_CHANNELS.MESSAGE_LIST, handleMessageList)
  ipcMain.handle(INVOKE_CHANNELS.MESSAGE_ABORT, handleMessageAbort)

  // Skill handlers
  ipcMain.handle(INVOKE_CHANNELS.SKILL_COMMAND_ITEMS, handleSkillCommandItems)

  // Provider cache handlers
  ipcMain.handle(INVOKE_CHANNELS.PROVIDER_CACHE_GET_STATS, handleProviderCacheGetStats)
  ipcMain.handle(INVOKE_CHANNELS.PROVIDER_CACHE_IS_CONNECTED, handleProviderCacheIsConnected)
  ipcMain.handle(
    INVOKE_CHANNELS.PROVIDER_CACHE_GET_AVAILABLE_MODELS,
    handleProviderCacheGetAvailableModels
  )
  ipcMain.handle(INVOKE_CHANNELS.PROVIDER_CACHE_SET_STATUS, handleProviderCacheSetStatus)

  // Task handlers
  ipcMain.handle(INVOKE_CHANNELS.TASK_CREATE, handleTaskCreate)
  ipcMain.handle(INVOKE_CHANNELS.TASK_GET, handleTaskGet)
  ipcMain.handle(INVOKE_CHANNELS.TASK_LIST, handleTaskList)
  ipcMain.handle(INVOKE_CHANNELS.TASK_UPDATE, handleTaskUpdate)
  ipcMain.handle(INVOKE_CHANNELS.TOOL_APPROVAL_LIST, handleToolApprovalList)
  ipcMain.handle(INVOKE_CHANNELS.TOOL_APPROVAL_RESOLVE, handleToolApprovalResolve)

  // Task continuation handlers
  ipcMain.handle(INVOKE_CHANNELS.TASK_CONTINUATION_GET_STATUS, handleTaskContinuationGetStatus)
  ipcMain.handle(INVOKE_CHANNELS.TASK_CONTINUATION_ABORT, handleTaskContinuationAbort)
  ipcMain.handle(INVOKE_CHANNELS.TASK_CONTINUATION_SET_TODOS, handleTaskContinuationSetTodos)
  ipcMain.handle(INVOKE_CHANNELS.TASK_CONTINUATION_GET_CONFIG, handleTaskContinuationGetConfig)
  ipcMain.handle(INVOKE_CHANNELS.TASK_CONTINUATION_SET_CONFIG, handleTaskContinuationSetConfig)

  // Space handlers
  registerSpaceHandlers()
  registerFileTreeHandlers(mainWindow)

  // Artifact handlers
  registerArtifactHandlers()

  // Audit Log handlers
  registerAuditLogHandlers()
  registerAuditLogExportHandlers()
  registerBackupHandlers()

  // Keychain handlers
  ipcMain.handle(INVOKE_CHANNELS.KEYCHAIN_SET_PASSWORD, handleKeychainSetPassword)
  ipcMain.handle(INVOKE_CHANNELS.KEYCHAIN_GET_PASSWORD, handleKeychainGetPassword)
  ipcMain.handle(INVOKE_CHANNELS.KEYCHAIN_DELETE_PASSWORD, handleKeychainDeletePassword)
  ipcMain.handle(INVOKE_CHANNELS.KEYCHAIN_LIST, handleKeychainList)
  ipcMain.handle(INVOKE_CHANNELS.KEYCHAIN_LIST_WITH_MODELS, handleKeychainListWithModels)
  ipcMain.handle(INVOKE_CHANNELS.KEYCHAIN_GET_WITH_MODELS, handleKeychainGetWithModels)

  // Agent Binding handlers
  ipcMain.handle(INVOKE_CHANNELS.AGENT_BINDING_LIST, handleAgentBindingList)
  ipcMain.handle(INVOKE_CHANNELS.AGENT_BINDING_GET, handleAgentBindingGet)
  ipcMain.handle(INVOKE_CHANNELS.AGENT_BINDING_UPDATE, handleAgentBindingUpdate)
  ipcMain.handle(INVOKE_CHANNELS.AGENT_BINDING_RESET, handleAgentBindingReset)

  // Category Binding handlers
  ipcMain.handle(INVOKE_CHANNELS.CATEGORY_BINDING_LIST, handleCategoryBindingList)
  ipcMain.handle(INVOKE_CHANNELS.CATEGORY_BINDING_GET, handleCategoryBindingGet)
  ipcMain.handle(INVOKE_CHANNELS.CATEGORY_BINDING_UPDATE, handleCategoryBindingUpdate)
  ipcMain.handle(INVOKE_CHANNELS.CATEGORY_BINDING_RESET, handleCategoryBindingReset)

  // Agent Run handlers
  ipcMain.handle(INVOKE_CHANNELS.AGENT_RUN_LIST, handleAgentRunList)
  ipcMain.handle(INVOKE_CHANNELS.AGENT_RUN_GET, handleAgentRunGet)
  ipcMain.handle(INVOKE_CHANNELS.AGENT_RUN_GET_LOGS, handleAgentRunGetLogs)

  // Workflow Observability handlers
  ipcMain.handle(INVOKE_CHANNELS.WORKFLOW_OBSERVABILITY_GET, handleWorkflowObservabilityGet)
  ipcMain.handle(INVOKE_CHANNELS.HOOK_GOVERNANCE_GET, handleHookGovernanceGet)
  ipcMain.handle(INVOKE_CHANNELS.HOOK_GOVERNANCE_SET, handleHookGovernanceSet)

  // Background task handlers
  registerBackgroundTaskHandlers()
  registerUpdaterHandlers(mainWindow)

  // System Setting handlers
  ipcMain.handle(INVOKE_CHANNELS.SETTING_GET, handleSettingGet)
  ipcMain.handle(INVOKE_CHANNELS.SETTING_SET, handleSettingSet)
  ipcMain.handle(INVOKE_CHANNELS.SETTING_GET_ALL, handleSettingGetAll)
  ipcMain.handle(INVOKE_CHANNELS.SETTING_GET_RESOLVED, handleSettingGetResolved)
  ipcMain.handle(INVOKE_CHANNELS.SETTING_SCHEMA_LIST, handleSettingSchemaList)

  // Session Continuity handlers
  registerSessionContinuityHandlers()
}

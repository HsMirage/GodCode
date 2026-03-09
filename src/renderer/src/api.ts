import { EVENT_CHANNELS, INVOKE_CHANNELS, type EventChannel, type InvokeChannel } from '@shared/ipc-channels'
import type {
  AgentBindingData,
  AgentRunRecord,
  ApiKeyEntry,
  ApiKeyWithModelsDecrypted,
  ApiKeyWithModelsMasked,
  ApiResult,
  AuditLogEntry,
  AuditLogExportFormat,
  AuditLogExportResult,
  AuditLogFilter,
  AuditLogQueryOptions,
  BackgroundTaskCancelInput,
  BackgroundTaskGetOutputInput,
  BackgroundTaskListInput,
  BackgroundTaskOutputResult,
  BackgroundTaskRecord,
  BackgroundTaskStats,
  BackupMetadata,
  BrowserMenuOptions,
  BrowserStateChange,
  BrowserViewBounds,
  BrowserZoomChanged,
  CategoryBindingData,
  CrashInfo,
  FileWriteInput,
  HookGovernanceUpdateInput,
  HookGovernanceAuditRecord,
  IpcEventArgs,
  IpcEventChannel,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResponse,
  KeychainDeletePasswordInput,
  KeychainSetPasswordInput,
  MessageAbortInput,
  MessageAbortResult,
  MessageSendInput,
  PersistedMessageRecord,
  MessageStreamChunkPayload,
  MessageStreamErrorPayload,
  MessageStreamUsagePayload,
  PersistedModel,
  RunLogEntry,
  SessionRecoveryEventPayload,
  SessionStateRecord,
  SettingResolvedResult,
  SettingSchemaDescriptor,
  SkillCommandItem,
  TaskContinuationConfig,
  TaskContinuationStatus,
  TaskStatusChangedPayload,
  UpdateAgentBindingInput,
  UpdateCategoryBindingInput,
  WorkflowObservabilitySnapshot
} from '@shared/ipc-contract'
import type {
  ToolApprovalListInput,
  ToolApprovalRequest,
  ToolApprovalResolveInput,
  ToolApprovalResolveResult
} from '@shared/tool-approval-contract'
import type { Artifact, Session, Space, Task } from './types/domain'

export type {
  ApiResult,
  BrowserMenuOptions,
  BrowserStateChange,
  BrowserViewBounds,
  BrowserViewState,
  BrowserZoomChanged,
  FileReadResult,
  FileWriteInput,
  FileWriteResult
} from '@shared/ipc-contract'

const fallbackCodeallApi = {
  invoke: async (channel: string, ..._args: unknown[]) => {
    console.error(`[API] window.codeall not available. Cannot invoke: ${channel}`)
    return { success: false, error: 'Preload API not available' }
  },
  on: (channel: string, _callback: (...args: unknown[]) => void) => {
    console.error(`[API] window.codeall not available. Cannot subscribe: ${channel}`)
    return () => {}
  }
}

function getCodeallApi() {
  if (typeof window !== 'undefined' && window.codeall) {
    return window.codeall
  }

  return fallbackCodeallApi
}

const invokeUnknown = (channel: InvokeChannel, ...args: unknown[]) =>
  (
    getCodeallApi().invoke as (channel: InvokeChannel, ...args: unknown[]) => Promise<unknown>
  )(channel, ...args)

const invoke = <C extends IpcInvokeChannel>(
  channel: C,
  ...args: IpcInvokeArgs<C>
): Promise<IpcInvokeResponse<C>> => invokeUnknown(channel, ...args) as Promise<IpcInvokeResponse<C>>

const onEvent = <C extends IpcEventChannel>(channel: C, callback: (...args: IpcEventArgs<C>) => void) =>
  (
    getCodeallApi().on as (channel: EventChannel, callback: (...args: unknown[]) => void) => () => void
  )(channel, callback as (...args: unknown[]) => void)

/**
 * Safe IPC invoke wrapper that handles wrapped responses.
 * Main process handlers return { success: true, data: T } or { success: false, error: string }
 * This utility unwraps the response and throws on errors.
 */
export async function safeInvoke<T>(channel: InvokeChannel, ...args: unknown[]): Promise<T> {
  const response = await invokeUnknown(channel, ...args)

  // Check if response is a wrapped IPC result
  if (
    response !== null &&
    typeof response === 'object' &&
    'success' in response &&
    typeof response.success === 'boolean'
  ) {
    const wrapped = response as ApiResult<T>
    if (wrapped.success === false) {
      throw new Error(wrapped.error || 'Unknown IPC error')
    }
    // Return unwrapped data, fallback to empty if data is undefined
    return (wrapped.data as T) ?? ([] as unknown as T)
  }

  // Not a wrapped response, return as-is
  return response as T
}

// ---------------------------------------------------------------------------
// Domain APIs - typed wrappers around IPC channels
// ---------------------------------------------------------------------------

export const messageApi = {
  list: (sessionId: string): Promise<PersistedMessageRecord[]> =>
    invoke(INVOKE_CHANNELS.MESSAGE_LIST, sessionId),
  send: (data: MessageSendInput): Promise<PersistedMessageRecord> =>
    invoke(INVOKE_CHANNELS.MESSAGE_SEND, data),
  abort: (data: MessageAbortInput): Promise<MessageAbortResult> => invoke(INVOKE_CHANNELS.MESSAGE_ABORT, data),
  onStreamChunk: (callback: (data: MessageStreamChunkPayload) => void) =>
    onEvent(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, callback),
  onStreamError: (callback: (data: MessageStreamErrorPayload) => void) =>
    onEvent(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, callback),
  onStreamUsage: (callback: (data: MessageStreamUsagePayload) => void) =>
    onEvent(EVENT_CHANNELS.MESSAGE_STREAM_USAGE, callback)
}

export const sessionApi = {
  create: (data: { spaceId: string; title?: string }): Promise<Session> =>
    invoke(INVOKE_CHANNELS.SESSION_CREATE, data),
  get: (id: string): Promise<Session> => invoke(INVOKE_CHANNELS.SESSION_GET, id),
  getOrCreateDefault: (data?: { spaceId?: string }): Promise<Session | null> =>
    data === undefined
      ? invoke(INVOKE_CHANNELS.SESSION_GET_OR_CREATE_DEFAULT)
      : invoke(INVOKE_CHANNELS.SESSION_GET_OR_CREATE_DEFAULT, data),
  list: (spaceId?: string): Promise<Session[]> =>
    spaceId === undefined
      ? invoke(INVOKE_CHANNELS.SESSION_LIST)
      : invoke(INVOKE_CHANNELS.SESSION_LIST, spaceId),
  update: (
    sessionId: string,
    updates: Partial<Pick<Session, 'spaceId' | 'title' | 'status'>>
  ): Promise<Session> => invoke(INVOKE_CHANNELS.SESSION_UPDATE, { id: sessionId, ...updates }),
  delete: (sessionId: string): Promise<void> => invoke(INVOKE_CHANNELS.SESSION_DELETE, sessionId),
  recoveryList: (): Promise<SessionStateRecord[]> => invoke(INVOKE_CHANNELS.SESSION_RECOVERABLE_LIST),
  recoveryExecute: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
    invoke(INVOKE_CHANNELS.SESSION_RECOVERY_EXECUTE, sessionId),
  recoveryResumePrompt: (sessionId: string): Promise<string> =>
    invoke(INVOKE_CHANNELS.SESSION_RESUME_PROMPT, sessionId),
  onCrashDetected: (callback: (payload: CrashInfo) => void) =>
    onEvent(EVENT_CHANNELS.SESSION_CRASH_DETECTED, callback),
  onRecoveryProgress: (callback: (payload: SessionRecoveryEventPayload) => void) =>
    onEvent(EVENT_CHANNELS.SESSION_RECOVERY_PROGRESS, callback),
  onRecovered: (callback: (payload: SessionRecoveryEventPayload) => void) =>
    onEvent(EVENT_CHANNELS.SESSION_RECOVERED, callback)
}

export const workflowApi = {
  taskList: (sessionId: string): Promise<Task[]> => invoke(INVOKE_CHANNELS.TASK_LIST, sessionId),
  toolApprovalList: (input?: ToolApprovalListInput): Promise<ToolApprovalRequest[]> =>
    input === undefined
      ? invoke(INVOKE_CHANNELS.TOOL_APPROVAL_LIST)
      : invoke(INVOKE_CHANNELS.TOOL_APPROVAL_LIST, input),
  toolApprovalResolve: (input: ToolApprovalResolveInput): Promise<ToolApprovalResolveResult> =>
    invoke(INVOKE_CHANNELS.TOOL_APPROVAL_RESOLVE, input),
  observabilityGet: (workflowTaskId: string): Promise<WorkflowObservabilitySnapshot | null> =>
    invoke(INVOKE_CHANNELS.WORKFLOW_OBSERVABILITY_GET, workflowTaskId),
  agentRunList: (taskId: string): Promise<AgentRunRecord[]> =>
    invoke(INVOKE_CHANNELS.AGENT_RUN_LIST, taskId),
  agentRunGetLogs: (runId: string): Promise<RunLogEntry[]> =>
    invoke(INVOKE_CHANNELS.AGENT_RUN_GET_LOGS, runId),
  backgroundTaskList: (input?: BackgroundTaskListInput): Promise<ApiResult<BackgroundTaskRecord[]>> =>
    input === undefined
      ? invoke(INVOKE_CHANNELS.BACKGROUND_TASK_LIST)
      : invoke(INVOKE_CHANNELS.BACKGROUND_TASK_LIST, input),
  backgroundTaskStats: (): Promise<ApiResult<BackgroundTaskStats>> =>
    invoke(INVOKE_CHANNELS.BACKGROUND_TASK_STATS),
  backgroundTaskGetOutput: (input: BackgroundTaskGetOutputInput): Promise<ApiResult<BackgroundTaskOutputResult>> =>
    invoke(INVOKE_CHANNELS.BACKGROUND_TASK_GET_OUTPUT, input),
  backgroundTaskCancel: (input: BackgroundTaskCancelInput): Promise<ApiResult<{ taskId: string; cancelled: boolean }>> =>
    invoke(INVOKE_CHANNELS.BACKGROUND_TASK_CANCEL, input),
  continuationGetStatus: (sessionId: string): Promise<TaskContinuationStatus> =>
    invoke(INVOKE_CHANNELS.TASK_CONTINUATION_GET_STATUS, sessionId),
  continuationGetConfig: (): Promise<ApiResult<TaskContinuationConfig>> =>
    invoke(INVOKE_CHANNELS.TASK_CONTINUATION_GET_CONFIG),
  continuationSetConfig: (config: Partial<TaskContinuationConfig>): Promise<ApiResult<TaskContinuationConfig>> =>
    invoke(INVOKE_CHANNELS.TASK_CONTINUATION_SET_CONFIG, config),
  onTaskStatusChanged: (callback: (data: TaskStatusChangedPayload) => void) =>
    onEvent(EVENT_CHANNELS.TASK_STATUS_CHANGED, callback),
  onToolApprovalUpdated: (callback: (data: { request: ToolApprovalRequest }) => void) =>
    onEvent(EVENT_CHANNELS.TOOL_APPROVAL_UPDATED, callback),
  onBackgroundTaskStarted: (callback: (data: { task: BackgroundTaskRecord }) => void) =>
    onEvent(EVENT_CHANNELS.BACKGROUND_TASK_STARTED, callback),
  onBackgroundTaskOutput: (
    callback: (data: { taskId: string; stream: 'stdout' | 'stderr'; data: string; timestamp: string }) => void
  ) => onEvent(EVENT_CHANNELS.BACKGROUND_TASK_OUTPUT, callback),
  onBackgroundTaskCompleted: (
    callback: (data: { task: BackgroundTaskRecord; exitCode: number | null; signal: string | null }) => void
  ) => onEvent(EVENT_CHANNELS.BACKGROUND_TASK_COMPLETED, callback),
  onBackgroundTaskCancelled: (callback: (data: { task: BackgroundTaskRecord }) => void) =>
    onEvent(EVENT_CHANNELS.BACKGROUND_TASK_CANCELLED, callback)
}

export const settingsApi = {
  modelList: (): Promise<PersistedModel[]> => invoke(INVOKE_CHANNELS.MODEL_LIST),
  modelCreate: (data: import('@shared/ipc-contract').ModelCreateInput): Promise<PersistedModel> =>
    invoke(INVOKE_CHANNELS.MODEL_CREATE, data),
  modelUpdate: (data: import('@shared/ipc-contract').ModelUpdateInput): Promise<PersistedModel> =>
    invoke(INVOKE_CHANNELS.MODEL_UPDATE, data),
  modelDelete: (id: string): Promise<PersistedModel> => invoke(INVOKE_CHANNELS.MODEL_DELETE, id),
  keychainList: (): Promise<ApiKeyEntry[]> => invoke(INVOKE_CHANNELS.KEYCHAIN_LIST),
  keychainListWithModels: (): Promise<ApiKeyWithModelsMasked[]> =>
    invoke(INVOKE_CHANNELS.KEYCHAIN_LIST_WITH_MODELS),
  keychainGetWithModels: (apiKeyId: string): Promise<ApiKeyWithModelsDecrypted | null> =>
    invoke(INVOKE_CHANNELS.KEYCHAIN_GET_WITH_MODELS, apiKeyId),
  keychainSetPassword: (data: KeychainSetPasswordInput): Promise<{ id: string }> =>
    invoke(INVOKE_CHANNELS.KEYCHAIN_SET_PASSWORD, data),
  keychainDeletePassword: (data: KeychainDeletePasswordInput): Promise<boolean> =>
    invoke(INVOKE_CHANNELS.KEYCHAIN_DELETE_PASSWORD, data),
  agentBindingList: (): Promise<AgentBindingData[]> => invoke(INVOKE_CHANNELS.AGENT_BINDING_LIST),
  agentBindingUpdate: (data: { agentCode: string; data: UpdateAgentBindingInput }): Promise<AgentBindingData> =>
    invoke(INVOKE_CHANNELS.AGENT_BINDING_UPDATE, data),
  agentBindingReset: (agentCode: string): Promise<AgentBindingData> =>
    invoke(INVOKE_CHANNELS.AGENT_BINDING_RESET, agentCode),
  categoryBindingList: (): Promise<CategoryBindingData[]> =>
    invoke(INVOKE_CHANNELS.CATEGORY_BINDING_LIST),
  categoryBindingUpdate: (
    data: { categoryCode: string; data: UpdateCategoryBindingInput }
  ): Promise<CategoryBindingData> => invoke(INVOKE_CHANNELS.CATEGORY_BINDING_UPDATE, data),
  categoryBindingReset: (categoryCode: string): Promise<CategoryBindingData> =>
    invoke(INVOKE_CHANNELS.CATEGORY_BINDING_RESET, categoryCode),
  settingGet: (key: string): Promise<string | null> => invoke(INVOKE_CHANNELS.SETTING_GET, key),
  settingGetResolved: (key: string): Promise<SettingResolvedResult> =>
    invoke(INVOKE_CHANNELS.SETTING_GET_RESOLVED, key),
  settingSet: (input: { key: string; value: unknown; spaceId?: string }): Promise<{ key: string; value: string | null }> =>
    invoke(INVOKE_CHANNELS.SETTING_SET, input),
  settingSchemaList: (): Promise<SettingSchemaDescriptor[]> =>
    invoke(INVOKE_CHANNELS.SETTING_SCHEMA_LIST),
  hookGovernanceGet: () => invoke(INVOKE_CHANNELS.HOOK_GOVERNANCE_GET),
  hookGovernanceSet: (input: HookGovernanceUpdateInput) =>
    invoke(INVOKE_CHANNELS.HOOK_GOVERNANCE_SET, input),
  auditLogQuery: (filters?: AuditLogFilter, options?: AuditLogQueryOptions): Promise<AuditLogEntry[]> =>
    filters === undefined && options === undefined
      ? invoke(INVOKE_CHANNELS.AUDIT_LOG_QUERY)
      : invoke(INVOKE_CHANNELS.AUDIT_LOG_QUERY, filters, options),
  auditLogCount: (filters?: AuditLogFilter): Promise<number> =>
    filters === undefined
      ? invoke(INVOKE_CHANNELS.AUDIT_LOG_COUNT)
      : invoke(INVOKE_CHANNELS.AUDIT_LOG_COUNT, filters),
  auditLogExport: (format: AuditLogExportFormat, filters?: AuditLogFilter): Promise<AuditLogExportResult> =>
    invoke(INVOKE_CHANNELS.AUDIT_LOG_EXPORT, format, filters),
  backupList: (): Promise<BackupMetadata[]> => invoke(INVOKE_CHANNELS.BACKUP_LIST),
  backupCreate: (name?: string): Promise<string> =>
    name === undefined
      ? invoke(INVOKE_CHANNELS.BACKUP_CREATE)
      : invoke(INVOKE_CHANNELS.BACKUP_CREATE, name),
  backupDelete: (id: string): Promise<void> => invoke(INVOKE_CHANNELS.BACKUP_DELETE, id),
  restoreFromFile: (id: string): Promise<void> => invoke(INVOKE_CHANNELS.RESTORE_FROM_FILE, id),
  onHookAuditAppended: (callback: (data: { record: HookGovernanceAuditRecord }) => void) =>
    onEvent(EVENT_CHANNELS.HOOK_AUDIT_APPENDED, callback)
}

export const artifactApi = {
  get: (artifactId: string): Promise<Artifact> => invoke(INVOKE_CHANNELS.ARTIFACT_GET, artifactId),
  list: (sessionId: string): Promise<Artifact[]> => invoke(INVOKE_CHANNELS.ARTIFACT_LIST, sessionId),
  download: (artifactId: string, workDir?: string): Promise<ApiResult<{ filePath: string }>> =>
    workDir === undefined
      ? invoke(INVOKE_CHANNELS.ARTIFACT_DOWNLOAD, artifactId)
      : invoke(INVOKE_CHANNELS.ARTIFACT_DOWNLOAD, artifactId, workDir),
  delete: (artifactId: string): Promise<ApiResult<null>> =>
    invoke(INVOKE_CHANNELS.ARTIFACT_DELETE, artifactId),
  getDiff: (artifactId: string): Promise<string | null> =>
    invoke(INVOKE_CHANNELS.ARTIFACT_GET_DIFF, artifactId),
  accept: (artifactId: string): Promise<ApiResult<null>> =>
    invoke(INVOKE_CHANNELS.ARTIFACT_ACCEPT, artifactId),
  revert: (data: { artifactId: string; workDir: string }): Promise<ApiResult<null>> =>
    invoke(INVOKE_CHANNELS.ARTIFACT_REVERT, data),
  onCreated: (callback: () => void) =>
    onEvent(EVENT_CHANNELS.ARTIFACT_CREATED, callback)
}

export const spaceApi = {
  list: (): Promise<Space[]> => safeInvoke(INVOKE_CHANNELS.SPACE_LIST),
  get: (spaceId: string): Promise<ApiResult<Space | null>> => invoke(INVOKE_CHANNELS.SPACE_GET, spaceId),
  create: (data: { name: string; workDir: string }): Promise<ApiResult<Space>> =>
    invoke(INVOKE_CHANNELS.SPACE_CREATE, data),
  delete: (spaceId: string): Promise<ApiResult<null>> => invoke(INVOKE_CHANNELS.SPACE_DELETE, spaceId),
  selectFolder: (): Promise<ApiResult<string | null>> => invoke(INVOKE_CHANNELS.DIALOG_SELECT_FOLDER)
}

export const skillApi = {
  commandItems: (input?: { query?: string }): Promise<SkillCommandItem[]> =>
    input === undefined
      ? invoke(INVOKE_CHANNELS.SKILL_COMMAND_ITEMS)
      : invoke(INVOKE_CHANNELS.SKILL_COMMAND_ITEMS, input)
}

// Legacy browser API (backward compatible)
export const api = {
  createBrowserView: (viewId: string, url?: string) =>
    invoke(INVOKE_CHANNELS.BROWSER_CREATE, { viewId, url }),
  destroyBrowserView: (viewId: string) =>
    invoke(INVOKE_CHANNELS.BROWSER_DESTROY, { viewId }),
  showBrowserView: (viewId: string, bounds: BrowserViewBounds) =>
    invoke(INVOKE_CHANNELS.BROWSER_SHOW, { viewId, bounds }),
  hideBrowserView: (viewId: string) => invoke(INVOKE_CHANNELS.BROWSER_HIDE, { viewId }),
  resizeBrowserView: (viewId: string, bounds: BrowserViewBounds) =>
    invoke(INVOKE_CHANNELS.BROWSER_RESIZE, { viewId, bounds }),
  navigateBrowserView: (viewId: string, url: string) =>
    invoke(INVOKE_CHANNELS.BROWSER_NAVIGATE, { viewId, url }),
  browserGoBack: (viewId: string) => invoke(INVOKE_CHANNELS.BROWSER_GO_BACK, { viewId }),
  browserGoForward: (viewId: string) =>
    invoke(INVOKE_CHANNELS.BROWSER_GO_FORWARD, { viewId }),
  browserReload: (viewId: string) => invoke(INVOKE_CHANNELS.BROWSER_RELOAD, { viewId }),
  browserStop: (viewId: string) => invoke(INVOKE_CHANNELS.BROWSER_STOP, { viewId }),
  captureBrowserView: (viewId: string) =>
    invoke(INVOKE_CHANNELS.BROWSER_CAPTURE, { viewId }),
  executeJS: (viewId: string, code: string) =>
    invoke(INVOKE_CHANNELS.BROWSER_EXECUTE_JS, { viewId, code }),
  setZoom: (viewId: string, level: number) =>
    invoke(INVOKE_CHANNELS.BROWSER_ZOOM, { viewId, level }),
  showBrowserContextMenu: (options: BrowserMenuOptions) =>
    invoke(INVOKE_CHANNELS.BROWSER_SHOW_CONTEXT_MENU, options),
  getArtifact: (artifactId: string) => invoke(INVOKE_CHANNELS.ARTIFACT_GET, artifactId),
  openArtifact: (path: string) => invoke(INVOKE_CHANNELS.SHELL_OPEN_PATH, path),
  readArtifactContent: (path: string, sessionId: string) =>
    invoke(INVOKE_CHANNELS.FILE_READ, path, sessionId),
  writeArtifactContent: (input: FileWriteInput) =>
    invoke(INVOKE_CHANNELS.FILE_WRITE, input),
  onBrowserStateChange: (callback: (data: BrowserStateChange) => void) =>
    onEvent(EVENT_CHANNELS.BROWSER_STATE_CHANGED, callback),
  onBrowserZoomChanged: (callback: (data: BrowserZoomChanged) => void) =>
    onEvent(EVENT_CHANNELS.BROWSER_ZOOM_CHANGED, callback)
}

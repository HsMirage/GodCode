import type { Artifact, Message, Model, Session, Space, Task } from '../types/domain'
import type {
  HookGovernanceAuditRecord,
  HookGovernanceStatus,
  HookGovernanceUpdateInput,
  HookGovernanceUpdateResult
} from './hook-governance-contract'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type EventChannel, type InvokeChannel } from './ipc-channels'
import type { RecoveryTrackingMetadata } from './recovery-contract'
import type { PersistedExecutionEvent } from './execution-event-contract'
import type {
  ToolApprovalListInput,
  ToolApprovalRequest,
  ToolApprovalResolveInput,
  ToolApprovalResolveResult
} from './tool-approval-contract'

export interface ApiResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface FileReadResult extends ApiResult {
  content?: string
  mtimeMs?: number
}

export interface FileWriteInput {
  filePath: string
  sessionId: string
  content: string
  expectedMtimeMs?: number
}

export interface FileWriteResult extends ApiResult {
  mtimeMs?: number
  changeType?: 'created' | 'modified'
  conflict?: {
    currentContent: string
    currentMtimeMs: number
  }
}

export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserViewState {
  id: string
  url: string
  title: string
  favicon?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomLevel: number
  error?: string
}

export interface BrowserStateChange {
  viewId: string
  state: BrowserViewState
}

export interface BrowserZoomChanged {
  viewId: string
  zoomLevel: number
}

export interface BrowserMenuOptions {
  viewId: string
  url?: string
  zoomLevel: number
}

export interface BrowserAiOperationPayload {
  toolName: string
  status: 'running' | 'completed' | 'error'
  viewId: string
  opId: string
  args?: Record<string, unknown>
  timestamp: number
  errorCode?: string
  durationMs?: number
}

export interface SkillCommandItem {
  label: string
  command: string
  description: string
  argsHint?: string
}

export interface SkillCommandInvocation {
  command: string
  input?: string
  rawInput?: string
}

export interface MessageSendInput {
  sessionId: string
  content: string
  agentCode?: string
  skillCommand?: SkillCommandInvocation
  resumeContext?: RecoveryTrackingMetadata
}

export interface MessageAbortInput {
  sessionId: string
}

export interface MessageAbortResult {
  success: boolean
  abortedStream: boolean
  cancelledBackgroundTaskCount: number
  cancelledTaskRows: number
}

export interface PersistedMessageRecord {
  id: string
  sessionId: string
  role: Message['role'] | string
  content: string
  metadata?: unknown
  createdAt?: string
}

export interface MessageStreamChunkPayload {
  sessionId: string
  content: string
  done: boolean
  type?: 'content' | 'tool_start' | 'tool_end' | 'error' | 'done'
  toolCall?: {
    id: string
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
  }
  error?: {
    message: string
    code?: string
  }
}

export interface MessageStreamErrorPayload {
  sessionId: string
  message: string
  code?: string
}

export interface MessageStreamUsagePayload {
  sessionId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface SpaceCreateInput {
  name: string
  workDir: string
}

export interface SpaceUpdateInput {
  name?: string
  workDir?: string
}

export interface SessionCreateInput {
  spaceId: string
  title?: string
}

export interface SessionGetOrCreateDefaultInput {
  spaceId?: string
}

export type SessionUpdateInput = {
  id: string
} & Partial<Pick<Session, 'spaceId' | 'title' | 'status'>>

export type PersistedModel = Omit<Model, 'apiKey' | 'apiKeyId' | 'baseURL' | 'contextSize'> & {
  apiKey: string | null
  apiKeyId: string | null
  baseURL: string | null
  contextSize: number
  createdAt: Date
  updatedAt: Date
}

export type ModelCreateInput = Omit<Model, 'id'>

export interface ModelUpdateInput {
  id: string
  data: Partial<Omit<Model, 'id'>>
}

export type TaskCreateInput = Omit<Task, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>

export type TaskUpdateInput = {
  id: string
} & Partial<Omit<Task, 'id' | 'createdAt'>>

export interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}

export interface TaskContinuationConfig {
  countdownSeconds: number
  idleDedupWindowMs: number
  abortWindowMs: number
}

export interface TaskContinuationStatus {
  shouldContinue: boolean
  incompleteTodos: Todo[]
  continuationPrompt: string | null
  totalTodos: number
  completedTodos: number
  recoveryContext: RecoveryTrackingMetadata | null
}

export type BackgroundTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'interrupt'
  | 'cancelled'
  | 'timeout'

export interface BackgroundTaskRecord {
  id: string
  pid: number | null
  command: string
  description?: string
  cwd: string
  status: BackgroundTaskStatus
  exitCode: number | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  metadata: Record<string, unknown> | null
}

export interface BackgroundTaskListInput {
  sessionId?: string
}

export interface BackgroundTaskGetOutputInput {
  taskId: string
  afterIndex?: number
}

export interface BackgroundTaskCancelInput {
  taskId: string
}

export interface BackgroundTaskOutputChunk {
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: string
}

export interface BackgroundTaskOutputMeta {
  total: number
  stdout: number
  stderr: number
  truncated: boolean
}

export interface BackgroundTaskOutputResult {
  task: BackgroundTaskRecord
  chunks: BackgroundTaskOutputChunk[]
  nextIndex: number
  outputMeta: BackgroundTaskOutputMeta
}

export interface BackgroundTaskStats {
  total: number
  running: number
  completed: number
  error: number
  cancelled: number
}

export interface AgentBindingData {
  id: string
  agentCode: string
  agentName: string
  agentType: 'primary' | 'subagent' | string
  description: string | null
  modelId: string | null
  modelName?: string | null
  temperature: number
  tools: string[]
  systemPrompt: string | null
  enabled: boolean
}

export interface CategoryBindingData {
  id: string
  categoryCode: string
  categoryName: string
  description: string | null
  modelId: string | null
  modelName?: string | null
  temperature: number
  systemPrompt: string | null
  enabled: boolean
}

export interface UpdateAgentBindingInput {
  modelId?: string | null
  temperature?: number
  tools?: string[]
  systemPrompt?: string | null
  enabled?: boolean
}

export interface UpdateCategoryBindingInput {
  modelId?: string | null
  temperature?: number
  systemPrompt?: string | null
  enabled?: boolean
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export type SettingValueType = 'string' | 'number' | 'boolean' | 'json'
export type SettingValueSource = 'stored' | 'default' | 'null'

export interface SettingSchemaDescriptor {
  key: string
  type: SettingValueType
  scope: 'global' | 'space'
  defaultValue?: string | number | boolean | JsonValue | null
  nullable?: boolean
  description?: string
  validation?: {
    min?: number
    max?: number
    integer?: boolean
    minLength?: number
    maxLength?: number
    pattern?: string
    enum?: Array<string | number | boolean>
  }
  defaultValueSerialized: string | null
}

export interface SettingResolvedResult {
  key: string
  value: string | number | boolean | JsonValue | null
  source: SettingValueSource
  schema: SettingSchemaDescriptor
  scopeSource?: {
    scope: 'global' | 'space'
    source: SettingValueSource
  }
}

export interface AuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string | null
  userId: string | null
  sessionId: string | null
  ipAddress: string | null
  metadata: unknown
  success: boolean
  errorMsg: string | null
  createdAt: Date
}

export interface AuditLogFilter {
  action?: string
  entityType?: string
  entityId?: string
  sessionId?: string
  success?: boolean
  startDate?: Date
  endDate?: Date
}

export interface AuditLogQueryOptions {
  limit?: number
  offset?: number
}

export type AuditLogExportFormat = 'json' | 'csv'

export interface AuditLogExportResult {
  success: boolean
  reason?: 'cancelled'
  filePath?: string
  count?: number
}

export interface ApiKeyModelInfo {
  id: string
  modelName: string
  provider: string
}

export interface ApiKeyEntry {
  id: string
  label: string | null
  baseURL: string
  apiKey: string
  provider: string
}

export interface ApiKeyWithModelsMasked {
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKeyMasked: string
  models: ApiKeyModelInfo[]
}

export interface ApiKeyWithModelsDecrypted {
  id: string
  provider: string
  label: string | null
  baseURL: string
  apiKey: string
  models: ApiKeyModelInfo[]
}

export interface KeychainSetPasswordInput {
  id?: string
  label?: string
  baseURL: string
  apiKey: string
  provider?: string
}

export interface KeychainGetPasswordInput {
  service: string
  account: string
}

export interface KeychainDeletePasswordInput extends KeychainGetPasswordInput {
  id?: string
}

export interface BackupMetadata {
  name: string
  path: string
  size: number
  createdAt: Date
  schemaVersion: string | null
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
}

export interface RunLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: Record<string, unknown>
}

export interface AgentRunRecord {
  id: string
  taskId: string
  agentCode: string | null
  status: string
  logs: RunLogEntry[]
  tokenUsage: TokenUsage | null
  cost: number | null
  startedAt: Date
  completedAt: Date | null
}

export interface AgentRunDetail extends AgentRunRecord {
  task: Task
}

export type WorkflowModelSource = 'override' | 'agent-binding' | 'category-binding' | 'system-default'

export type WorkflowModelSelectionReason =
  | 'explicit-override'
  | 'agent-binding-hit'
  | 'category-binding-hit'
  | 'system-default-hit'

export type WorkflowFallbackReason =
  | 'override-not-requested'
  | 'binding-not-requested'
  | 'binding-not-configured'
  | 'binding-disabled'
  | 'binding-model-unset'
  | 'system-default-not-configured'

export interface WorkflowModelSelectionAttemptSummary {
  source: WorkflowModelSource
  status: 'selected' | 'fallback' | 'skipped'
  reason: WorkflowModelSelectionReason | WorkflowFallbackReason
  summary: string
  bindingCode?: string
  bindingName?: string
  modelId?: string
  modelName?: string
  provider?: string
}

export interface WorkflowObservabilitySnapshot {
  workflowId: string
  graph: {
    workflowId: string
    nodeOrder: string[]
    nodes: Array<Record<string, unknown>>
  }
  correlation: {
    workflowId: string
    sessionId?: string
    traceId?: string
  }
  timeline: {
    workflow: Array<Record<string, unknown>>
    task: Array<Record<string, unknown>>
    run: Array<Record<string, unknown>>
  }
  integration: Record<string, unknown>
  lifecycleStages: Array<Record<string, unknown>>
  assignments: Array<{
    taskId: string
    persistedTaskId?: string
    runId?: string
    assignedAgent?: string
    assignedCategory?: string
    workflowPhase?: string
    assignedModel?: string
    modelSource?: WorkflowModelSource
    modelSelectionReason?: WorkflowModelSelectionReason
    modelSelectionSummary?: string
    fallbackReason?: WorkflowFallbackReason
    fallbackAttemptSummary?: WorkflowModelSelectionAttemptSummary[]
    concurrencyKey?: string
    fallbackTrail?: string[]
  }>
  retryState: {
    tasks: Record<
      string,
      {
        attemptNumber: number
        status: string
        maxAttempts: number
        errors: Array<{ errorType: string; error: string; timestamp: string }>
      }
    >
    totalRetried: number
  }
  recoveryState: Record<string, unknown>
  continuationSnapshot: {
    workflowId: string
    sessionId?: string
    status: 'completed' | 'failed' | 'cancelled' | 'running'
    resumable: boolean
    failedTasks: string[]
    retryableTasks: string[]
    updatedAt: string
  }
  sharedContext: {
    workflowId: string
    totalEntries: number
    activeEntries: number
    archivedEntries: number
    entries: Array<Record<string, unknown>>
    archived: Array<Record<string, unknown>>
  }
}

export interface ArtifactSessionStats {
  total: number
  created: number
  modified: number
  deleted: number
  accepted: number
  pending: number
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileTreeNode[]
}

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export type SessionContinuityStatus =
  | 'active'
  | 'idle'
  | 'interrupted'
  | 'crashed'
  | 'completed'
  | 'recovering'

export interface SessionCheckpoint {
  lastMessageId?: string
  lastTaskId?: string
  lastRunId?: string
  pendingTasks: string[]
  inProgressTasks: string[]
  completedTasks: string[]
  messageCount: number
  lastUserMessageId?: string
  lastAssistantMessageId?: string
  lastActivityAt: Date
  checkpointAt: Date
}

export interface SessionContext {
  spaceId: string
  workDir: string
  sessionSnapshot?: Record<string, unknown>
  conversationSummary?: string
  recentTopics?: string[]
  activeAgents?: string[]
  agentStates?: Record<string, unknown>
  recoveryHints?: string[]
  suggestedNextAction?: string
  recoverySource?: RecoveryTrackingMetadata['recoverySource']
  recoveryStage?: RecoveryTrackingMetadata['recoveryStage']
  resumeReason?: RecoveryTrackingMetadata['resumeReason']
  resumeAction?: RecoveryTrackingMetadata['resumeAction']
  recoveryUpdatedAt?: string
  executionEvents?: PersistedExecutionEvent[]
}

export interface SessionStateRecord {
  id: string
  sessionId: string
  status: SessionContinuityStatus
  checkpoint: SessionCheckpoint
  context: SessionContext
  createdAt: Date
  updatedAt: Date
}

export type RecoveryType = 'none' | 'resume' | 'partial' | 'rebuild'

export interface RecoveryStep {
  order: number
  type: 'load_messages' | 'restore_tasks' | 'rebuild_context' | 'resume_task' | 'notify_user'
  description: string
  taskId?: string
  metadata?: Record<string, unknown>
}

export interface RecoveryPlan {
  sessionId: string
  status: SessionContinuityStatus
  canRecover: boolean
  recoveryType: RecoveryType
  steps: RecoveryStep[]
  estimatedActions: number
  context: SessionContext
  checkpoint: SessionCheckpoint
}

export interface CrashInfo {
  detected: boolean
  sessionIds: string[]
  timestamp: Date
  reason?: string
}

export interface SessionRecoveryMessage {
  id: string
  sessionId: string
  role: Message['role']
  content: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface SessionRecoveryEventPayload {
  sessionId: string
  step: 'load_messages'
  status: 'completed'
  messageCount: number
  messages: SessionRecoveryMessage[]
  recoveredAt: string
}

export interface TaskStatusChangedPayload {
  workflowId: string
  taskId: string
  eventType: string
  status?: string
  timestamp: Date
  data?: Record<string, unknown>
}

export interface IpcInvokeArgsMap {
  [INVOKE_CHANNELS.PING]: []
  [INVOKE_CHANNELS.SPACE_CREATE]: [data: SpaceCreateInput]
  [INVOKE_CHANNELS.SPACE_LIST]: []
  [INVOKE_CHANNELS.SPACE_GET]: [spaceId: string]
  [INVOKE_CHANNELS.SPACE_UPDATE]: [spaceId: string, updates: SpaceUpdateInput]
  [INVOKE_CHANNELS.SPACE_DELETE]: [spaceId: string]
  [INVOKE_CHANNELS.SESSION_CREATE]: [data: SessionCreateInput]
  [INVOKE_CHANNELS.SESSION_LIST]: [] | [spaceId?: string]
  [INVOKE_CHANNELS.SESSION_GET]: [id: string]
  [INVOKE_CHANNELS.SESSION_UPDATE]: [data: SessionUpdateInput]
  [INVOKE_CHANNELS.SESSION_DELETE]: [id: string]
  [INVOKE_CHANNELS.SESSION_GET_OR_CREATE_DEFAULT]: [] | [input?: SessionGetOrCreateDefaultInput]
  [INVOKE_CHANNELS.MESSAGE_SEND]: [data: MessageSendInput]
  [INVOKE_CHANNELS.MESSAGE_LIST]: [sessionId: string]
  [INVOKE_CHANNELS.MESSAGE_STREAM]: [...args: unknown[]]
  [INVOKE_CHANNELS.MESSAGE_ABORT]: [data: MessageAbortInput]
  [INVOKE_CHANNELS.SKILL_COMMAND_ITEMS]: [] | [input?: { query?: string }]
  [INVOKE_CHANNELS.MODEL_CREATE]: [data: ModelCreateInput]
  [INVOKE_CHANNELS.MODEL_LIST]: []
  [INVOKE_CHANNELS.MODEL_UPDATE]: [data: ModelUpdateInput]
  [INVOKE_CHANNELS.MODEL_DELETE]: [id: string]
  [INVOKE_CHANNELS.TASK_CREATE]: [data: TaskCreateInput]
  [INVOKE_CHANNELS.TASK_GET]: [taskId: string]
  [INVOKE_CHANNELS.TASK_LIST]: [sessionId: string]
  [INVOKE_CHANNELS.TASK_UPDATE]: [data: TaskUpdateInput]
  [INVOKE_CHANNELS.TOOL_APPROVAL_LIST]: [] | [input?: ToolApprovalListInput]
  [INVOKE_CHANNELS.TOOL_APPROVAL_RESOLVE]: [input: ToolApprovalResolveInput]
  [INVOKE_CHANNELS.TASK_CONTINUATION_GET_STATUS]: [sessionId: string]
  [INVOKE_CHANNELS.TASK_CONTINUATION_ABORT]: [sessionId: string]
  [INVOKE_CHANNELS.TASK_CONTINUATION_SET_TODOS]: [input: { sessionId: string; todos: Todo[] }]
  [INVOKE_CHANNELS.TASK_CONTINUATION_GET_CONFIG]: []
  [INVOKE_CHANNELS.TASK_CONTINUATION_SET_CONFIG]: [config: Partial<TaskContinuationConfig>]
  [INVOKE_CHANNELS.BACKGROUND_TASK_LIST]: [] | [input?: BackgroundTaskListInput]
  [INVOKE_CHANNELS.BACKGROUND_TASK_GET_OUTPUT]: [input: BackgroundTaskGetOutputInput]
  [INVOKE_CHANNELS.BACKGROUND_TASK_CANCEL]: [input: BackgroundTaskCancelInput]
  [INVOKE_CHANNELS.BACKGROUND_TASK_STATS]: []
  [INVOKE_CHANNELS.ARTIFACT_GET]: [artifactId: string]
  [INVOKE_CHANNELS.ARTIFACT_LIST]:
    | [sessionId: string]
    | [sessionId: string, includeContent: boolean]
    | [input: { sessionId: string; includeContent?: boolean }]
  [INVOKE_CHANNELS.ARTIFACT_DOWNLOAD]: [artifactId: string] | [artifactId: string, workDir: string]
  [INVOKE_CHANNELS.ARTIFACT_DELETE]: [artifactId: string]
  [INVOKE_CHANNELS.FILE_READ]: [filePath: string, sessionId: string]
  [INVOKE_CHANNELS.FILE_WRITE]: [input: FileWriteInput]
  [INVOKE_CHANNELS.FILE_TREE_GET]: [rootDir: string] | [rootDir: string, relativePath: string]
  [INVOKE_CHANNELS.FILE_TREE_WATCH]: [watchId: string, rootDir: string]
  [INVOKE_CHANNELS.FILE_TREE_UNWATCH]: [watchId: string]
  [INVOKE_CHANNELS.SHELL_OPEN_PATH]: [filePath: string]
  [INVOKE_CHANNELS.BROWSER_CREATE]: [data: { viewId: string; url?: string }]
  [INVOKE_CHANNELS.BROWSER_DESTROY]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_SHOW]: [data: { viewId: string; bounds: BrowserViewBounds }]
  [INVOKE_CHANNELS.BROWSER_HIDE]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_RESIZE]: [data: { viewId: string; bounds: BrowserViewBounds }]
  [INVOKE_CHANNELS.BROWSER_NAVIGATE]: [data: { viewId: string; url: string }]
  [INVOKE_CHANNELS.BROWSER_GO_BACK]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_GO_FORWARD]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_RELOAD]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_STOP]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_GET_STATE]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_LIST_TABS]: []
  [INVOKE_CHANNELS.BROWSER_CAPTURE]: [data: { viewId: string }]
  [INVOKE_CHANNELS.BROWSER_EXECUTE_JS]: [data: { viewId: string; code: string }]
  [INVOKE_CHANNELS.BROWSER_ZOOM]: [data: { viewId: string; level: number }]
  [INVOKE_CHANNELS.BROWSER_SHOW_CONTEXT_MENU]: [options: BrowserMenuOptions]
  [INVOKE_CHANNELS.BROWSER_TOGGLE_DEVTOOLS]: [data: { viewId: string }]
  [INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES]: []
  [INVOKE_CHANNELS.UPDATER_DOWNLOAD_UPDATE]: []
  [INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL]: []
  [INVOKE_CHANNELS.DIALOG_SELECT_FOLDER]: []
  [INVOKE_CHANNELS.PROVIDER_CACHE_GET_STATS]: []
  [INVOKE_CHANNELS.PROVIDER_CACHE_IS_CONNECTED]: [provider: string]
  [INVOKE_CHANNELS.PROVIDER_CACHE_GET_AVAILABLE_MODELS]: []
  [INVOKE_CHANNELS.PROVIDER_CACHE_SET_STATUS]: [
    input: { provider: string; connected: boolean; error?: string }
  ]
  [INVOKE_CHANNELS.AUDIT_LOG_QUERY]: [] | [filter?: AuditLogFilter, options?: AuditLogQueryOptions]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_BY_ENTITY]: [entityType: string, entityId: string]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_BY_SESSION]: [sessionId: string]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_RECENT]: [limit: number]
  [INVOKE_CHANNELS.AUDIT_LOG_COUNT]: [] | [filter?: AuditLogFilter]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_FAILED]: [limit: number]
  [INVOKE_CHANNELS.AUDIT_LOG_EXPORT]: [format: AuditLogExportFormat, filter?: AuditLogFilter]
  [INVOKE_CHANNELS.KEYCHAIN_SET_PASSWORD]: [data: KeychainSetPasswordInput]
  [INVOKE_CHANNELS.KEYCHAIN_GET_PASSWORD]: [data: KeychainGetPasswordInput]
  [INVOKE_CHANNELS.KEYCHAIN_DELETE_PASSWORD]: [data: KeychainDeletePasswordInput]
  [INVOKE_CHANNELS.KEYCHAIN_LIST]: []
  [INVOKE_CHANNELS.KEYCHAIN_LIST_WITH_MODELS]: []
  [INVOKE_CHANNELS.KEYCHAIN_GET_WITH_MODELS]: [apiKeyId: string]
  [INVOKE_CHANNELS.BACKUP_LIST]: []
  [INVOKE_CHANNELS.BACKUP_CREATE]: [] | [name?: string]
  [INVOKE_CHANNELS.BACKUP_DELETE]: [filename: string]
  [INVOKE_CHANNELS.RESTORE_FROM_FILE]: [filePath: string]
  [INVOKE_CHANNELS.AGENT_BINDING_LIST]: []
  [INVOKE_CHANNELS.AGENT_BINDING_GET]: [agentCode: string]
  [INVOKE_CHANNELS.AGENT_BINDING_UPDATE]: [params: { agentCode: string; data: UpdateAgentBindingInput }]
  [INVOKE_CHANNELS.AGENT_BINDING_RESET]: [agentCode: string]
  [INVOKE_CHANNELS.CATEGORY_BINDING_LIST]: []
  [INVOKE_CHANNELS.CATEGORY_BINDING_GET]: [categoryCode: string]
  [INVOKE_CHANNELS.CATEGORY_BINDING_UPDATE]: [
    params: { categoryCode: string; data: UpdateCategoryBindingInput }
  ]
  [INVOKE_CHANNELS.CATEGORY_BINDING_RESET]: [categoryCode: string]
  [INVOKE_CHANNELS.AGENT_RUN_LIST]: [taskId: string]
  [INVOKE_CHANNELS.AGENT_RUN_GET]: [runId: string]
  [INVOKE_CHANNELS.AGENT_RUN_GET_LOGS]: [runId: string]
  [INVOKE_CHANNELS.WORKFLOW_OBSERVABILITY_GET]: [workflowTaskId: string]
  [INVOKE_CHANNELS.HOOK_GOVERNANCE_GET]: []
  [INVOKE_CHANNELS.HOOK_GOVERNANCE_SET]: [input: HookGovernanceUpdateInput]
  [INVOKE_CHANNELS.ARTIFACT_GET_DIFF]: [artifactId: string]
  [INVOKE_CHANNELS.ARTIFACT_ACCEPT]: [artifactId: string]
  [INVOKE_CHANNELS.ARTIFACT_REVERT]: [data: { artifactId: string; workDir: string }]
  [INVOKE_CHANNELS.ARTIFACT_STATS]: [sessionId: string]
  [INVOKE_CHANNELS.SETTING_GET]: [key: string] | [input: { key: string; spaceId?: string }]
  [INVOKE_CHANNELS.SETTING_SET]: [input: { key: string; value: unknown; spaceId?: string }]
  [INVOKE_CHANNELS.SETTING_GET_ALL]: [] | [input?: { spaceId?: string }]
  [INVOKE_CHANNELS.SETTING_GET_RESOLVED]:
    | [key: string]
    | [input: { key: string; spaceId?: string }]
  [INVOKE_CHANNELS.SETTING_SCHEMA_LIST]: []
  [INVOKE_CHANNELS.SESSION_STATE_GET]: [sessionId: string]
  [INVOKE_CHANNELS.SESSION_STATE_CHECKPOINT]: [sessionId: string]
  [INVOKE_CHANNELS.SESSION_RECOVERY_PLAN]: [sessionId: string]
  [INVOKE_CHANNELS.SESSION_RECOVERY_EXECUTE]: [sessionId: string]
  [INVOKE_CHANNELS.SESSION_RECOVERABLE_LIST]: []
  [INVOKE_CHANNELS.SESSION_RESUME_PROMPT]: [sessionId: string]
}

export interface IpcInvokeResponseMap {
  [INVOKE_CHANNELS.PING]: string
  [INVOKE_CHANNELS.SPACE_CREATE]: ApiResult<Space>
  [INVOKE_CHANNELS.SPACE_LIST]: ApiResult<Space[]>
  [INVOKE_CHANNELS.SPACE_GET]: ApiResult<Space | null>
  [INVOKE_CHANNELS.SPACE_UPDATE]: ApiResult<Space>
  [INVOKE_CHANNELS.SPACE_DELETE]: ApiResult<null>
  [INVOKE_CHANNELS.SESSION_CREATE]: Session
  [INVOKE_CHANNELS.SESSION_LIST]: Session[]
  [INVOKE_CHANNELS.SESSION_GET]: Session
  [INVOKE_CHANNELS.SESSION_UPDATE]: Session
  [INVOKE_CHANNELS.SESSION_DELETE]: void
  [INVOKE_CHANNELS.SESSION_GET_OR_CREATE_DEFAULT]: Session | null
  [INVOKE_CHANNELS.MESSAGE_SEND]: PersistedMessageRecord
  [INVOKE_CHANNELS.MESSAGE_LIST]: PersistedMessageRecord[]
  [INVOKE_CHANNELS.MESSAGE_STREAM]: unknown
  [INVOKE_CHANNELS.MESSAGE_ABORT]: MessageAbortResult
  [INVOKE_CHANNELS.SKILL_COMMAND_ITEMS]: SkillCommandItem[]
  [INVOKE_CHANNELS.MODEL_CREATE]: PersistedModel
  [INVOKE_CHANNELS.MODEL_LIST]: PersistedModel[]
  [INVOKE_CHANNELS.MODEL_UPDATE]: PersistedModel
  [INVOKE_CHANNELS.MODEL_DELETE]: PersistedModel
  [INVOKE_CHANNELS.TASK_CREATE]: Task
  [INVOKE_CHANNELS.TASK_GET]: Task
  [INVOKE_CHANNELS.TASK_LIST]: Task[]
  [INVOKE_CHANNELS.TASK_UPDATE]: Task
  [INVOKE_CHANNELS.TOOL_APPROVAL_LIST]: ToolApprovalRequest[]
  [INVOKE_CHANNELS.TOOL_APPROVAL_RESOLVE]: ToolApprovalResolveResult
  [INVOKE_CHANNELS.TASK_CONTINUATION_GET_STATUS]: TaskContinuationStatus
  [INVOKE_CHANNELS.TASK_CONTINUATION_ABORT]: { success: boolean }
  [INVOKE_CHANNELS.TASK_CONTINUATION_SET_TODOS]: { success: boolean }
  [INVOKE_CHANNELS.TASK_CONTINUATION_GET_CONFIG]: ApiResult<TaskContinuationConfig>
  [INVOKE_CHANNELS.TASK_CONTINUATION_SET_CONFIG]: ApiResult<TaskContinuationConfig>
  [INVOKE_CHANNELS.BACKGROUND_TASK_LIST]: ApiResult<BackgroundTaskRecord[]>
  [INVOKE_CHANNELS.BACKGROUND_TASK_GET_OUTPUT]: ApiResult<BackgroundTaskOutputResult>
  [INVOKE_CHANNELS.BACKGROUND_TASK_CANCEL]: ApiResult<{ taskId: string; cancelled: boolean }>
  [INVOKE_CHANNELS.BACKGROUND_TASK_STATS]: ApiResult<BackgroundTaskStats>
  [INVOKE_CHANNELS.ARTIFACT_GET]: Artifact
  [INVOKE_CHANNELS.ARTIFACT_LIST]: Artifact[]
  [INVOKE_CHANNELS.ARTIFACT_DOWNLOAD]: ApiResult<{ filePath: string }>
  [INVOKE_CHANNELS.ARTIFACT_DELETE]: ApiResult<null>
  [INVOKE_CHANNELS.FILE_READ]: FileReadResult
  [INVOKE_CHANNELS.FILE_WRITE]: FileWriteResult
  [INVOKE_CHANNELS.FILE_TREE_GET]: ApiResult<FileTreeNode>
  [INVOKE_CHANNELS.FILE_TREE_WATCH]: ApiResult<null>
  [INVOKE_CHANNELS.FILE_TREE_UNWATCH]: ApiResult<null>
  [INVOKE_CHANNELS.SHELL_OPEN_PATH]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_CREATE]: ApiResult<BrowserViewState>
  [INVOKE_CHANNELS.BROWSER_DESTROY]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_SHOW]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_HIDE]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_RESIZE]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_NAVIGATE]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_GO_BACK]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_GO_FORWARD]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_RELOAD]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_STOP]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_GET_STATE]: ApiResult<BrowserViewState | null>
  [INVOKE_CHANNELS.BROWSER_LIST_TABS]: ApiResult<BrowserViewState[]>
  [INVOKE_CHANNELS.BROWSER_CAPTURE]: ApiResult<string>
  [INVOKE_CHANNELS.BROWSER_EXECUTE_JS]: ApiResult<unknown>
  [INVOKE_CHANNELS.BROWSER_ZOOM]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_SHOW_CONTEXT_MENU]: ApiResult<null>
  [INVOKE_CHANNELS.BROWSER_TOGGLE_DEVTOOLS]: ApiResult<null>
  [INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES]: unknown
  [INVOKE_CHANNELS.UPDATER_DOWNLOAD_UPDATE]: void
  [INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL]: void
  [INVOKE_CHANNELS.DIALOG_SELECT_FOLDER]: ApiResult<string | null>
  [INVOKE_CHANNELS.PROVIDER_CACHE_GET_STATS]: unknown
  [INVOKE_CHANNELS.PROVIDER_CACHE_IS_CONNECTED]: boolean
  [INVOKE_CHANNELS.PROVIDER_CACHE_GET_AVAILABLE_MODELS]: string[]
  [INVOKE_CHANNELS.PROVIDER_CACHE_SET_STATUS]: { success: boolean }
  [INVOKE_CHANNELS.AUDIT_LOG_QUERY]: AuditLogEntry[]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_BY_ENTITY]: AuditLogEntry[]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_BY_SESSION]: AuditLogEntry[]
  [INVOKE_CHANNELS.AUDIT_LOG_GET_RECENT]: AuditLogEntry[]
  [INVOKE_CHANNELS.AUDIT_LOG_COUNT]: number
  [INVOKE_CHANNELS.AUDIT_LOG_GET_FAILED]: AuditLogEntry[]
  [INVOKE_CHANNELS.AUDIT_LOG_EXPORT]: AuditLogExportResult
  [INVOKE_CHANNELS.KEYCHAIN_SET_PASSWORD]: { id: string }
  [INVOKE_CHANNELS.KEYCHAIN_GET_PASSWORD]: string | null
  [INVOKE_CHANNELS.KEYCHAIN_DELETE_PASSWORD]: boolean
  [INVOKE_CHANNELS.KEYCHAIN_LIST]: ApiKeyEntry[]
  [INVOKE_CHANNELS.KEYCHAIN_LIST_WITH_MODELS]: ApiKeyWithModelsMasked[]
  [INVOKE_CHANNELS.KEYCHAIN_GET_WITH_MODELS]: ApiKeyWithModelsDecrypted | null
  [INVOKE_CHANNELS.BACKUP_LIST]: BackupMetadata[]
  [INVOKE_CHANNELS.BACKUP_CREATE]: string
  [INVOKE_CHANNELS.BACKUP_DELETE]: void
  [INVOKE_CHANNELS.RESTORE_FROM_FILE]: void
  [INVOKE_CHANNELS.AGENT_BINDING_LIST]: AgentBindingData[]
  [INVOKE_CHANNELS.AGENT_BINDING_GET]: AgentBindingData | null
  [INVOKE_CHANNELS.AGENT_BINDING_UPDATE]: AgentBindingData
  [INVOKE_CHANNELS.AGENT_BINDING_RESET]: AgentBindingData
  [INVOKE_CHANNELS.CATEGORY_BINDING_LIST]: CategoryBindingData[]
  [INVOKE_CHANNELS.CATEGORY_BINDING_GET]: CategoryBindingData | null
  [INVOKE_CHANNELS.CATEGORY_BINDING_UPDATE]: CategoryBindingData
  [INVOKE_CHANNELS.CATEGORY_BINDING_RESET]: CategoryBindingData
  [INVOKE_CHANNELS.AGENT_RUN_LIST]: AgentRunRecord[]
  [INVOKE_CHANNELS.AGENT_RUN_GET]: AgentRunDetail | null
  [INVOKE_CHANNELS.AGENT_RUN_GET_LOGS]: RunLogEntry[]
  [INVOKE_CHANNELS.WORKFLOW_OBSERVABILITY_GET]: WorkflowObservabilitySnapshot | null
  [INVOKE_CHANNELS.HOOK_GOVERNANCE_GET]: HookGovernanceStatus
  [INVOKE_CHANNELS.HOOK_GOVERNANCE_SET]: HookGovernanceUpdateResult
  [INVOKE_CHANNELS.ARTIFACT_GET_DIFF]: string | null
  [INVOKE_CHANNELS.ARTIFACT_ACCEPT]: ApiResult<null>
  [INVOKE_CHANNELS.ARTIFACT_REVERT]: ApiResult<null>
  [INVOKE_CHANNELS.ARTIFACT_STATS]: ArtifactSessionStats
  [INVOKE_CHANNELS.SETTING_GET]: string | null
  [INVOKE_CHANNELS.SETTING_SET]: { key: string; value: string | null }
  [INVOKE_CHANNELS.SETTING_GET_ALL]: Record<string, string | null>
  [INVOKE_CHANNELS.SETTING_GET_RESOLVED]: SettingResolvedResult
  [INVOKE_CHANNELS.SETTING_SCHEMA_LIST]: SettingSchemaDescriptor[]
  [INVOKE_CHANNELS.SESSION_STATE_GET]: SessionStateRecord | null
  [INVOKE_CHANNELS.SESSION_STATE_CHECKPOINT]: { success: boolean; error?: string }
  [INVOKE_CHANNELS.SESSION_RECOVERY_PLAN]: RecoveryPlan
  [INVOKE_CHANNELS.SESSION_RECOVERY_EXECUTE]: { success: boolean; error?: string }
  [INVOKE_CHANNELS.SESSION_RECOVERABLE_LIST]: SessionStateRecord[]
  [INVOKE_CHANNELS.SESSION_RESUME_PROMPT]: string
}

export interface IpcEventArgsMap {
  [EVENT_CHANNELS.BROWSER_ZOOM_CHANGED]: [payload: BrowserZoomChanged]
  [EVENT_CHANNELS.BROWSER_STATE_CHANGED]: [payload: BrowserStateChange]
  [EVENT_CHANNELS.BROWSER_PANEL_SHOW]: []
  [EVENT_CHANNELS.BROWSER_AI_OPERATION]: [payload: BrowserAiOperationPayload]
  [EVENT_CHANNELS.TASK_STATUS_CHANGED]: [payload: TaskStatusChangedPayload]
  [EVENT_CHANNELS.TOOL_APPROVAL_UPDATED]: [payload: { request: ToolApprovalRequest }]
  [EVENT_CHANNELS.BACKGROUND_TASK_STARTED]: [payload: { task: BackgroundTaskRecord }]
  [EVENT_CHANNELS.BACKGROUND_TASK_OUTPUT]: [
    payload: { taskId: string; stream: 'stdout' | 'stderr'; data: string; timestamp: string }
  ]
  [EVENT_CHANNELS.BACKGROUND_TASK_COMPLETED]: [
    payload: { task: BackgroundTaskRecord; exitCode: number | null; signal: string | null }
  ]
  [EVENT_CHANNELS.BACKGROUND_TASK_CANCELLED]: [payload: { task: BackgroundTaskRecord }]
  [EVENT_CHANNELS.HOOK_AUDIT_APPENDED]: [payload: { record: HookGovernanceAuditRecord }]
  [EVENT_CHANNELS.AGENT_RUN_UPDATE]: [payload: { runId: string }]
  [EVENT_CHANNELS.ARTIFACT_CREATED]: [payload: { artifactId: string }]
  [EVENT_CHANNELS.MESSAGE_STREAM_CHUNK]: [payload: MessageStreamChunkPayload]
  [EVENT_CHANNELS.MESSAGE_STREAM_ERROR]: [payload: MessageStreamErrorPayload]
  [EVENT_CHANNELS.MESSAGE_STREAM_USAGE]: [payload: MessageStreamUsagePayload]
  [EVENT_CHANNELS.UPDATER_CHECKING_FOR_UPDATE]: []
  [EVENT_CHANNELS.UPDATER_UPDATE_AVAILABLE]: [info: unknown]
  [EVENT_CHANNELS.UPDATER_UPDATE_NOT_AVAILABLE]: [info: unknown]
  [EVENT_CHANNELS.UPDATER_ERROR]: [error: string]
  [EVENT_CHANNELS.UPDATER_DOWNLOAD_PROGRESS]: [progress: unknown]
  [EVENT_CHANNELS.UPDATER_UPDATE_DOWNLOADED]: [info: unknown]
  [EVENT_CHANNELS.SESSION_CRASH_DETECTED]: [payload: CrashInfo]
  [EVENT_CHANNELS.SESSION_RECOVERY_PROGRESS]: [payload: SessionRecoveryEventPayload]
  [EVENT_CHANNELS.SESSION_RECOVERED]: [payload: SessionRecoveryEventPayload]
  [EVENT_CHANNELS.FILE_TREE_CHANGED]: [watchId: string, event: FileWatchEvent]
}

export type IpcInvokeChannel = keyof IpcInvokeArgsMap & InvokeChannel
export type IpcEventChannel = keyof IpcEventArgsMap & EventChannel

export type IpcInvokeArgs<C extends IpcInvokeChannel> = IpcInvokeArgsMap[C]
export type IpcInvokeResponse<C extends IpcInvokeChannel> = IpcInvokeResponseMap[C]
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventArgsMap[C]

export const IPC_CONTRACT_ASSERTIONS = {
  invokeArgs: true,
  invokeResponses: true,
  eventArgs: true
} satisfies {
  invokeArgs: Exclude<InvokeChannel, keyof IpcInvokeArgsMap> extends never ? true : never
  invokeResponses: Exclude<InvokeChannel, keyof IpcInvokeResponseMap> extends never ? true : never
  eventArgs: Exclude<EventChannel, keyof IpcEventArgsMap> extends never ? true : never
}

export type {
  HookGovernanceAuditRecord,
  HookGovernanceStatus,
  HookGovernanceUpdateInput,
  HookGovernanceUpdateResult
} from './hook-governance-contract'

/**
 * CodeAll IPC Channel Definitions
 *
 * This file acts as the Single Source of Truth for all IPC channels in the application.
 * All channels are categorized by their communication pattern.
 */

/**
 * Invoke Channels (Renderer -> Main, Request-Response)
 * Used with `ipcRenderer.invoke` and `ipcMain.handle`
 */
export const INVOKE_CHANNELS = {
  // Ping
  PING: 'ping',

  // Space Operations
  SPACE_CREATE: 'space:create',
  SPACE_LIST: 'space:list',
  SPACE_GET: 'space:get',
  SPACE_UPDATE: 'space:update',
  SPACE_DELETE: 'space:delete',

  // Session Operations
  SESSION_CREATE: 'session:create',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_UPDATE: 'session:update',
  SESSION_DELETE: 'session:delete',
  SESSION_GET_OR_CREATE_DEFAULT: 'session:get-or-create-default',

  // Message Operations
  MESSAGE_SEND: 'message:send',
  MESSAGE_LIST: 'message:list',
  MESSAGE_STREAM: 'message:stream',
  MESSAGE_STREAM_CHUNK: 'message:stream-chunk',

  // Model Operations
  MODEL_CREATE: 'model:create',
  MODEL_LIST: 'model:list',
  MODEL_UPDATE: 'model:update',
  MODEL_DELETE: 'model:delete',

  // Task Operations
  TASK_CREATE: 'task:create',
  TASK_GET: 'task:get',
  TASK_LIST: 'task:list',
  TASK_UPDATE: 'task:update',

  // Task Continuation
  TASK_CONTINUATION_GET_STATUS: 'task-continuation:get-status',
  TASK_CONTINUATION_ABORT: 'task-continuation:abort',
  TASK_CONTINUATION_SET_TODOS: 'task-continuation:set-todos',

  // Artifact Operations
  ARTIFACT_GET: 'artifact:get',
  ARTIFACT_LIST: 'artifact:list',
  ARTIFACT_DOWNLOAD: 'artifact:download',
  ARTIFACT_DELETE: 'artifact:delete',

  // File Operations
  FILE_READ: 'file:read',

  // Shell Operations
  SHELL_OPEN_PATH: 'shell:open-path',

  // Browser Operations
  BROWSER_CREATE: 'browser:create',
  BROWSER_DESTROY: 'browser:destroy',
  BROWSER_SHOW: 'browser:show',
  BROWSER_HIDE: 'browser:hide',
  BROWSER_RESIZE: 'browser:resize',
  BROWSER_NAVIGATE: 'browser:navigate',
  BROWSER_GO_BACK: 'browser:go-back',
  BROWSER_GO_FORWARD: 'browser:go-forward',
  BROWSER_RELOAD: 'browser:reload',
  BROWSER_STOP: 'browser:stop',
  BROWSER_GET_STATE: 'browser:get-state',
  BROWSER_CAPTURE: 'browser:capture',
  BROWSER_EXECUTE_JS: 'browser:execute-js',
  BROWSER_ZOOM: 'browser:zoom',
  BROWSER_SHOW_CONTEXT_MENU: 'browser:show-context-menu',
  BROWSER_TOGGLE_DEVTOOLS: 'browser:toggle-devtools',

  // Updater Operations
  UPDATER_CHECK_FOR_UPDATES: 'updater:check-for-updates',
  UPDATER_DOWNLOAD_UPDATE: 'updater:download-update',
  UPDATER_QUIT_AND_INSTALL: 'updater:quit-and-install',

  // Router Operations
  ROUTER_GET_RULES: 'router:get-rules',
  ROUTER_SAVE_RULES: 'router:save-rules',
  // Note: 'router:set-rules' is present in preload but mapped to 'router:save-rules' logic in main if mismatched.
  // We keep 'router:set-rules' here if it's used by frontend, or align with main.
  // Based on analysis: preload has 'router:set-rules', main has 'router:save-rules'.
  // We include both to reflect current codebase state, but mark distinctness.
  ROUTER_SET_RULES: 'router:set-rules',

  // Dialog Operations
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',

  // Provider Cache Operations
  PROVIDER_CACHE_GET_STATS: 'provider-cache:get-stats',
  PROVIDER_CACHE_IS_CONNECTED: 'provider-cache:is-connected',
  PROVIDER_CACHE_GET_AVAILABLE_MODELS: 'provider-cache:get-available-models',
  PROVIDER_CACHE_SET_STATUS: 'provider-cache:set-status',

  // Audit Log Operations
  AUDIT_LOG_QUERY: 'audit-log:query',
  AUDIT_LOG_GET_BY_ENTITY: 'audit-log:get-by-entity',
  AUDIT_LOG_GET_BY_SESSION: 'audit-log:get-by-session',
  AUDIT_LOG_GET_RECENT: 'audit-log:get-recent',
  AUDIT_LOG_COUNT: 'audit-log:count',
  AUDIT_LOG_GET_FAILED: 'audit-log:get-failed',
  AUDIT_LOG_EXPORT: 'audit-log:export',

  // Keychain Operations
  KEYCHAIN_SET_PASSWORD: 'keychain:set-password',
  KEYCHAIN_GET_PASSWORD: 'keychain:get-password',
  KEYCHAIN_DELETE_PASSWORD: 'keychain:delete-password',

  // Backup Operations
  BACKUP_LIST: 'backup:list',
  BACKUP_CREATE: 'backup:create',
  BACKUP_DELETE: 'backup:delete',
  RESTORE_FROM_FILE: 'restore:from-file'
} as const

/**
 * Event Channels (Main -> Renderer, One-way)
 * Used with `webContents.send` and `ipcRenderer.on`
 */
export const EVENT_CHANNELS = {
  // Browser Events
  BROWSER_ZOOM_CHANGED: 'browser:zoom-changed',
  BROWSER_STATE_CHANGED: 'browser:state-changed',

  // Updater Events
  UPDATER_CHECKING_FOR_UPDATE: 'updater:checking-for-update',
  UPDATER_UPDATE_AVAILABLE: 'updater:update-available',
  UPDATER_UPDATE_NOT_AVAILABLE: 'updater:update-not-available',
  UPDATER_ERROR: 'updater:error',
  UPDATER_DOWNLOAD_PROGRESS: 'updater:download-progress',
  UPDATER_UPDATE_DOWNLOADED: 'updater:update-downloaded'
} as const

/**
 * Internal Channels (Main Process Internal)
 * Not exposed to Renderer
 */
export const INTERNAL_CHANNELS = {
  // Add internal-only channels here if any exist in the future
} as const

export type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS]
export type InternalChannel = (typeof INTERNAL_CHANNELS)[keyof typeof INTERNAL_CHANNELS]

export type IpcChannel = InvokeChannel | EventChannel | InternalChannel

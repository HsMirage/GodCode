import { contextBridge, ipcRenderer } from 'electron'

type CodeAllAPIType = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

const ALLOWED_CHANNELS = [
  'ping',
  'space:create',
  'space:list',
  'space:get',
  'space:update',
  'space:delete',
  'dialog:select-folder',
  'session:create',
  'session:list',
  'session:get',
  'session:update',
  'session:delete',
  'session:get-or-create-default',
  'message:send',
  'message:list',
  'message:stream',
  'message:abort',
  'message:stream-chunk',
  'model:create',
  'model:list',
  'model:update',
  'model:delete',
  'task:create',
  'task:get',
  'task:list',
  'task:update',
  'background-task:list',
  'background-task:get-output',
  'background-task:cancel',
  'artifact:get',
  'artifact:list',
  'artifact:download',
  'artifact:delete',
  'file:read',
  'file:write',
  'shell:open-path',
  'browser:create',
  'browser:destroy',
  'browser:show',
  'browser:hide',
  'browser:resize',
  'browser:navigate',
  'browser:go-back',
  'browser:go-forward',
  'browser:reload',
  'browser:stop',
  'browser:get-state',
  'browser:list-tabs',
  'browser:capture',
  'browser:execute-js',
  'browser:zoom',
  'browser:show-context-menu',
  'browser:zoom-changed',
  'browser:state-changed',
  'updater:check-for-updates',
  'updater:download-update',
  'updater:quit-and-install',
  'updater:checking-for-update',
  'updater:update-available',
  'updater:update-not-available',
  'updater:error',
  'updater:download-progress',
  'updater:update-downloaded',
  // Keychain Operations
  'keychain:set-password',
  'keychain:get-password',
  'keychain:delete-password',
  'keychain:list',
  'keychain:list-with-models',
  'keychain:get-with-models',
  'backup:list',
  'backup:create',
  'backup:delete',
  'restore:from-file',
  // Agent Binding Operations
  'agent-binding:list',
  'agent-binding:get',
  'agent-binding:update',
  'agent-binding:reset',
  // Category Binding Operations
  'category-binding:list',
  'category-binding:get',
  'category-binding:update',
  'category-binding:reset',
  // Event Channels
  'browser:panel-show',
  'browser:ai-operation',
  'task:status-changed',
  'message:stream-error',
  'message:stream-usage',
  'background-task:started',
  'background-task:output',
  'background-task:completed',
  'background-task:cancelled',
  'agent-run:update',
  'artifact:created',
  // Agent Run Operations
  'agent-run:list',
  'agent-run:get',
  'agent-run:get-logs',
  // Workflow Observability Operations
  'workflow-observability:get',
  // Enhanced Artifact Operations
  'artifact:get-diff',
  'artifact:accept',
  'artifact:revert',
  'artifact:stats',
  // Task Continuation Operations
  'task-continuation:get-status',
  'task-continuation:abort',
  'task-continuation:set-todos',
  // Provider Cache Operations
  'provider-cache:get-stats',
  'provider-cache:is-connected',
  'provider-cache:get-available-models',
  'provider-cache:set-status',
  // Audit Log Operations
  'audit-log:query',
  'audit-log:get-by-entity',
  'audit-log:get-by-session',
  'audit-log:get-recent',
  'audit-log:count',
  'audit-log:get-failed',
  'audit-log:export',
  // Session Continuity Operations
  'session-state:get',
  'session-state:checkpoint',
  'session-recovery:plan',
  'session-recovery:execute',
  'session-recovery:list',
  'session-recovery:resume-prompt',
  // System Setting Operations
  'setting:get',
  'setting:set',
  'setting:get-all',
  // File Tree Operations
  'file-tree:get',
  'file-tree:watch',
  'file-tree:unwatch',
  'file-tree:changed'
] as const

type AllowedChannel = (typeof ALLOWED_CHANNELS)[number]

const isAllowedChannel = (channel: string): channel is AllowedChannel =>
  (ALLOWED_CHANNELS as readonly string[]).includes(channel)

const codeallAPI: CodeAllAPIType = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!isAllowedChannel(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!isAllowedChannel(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`)
    }
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('codeall', codeallAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.codeall = codeallAPI as never
}

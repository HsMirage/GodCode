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
  'model:create',
  'model:list',
  'model:update',
  'model:delete',
  'task:create',
  'task:get',
  'task:list',
  'task:update',
  'artifact:get',
  'artifact:list',
  'artifact:download',
  'artifact:delete',
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
  'browser:capture',
  'browser:execute-js',
  'browser:zoom',
  'browser:show-context-menu',
  'browser:zoom-changed'
] as const

const codeallAPI: CodeAllAPIType = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_CHANNELS.includes(channel as any)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_CHANNELS.includes(channel as any)) {
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

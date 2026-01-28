import { contextBridge, ipcRenderer } from 'electron'

const codeallAPI = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('codeall', codeallAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.codeall = codeallAPI
}

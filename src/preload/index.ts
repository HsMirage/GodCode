/**
 * CodeAll Preload Script
 *
 * This script runs in a privileged context before the renderer's web content loads.
 * It creates a secure bridge between the renderer process and the main process
 * using Electron's contextBridge API.
 *
 * Security considerations:
 * - contextIsolation must be enabled (prevents renderer from accessing Node.js)
 * - Only whitelisted IPC channels are exposed
 * - No direct access to ipcRenderer or other Electron APIs
 */

import { contextBridge } from 'electron'
import { createCodeAllAPI, type CodeAllAPI } from './api'

// Create the API instance
const codeallAPI = createCodeAllAPI()

// Expose the API to the renderer process
if (process.contextIsolated) {
  try {
    // Expose under 'codeall' namespace in window object
    contextBridge.exposeInMainWorld('codeall', codeallAPI)
  } catch (error) {
    console.error('[Preload] Failed to expose API:', error)
  }
} else {
  // Fallback for non-isolated contexts (development/testing)
  // This should not happen in production as contextIsolation should always be true
  console.warn('[Preload] Context isolation is disabled. Using direct window assignment.')
  ;(window as unknown as { codeall: CodeAllAPI }).codeall = codeallAPI
}

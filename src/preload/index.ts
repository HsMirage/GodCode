/**
 * GodCode Preload Script
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
import { GODCODE_RUNTIME_NAMESPACE, LEGACY_CODEALL_RUNTIME_NAMESPACE } from '../shared/brand-compat'
import { createGodCodeAPI, type GodCodeAPI } from './api'

// Create the API instance
const godcodeAPI = createGodCodeAPI()

// Expose the API to the renderer process
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld(GODCODE_RUNTIME_NAMESPACE, godcodeAPI)
    contextBridge.exposeInMainWorld(LEGACY_CODEALL_RUNTIME_NAMESPACE, godcodeAPI)
  } catch (error) {
    console.error('[Preload] Failed to expose API:', error)
  }
} else {
  // Fallback for non-isolated contexts (development/testing)
  // This should not happen in production as contextIsolation should always be true
  console.warn('[Preload] Context isolation is disabled. Using direct window assignment.')
  ;(window as unknown as { godcode: GodCodeAPI; codeall: GodCodeAPI }).godcode = godcodeAPI
  ;(window as unknown as { godcode: GodCodeAPI; codeall: GodCodeAPI }).codeall = godcodeAPI
}

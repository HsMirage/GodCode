/**
 * GodCode Preload API Definition
 *
 * This file defines the API exposed to the renderer process via contextBridge.
 * It uses the centralized IPC channel definitions from shared/ipc-channels.ts.
 */

import { ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '../shared/ipc-channels'

// Build allowed channel sets from the centralized definitions
const ALLOWED_INVOKE_CHANNELS = Object.values(INVOKE_CHANNELS)
const ALLOWED_EVENT_CHANNELS = Object.values(EVENT_CHANNELS)

// Combined set for validation
const ALL_ALLOWED_CHANNELS = new Set<string>([
  ...ALLOWED_INVOKE_CHANNELS,
  ...ALLOWED_EVENT_CHANNELS
])

/**
 * Type definition for the GodCode API exposed to renderer
 */
export interface GodCodeAPI {
  /**
   * Invoke an IPC channel and wait for a response (request-response pattern)
   * @param channel - The IPC channel name
   * @param args - Arguments to pass to the handler
   * @returns Promise resolving to the handler's response
   */
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>

  /**
   * Subscribe to an IPC event channel
   * @param channel - The event channel name
   * @param callback - Callback function to handle events
   * @returns Unsubscribe function
   */
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void

  /**
   * Remove a specific listener from an event channel
   * @param channel - The event channel name
   * @param callback - The callback function to remove
   */
  off: (channel: string, callback: (...args: unknown[]) => void) => void

  /**
   * Subscribe to an event channel for a single event only
   * @param channel - The event channel name
   * @param callback - Callback function to handle the event
   */
  once: (channel: string, callback: (...args: unknown[]) => void) => void
}

/**
 * Validates if a channel is allowed for IPC communication
 */
function isAllowedChannel(channel: string): boolean {
  return ALL_ALLOWED_CHANNELS.has(channel)
}

/**
 * Creates the GodCode API object
 */
export function createGodCodeAPI(): GodCodeAPI {
  return {
    invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
      if (!isAllowedChannel(channel)) {
        return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
      }
      return ipcRenderer.invoke(channel, ...args) as Promise<T>
    },

    on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
      if (!isAllowedChannel(channel)) {
        throw new Error(`IPC channel not allowed: ${channel}`)
      }
      const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        callback(...args)
      }
      ipcRenderer.on(channel, subscription)
      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener(channel, subscription)
      }
    },

    off: (channel: string, callback: (...args: unknown[]) => void): void => {
      if (!isAllowedChannel(channel)) {
        throw new Error(`IPC channel not allowed: ${channel}`)
      }
      ipcRenderer.removeListener(channel, callback)
    },

    once: (channel: string, callback: (...args: unknown[]) => void): void => {
      if (!isAllowedChannel(channel)) {
        throw new Error(`IPC channel not allowed: ${channel}`)
      }
      ipcRenderer.once(channel, (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        callback(...args)
      })
    }
  }
}

/**
 * Export channel constants for type-safe usage in renderer
 */
export { INVOKE_CHANNELS, EVENT_CHANNELS }

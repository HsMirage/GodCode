/**
 * Input Tools - Page interaction elements
 *
 * Tools for interacting with page elements (clicking, entering text).
 * Tool descriptions aligned with chrome-devtools-mcp for 100% compatibility.
 */

import type { BrowserTool, ClickParams, FillParams } from '../types'

export const clickTool: BrowserTool = {
  name: 'browser_click',
  description: 'Click on an element identified by its UID from the accessibility tree snapshot',
  parameters: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'The UID of the element from browser_snapshot'
      }
    },
    required: ['uid']
  },
  execute: async (params, context) => {
    const { uid } = params as ClickParams
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const result = await webContents.executeJavaScript(`
        const el = document.querySelector('[data-uid="${uid}"]')
        if (el) {
          el.click()
          true
        } else {
          false
        }
      `)

      if (!result) {
        return { success: false, error: 'Element not found with UID: ' + uid }
      }

      return { success: true, data: { uid } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const fillTool: BrowserTool = {
  name: 'browser_fill',
  description: 'Fill an input field with a value',
  parameters: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'The UID of the input element from browser_snapshot'
      },
      value: {
        type: 'string',
        description: 'The value to fill in the input field'
      }
    },
    required: ['uid', 'value']
  },
  execute: async (params, context) => {
    const { uid, value } = params as FillParams
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const result = await webContents.executeJavaScript(`
        const el = document.querySelector('[data-uid="${uid}"]')
        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          el.value = ${JSON.stringify(value)}
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          true
        } else {
          false
        }
      `)

      if (!result) {
        return { success: false, error: 'Input element not found with UID: ' + uid }
      }

      return { success: true, data: { uid, value } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

/*
 * Copyright (c) 2025 CodeAll. All rights reserved.
 */

import { BrowserTool, ExtractResult, AccessibilityNode } from '../types'

export const snapshotTool: BrowserTool = {
  name: 'browser_snapshot',
  description: 'Get accessibility tree snapshot with UIDs for each interactive element',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async (params, context) => {
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const snapshot = (await webContents.executeJavaScript(`
        (() => {
          let uidCounter = 0
          const tree = []
          
          const selectors = 'a, button, input, textarea, select, [role="button"], [onclick]'
          const elements = document.querySelectorAll(selectors)
          
          elements.forEach(el => {
            const uid = 'uid-' + (uidCounter++)
            el.setAttribute('data-uid', uid)
            
            tree.push({
              uid,
              role: el.tagName.toLowerCase(),
              name: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent?.trim().slice(0, 50) || '',
              value: el instanceof HTMLInputElement ? el.value : undefined
            })
          })
          
          return { tree, count: uidCounter }
        })()
      `)) as { tree: AccessibilityNode[]; count: number }

      return { success: true, data: snapshot }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const screenshotTool: BrowserTool = {
  name: 'browser_screenshot',
  description: 'Capture a screenshot of the current page',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async (params, context) => {
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const image = await webContents.capturePage()
      const base64 = image.toDataURL()

      return { success: true, data: { image: base64 } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const extractTool: BrowserTool = {
  name: 'browser_extract',
  description: 'Extract text content and links from the current page',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async (params, context) => {
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const extracted: ExtractResult = await webContents.executeJavaScript(`
        (() => {
          const text = document.body.innerText
          const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
            text: a.textContent?.trim() || '',
            url: a.href
          }))
          
          return { text, links }
        })()
      `)

      return { success: true, data: extracted }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

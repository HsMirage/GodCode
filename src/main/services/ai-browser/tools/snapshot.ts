/*
 * Copyright (c) 2025 CodeAll. All rights reserved.
 */

import { BrowserTool, ExtractResult, AccessibilityNode, ToolResult } from '../types'
import { writeFileSync } from 'fs'

export const takeSnapshotTool: BrowserTool = {
  name: 'browser_snapshot',
  description: 'Get accessibility tree snapshot with UIDs for each interactive element',
  parameters: {
    type: 'object',
    properties: {
      verbose: {
        type: 'boolean',
        description:
          'Whether to include all possible information available in the full a11y tree. Default is false.'
      },
      filePath: {
        type: 'string',
        description:
          'The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.'
      }
    }
  },
  execute: async (params, context) => {
    const { webContents } = context
    const verbose = (params.verbose as boolean) || false
    const filePath = params.filePath as string | undefined

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      // Existing CodeAll snapshot logic, enhanced
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
          
          return { tree, count: uidCounter, url: document.location.href, title: document.title }
        })()
      `)) as { tree: AccessibilityNode[]; count: number; url: string; title: string }

      const formatted = JSON.stringify(snapshot, null, 2)

      if (filePath) {
        writeFileSync(filePath, formatted, 'utf-8')
        return {
          success: true,
          data: {
            message: `Snapshot saved to: ${filePath}\n\nPage: ${snapshot.title}\nURL: ${snapshot.url}\nElements: ${snapshot.tree.length}`
          }
        }
      }

      return { success: true, data: snapshot }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const takeScreenshotTool: BrowserTool = {
  name: 'browser_screenshot',
  description: 'Capture a screenshot of the current page',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        description: 'Type of format to save the screenshot as. Default is "png"',
        // @ts-ignore
        enum: ['png', 'jpeg', 'webp']
      },
      quality: {
        type: 'number',
        description: 'Compression quality for JPEG and WebP formats (0-100).'
      },
      uid: {
        type: 'string',
        description:
          'The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.'
      },
      fullPage: {
        type: 'boolean',
        description:
          'If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.'
      },
      filePath: {
        type: 'string',
        description: 'The absolute path to save the screenshot to.'
      }
    }
  },
  execute: async (params, context) => {
    const { webContents } = context
    const format = (params.format as string) || 'png'
    const filePath = params.filePath as string | undefined
    // Note: fullPage and uid require CDP or scroll logic not currently in simple webContents.capturePage()
    // For now we implement basic viewport screenshot which works with webContents

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const image = await webContents.capturePage()
      const buffer =
        format === 'jpeg' ? image.toJPEG((params.quality as number) || 75) : image.toPNG()

      if (filePath) {
        writeFileSync(filePath, buffer)
        return { success: true, data: { message: `Saved screenshot to ${filePath}` } }
      }

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

export const evaluateScriptTool: BrowserTool = {
  name: 'browser_evaluate',
  description: 'Evaluate a JavaScript function inside the currently selected page.',
  parameters: {
    type: 'object',
    properties: {
      function: {
        type: 'string',
        description: 'A JavaScript function declaration to be executed.'
      },
      args: {
        type: 'array',
        description: 'An optional list of arguments to pass to the function.',
        // @ts-ignore
        items: {
          type: 'object',
          properties: {
            uid: {
              type: 'string',
              description: 'The uid of an element on the page'
            }
          },
          required: ['uid']
        }
      }
    },
    required: ['function']
  },
  execute: async (params, context): Promise<ToolResult> => {
    const fn = params.function as string
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      // Simple evaluation without element resolution for now
      // A full implementation would parse the function and args
      const result = await webContents.executeJavaScript(`
        (${fn})()
      `)

      return {
        success: true,
        data: {
          output: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const snapshotTools: BrowserTool[] = [
  takeSnapshotTool,
  takeScreenshotTool,
  extractTool,
  evaluateScriptTool
]

// Backward compatibility exports for existing tools
export const snapshotTool = takeSnapshotTool
export const screenshotTool = takeScreenshotTool

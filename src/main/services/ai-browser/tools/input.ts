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
      },
      dblClick: {
        type: 'boolean',
        description: 'Set to true for double clicks. Default is false.'
      }
    },
    required: ['uid']
  },
  execute: async (params, context) => {
    const { uid, dblClick } = params as unknown as ClickParams & { dblClick?: boolean }
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      // CodeAll original implementation
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

      // Handle double click if requested
      if (dblClick) {
        await webContents.executeJavaScript(`
          const el = document.querySelector('[data-uid="${uid}"]')
          if (el) {
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          }
        `)
      }

      return {
        success: true,
        data: {
          uid,
          message: dblClick
            ? 'Successfully double clicked on the element'
            : 'Successfully clicked on the element'
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }
}

export const hoverTool: BrowserTool = {
  name: 'browser_hover',
  description: 'Hover over the provided element',
  parameters: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'The uid of an element on the page from the page content snapshot'
      }
    },
    required: ['uid']
  },
  execute: async (params, context) => {
    const uid = params.uid as string
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      // Basic implementation using JS since CDP might not be available in all contexts
      const result = await webContents.executeJavaScript(`
        const el = document.querySelector('[data-uid="${uid}"]')
        if (el) {
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          true
        } else {
          false
        }
      `)

      if (!result) {
        return { success: false, error: 'Element not found with UID: ' + uid }
      }

      return { success: true, data: { message: 'Successfully hovered over the element' } }
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
    const { uid, value } = params as unknown as FillParams
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      const result = await webContents.executeJavaScript(`
        const el = document.querySelector('[data-uid="${uid}"]')
        if (el) {
          if (el.tagName.toLowerCase() === 'select' || el.role === 'combobox') {
            // Handle select/combobox
            // Try to find option with matching text or value
            let found = false;
            for (let i = 0; i < el.options.length; i++) {
              if (el.options[i].text === ${JSON.stringify(value)} || el.options[i].value === ${JSON.stringify(value)}) {
                el.selectedIndex = i;
                found = true;
                break;
              }
            }
            if (!found) {
               // Try to match partial text
               for (let i = 0; i < el.options.length; i++) {
                 if (el.options[i].text.includes(${JSON.stringify(value)})) {
                   el.selectedIndex = i;
                   found = true;
                   break;
                 }
               }
            }
          } else {
            // Handle regular input/textarea
            el.value = ${JSON.stringify(value)}
          }
          
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

export const fillFormTool: BrowserTool = {
  name: 'browser_fill_form',
  description: 'Fill out multiple form elements at once',
  parameters: {
    type: 'object',
    properties: {
      elements: {
        type: 'array',
        description: 'Elements from snapshot to fill out.',
        // @ts-ignore
        items: {
          type: 'object',
          properties: {
            uid: { type: 'string', description: 'The uid of the element to fill out' },
            value: { type: 'string', description: 'Value for the element' }
          },
          required: ['uid', 'value']
        }
      }
    },
    required: ['elements']
  },
  execute: async (params, context) => {
    const elements = params.elements as Array<{ uid: string; value: string }>
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    const errors: string[] = []

    for (const elem of elements) {
      try {
        await webContents.executeJavaScript(`
          const el = document.querySelector('[data-uid="${elem.uid}"]')
          if (el) {
            el.value = ${JSON.stringify(elem.value)}
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
        `)
      } catch (error) {
        errors.push(`${elem.uid}: ${(error as Error).message}`)
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: `Partially filled out the form. Errors:\n${errors.join('\n')}`
      }
    }

    return { success: true, data: { message: 'Successfully filled out the form' } }
  }
}

export const dragTool: BrowserTool = {
  name: 'browser_drag',
  description: 'Drag an element onto another element',
  parameters: {
    type: 'object',
    properties: {
      from_uid: {
        type: 'string',
        description: 'The uid of the element to drag'
      },
      to_uid: {
        type: 'string',
        description: 'The uid of the element to drop into'
      }
    },
    required: ['from_uid', 'to_uid']
  },
  execute: async (params, context) => {
    const fromUid = params.from_uid as string
    const toUid = params.to_uid as string
    const ctx = context as any

    if (!ctx.dragElement) {
      // If dragElement not implemented in context yet, return error or mock
      return { success: false, error: 'Drag functionality not available in this environment' }
    }

    try {
      await ctx.dragElement(fromUid, toUid)
      return { success: true, data: { message: 'Successfully dragged an element' } }
    } catch (error) {
      return { success: false, error: `Failed to drag: ${(error as Error).message}` }
    }
  }
}

export const pressKeyTool: BrowserTool = {
  name: 'browser_press_key',
  description:
    'Press a key or key combination. Use this when other input methods like fill() cannot be used.',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description:
          'A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R").'
      }
    },
    required: ['key']
  },
  execute: async (params, context) => {
    const key = params.key as string
    const { webContents } = context

    if (!webContents) {
      return { success: false, error: 'No active WebContents' }
    }

    try {
      // Electron sendInputEvent can handle some keys, but simple implementation:
      await webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
      await webContents.sendInputEvent({ type: 'keyUp', keyCode: key })

      // For more complex combinations, we rely on context.pressKey if available
      const ctx = context as any
      if (ctx.pressKey) {
        await ctx.pressKey(key)
      }

      return { success: true, data: { message: `Successfully pressed key: ${key}` } }
    } catch (error) {
      return { success: false, error: `Failed to press key: ${(error as Error).message}` }
    }
  }
}

export const uploadFileTool: BrowserTool = {
  name: 'browser_upload_file',
  description: 'Upload a file through a provided element.',
  parameters: {
    type: 'object',
    properties: {
      uid: {
        type: 'string',
        description: 'The uid of the file input element'
      },
      filePath: {
        type: 'string',
        description: 'The local path of the file to upload'
      }
    },
    required: ['uid', 'filePath']
  },
  execute: async (params, context) => {
    const uid = params.uid as string
    const filePath = params.filePath as string
    const ctx = context as any

    try {
      // If CDP available
      if (ctx.sendCDPCommand && ctx.getElementByUid) {
        const element = ctx.getElementByUid(uid)
        if (!element) {
          return { success: false, error: `Element not found: ${uid}` }
        }
        await ctx.sendCDPCommand('DOM.setFileInputFiles', {
          backendNodeId: element.backendNodeId,
          files: [filePath]
        })
      } else {
        // Fallback for simple Electron if possible, currently just return error if no CDP
        return { success: false, error: 'File upload requires CDP access which is not available' }
      }

      return { success: true, data: { message: `File uploaded from ${filePath}.` } }
    } catch (error) {
      return { success: false, error: `Failed to upload file: ${(error as Error).message}` }
    }
  }
}

export const inputTools: BrowserTool[] = [
  clickTool,
  hoverTool,
  fillTool,
  fillFormTool,
  dragTool,
  pressKeyTool,
  uploadFileTool
]

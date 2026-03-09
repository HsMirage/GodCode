/**
 * Navigation Tools - Browser navigation
 *
 * Adapted from hello-halo (https://github.com/openkursar/halo)
 * Copyright (c) OpenKursar
 * Licensed under MIT
 */

import type { BrowserTool, NavigateParams, ToolResult } from '../types'
import {
  browserViewManager,
  type BrowserViewState as BrowserPageState
} from '../../browser-view.service'

const getBrowserStates = (): BrowserPageState[] => browserViewManager.getAllStates()

/**
 * list_pages - List all open browser pages/tabs
 * Aligned with chrome-devtools-mcp: listPages
 */
export const listPagesTool: BrowserTool = {
  name: 'browser_list_pages',
  description: 'Get a list of pages open in the browser.',
  parameters: {
    type: 'object',
    properties: {}
  },
  execute: async (_params, _context): Promise<ToolResult> => {
    const states = getBrowserStates()

    if (states.length === 0) {
      return {
        success: true,
        data: { message: 'No browser pages are currently open.' }
      }
    }

    const lines = ['Open browser pages:']
    states.forEach((state, index) => {
      lines.push(`[${index}] ${state.title || 'Untitled'} - ${state.url || 'about:blank'}`)
    })

    return {
      success: true,
      data: {
        output: lines.join('\n'),
        pages: states
      }
    }
  }
}

/**
 * select_page - Select a page by index to make it active
 * Aligned with chrome-devtools-mcp: selectPage
 */
export const selectPageTool: BrowserTool = {
  name: 'browser_select_page',
  description: 'Select a page as a context for future tool calls.',
  parameters: {
    type: 'object',
    properties: {
      pageIdx: {
        type: 'number',
        description:
          'The index of the page to select. Call browser_list_pages to get available pages.'
      },
      bringToFront: {
        type: 'boolean',
        description: 'Whether to focus the page and bring it to the top.'
      }
    },
    required: ['pageIdx']
  },
  execute: async (params, context): Promise<ToolResult> => {
    const pageIdx = params.pageIdx as number
    const states = getBrowserStates()

    if (pageIdx < 0 || pageIdx >= states.length) {
      return {
        success: false,
        error: `Invalid page index: ${pageIdx}. Valid range: 0-${states.length - 1}`
      }
    }

    const state = states[pageIdx]

    context.setActiveViewId?.(state.id)

    // Also update browserViewManager if needed
    if (params.bringToFront) {
      // Logic to bring to front would go here
    }

    return {
      success: true,
      data: {
        message: `Selected page [${pageIdx}]: ${state.title || 'Untitled'} - ${state.url}`
      }
    }
  }
}

/**
 * new_page - Create a new browser page
 * Aligned with chrome-devtools-mcp: newPage
 */
export const newPageTool: BrowserTool = {
  name: 'browser_new_page',
  description: 'Creates a new page',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to load in a new page.'
      },
      timeout: {
        type: 'number',
        description:
          'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.'
      }
    },
    required: ['url']
  },
  execute: async (params, context): Promise<ToolResult> => {
    const url = params.url as string
    const timeout = (params.timeout as number) || 30000

    try {
      // Generate a unique view ID
      const viewId = `ai-browser-${Date.now()}`

      // Create the browser view
      await browserViewManager.create(viewId, url)

      // Set as active view in context
      context.setActiveViewId?.(viewId)

      // Wait for page load with timeout
      const startTime = Date.now()
      while (Date.now() - startTime < timeout) {
        const currentState = browserViewManager.getState(viewId)
        if (currentState && !currentState.isLoading) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const finalState = browserViewManager.getState(viewId)
      return {
        success: true,
        data: {
          message: `Created new page: ${finalState?.title || 'Untitled'} - ${finalState?.url || url}`,
          viewId
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to create new page: ${(error as Error).message}`
      }
    }
  }
}

/**
 * close_page - Close a browser page
 * Aligned with chrome-devtools-mcp: closePage
 */
export const closePageTool: BrowserTool = {
  name: 'browser_close_page',
  description: 'Closes the page by its index. The last open page cannot be closed.',
  parameters: {
    type: 'object',
    properties: {
      pageIdx: {
        type: 'number',
        description: 'The index of the page to close. Call list_pages to list pages.'
      }
    },
    required: ['pageIdx']
  },
  execute: async (params, _context): Promise<ToolResult> => {
    const pageIdx = params.pageIdx as number
    const states = getBrowserStates()

    if (pageIdx < 0 || pageIdx >= states.length) {
      return {
        success: false,
        error: `Invalid page index: ${pageIdx}`
      }
    }

    // Prevent closing the last page
    if (states.length === 1) {
      return {
        success: false,
        error: 'The last open page cannot be closed.'
      }
    }

    const state = states[pageIdx]
    browserViewManager.destroy(state.id)

    return {
      success: true,
      data: {
        message: `Closed page [${pageIdx}]: ${state.title || 'Untitled'}`
      }
    }
  }
}

/**
 * navigate_page - Navigate to a URL or perform navigation actions
 * Aligned with chrome-devtools-mcp: navigatePage
 */
export const navigateTool: BrowserTool = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in the browser',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Navigate the page by URL, back or forward in history, or reload.',
        // Schema enum uses literal union array
        enum: ['url', 'back', 'forward', 'reload']
      },
      url: {
        type: 'string',
        description: 'The URL to navigate to (http/https only)'
      },
      ignoreCache: {
        type: 'boolean',
        description: 'Whether to ignore cache on reload.'
      },
      timeout: {
        type: 'number',
        description:
          'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.'
      }
    }
    // No required fields because type defaults to 'url' and url is required only for type='url'
    // But schema validation might complain, so we handle it in code
  },
  execute: async (params, context) => {
    try {
      const type = (params.type as string) || 'url'
      const { url: rawUrl } = params as unknown as NavigateParams
      const timeout = (params.timeout as number) || 30000

      const { viewId } = context

      switch (type) {
        case 'back':
          browserViewManager.goBack(viewId)
          return { success: true, data: { message: `Successfully navigated back.` } }
        case 'forward':
          browserViewManager.goForward(viewId)
          return { success: true, data: { message: `Successfully navigated forward.` } }
        case 'reload':
          browserViewManager.reload(viewId)
          return { success: true, data: { message: `Successfully reloaded the page.` } }
        case 'url':
        default: {
          if (!rawUrl) {
            return { success: false, error: 'URL is required for navigation' }
          }

          let url = rawUrl
          // SECURITY: Local file access check
          if (url.startsWith('file://')) {
            return { success: false, error: 'Local file access forbidden' }
          }

          // SECURITY: Protocol enforcement
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`
          }

          await browserViewManager.navigate(viewId, url)
          break
        }
      }

      // Wait for navigation to complete
      const startTime = Date.now()
      while (Date.now() - startTime < timeout) {
        const state = browserViewManager.getState(viewId)
        if (state && !state.isLoading) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const finalState = browserViewManager.getState(viewId)
      return { success: true, data: { url: finalState?.url || rawUrl } }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

/**
 * wait_for - Wait for text to appear on the page
 * Aligned with chrome-devtools-mcp: waitFor
 */
export const waitForTool: BrowserTool = {
  name: 'browser_wait_for',
  description: 'Wait for the specified text to appear on the selected page.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to appear on the page'
      },
      timeout: {
        type: 'number',
        description:
          'Maximum wait time in milliseconds. If set to 0, the default timeout will be used.'
      }
    },
    required: ['text']
  },
  execute: async (params, context): Promise<ToolResult> => {
    const text = params.text as string
    const timeout = (params.timeout as number) || 30000

    try {
      await context.waitForText?.(text, timeout)
      return {
        success: true,
        data: {
          message: `Element with text "${text}" found.`
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Timeout waiting for text: "${text}"`
      }
    }
  }
}

/**
 * handle_dialog - Handle a browser dialog (alert, confirm, prompt)
 * Aligned with chrome-devtools-mcp: handleDialog
 */
export const handleDialogTool: BrowserTool = {
  name: 'browser_handle_dialog',
  description: 'If a browser dialog was opened, use this command to handle it',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Whether to dismiss or accept the dialog',
        // Schema enum uses literal union array
        enum: ['accept', 'dismiss']
      },
      promptText: {
        type: 'string',
        description: 'Optional prompt text to enter into the dialog.'
      }
    },
    required: ['action']
  },
  execute: async (params, context): Promise<ToolResult> => {
    const action = params.action as 'accept' | 'dismiss'
    const promptText = params.promptText as string | undefined

    const dialog = context.getPendingDialog?.()
    if (!dialog) {
      return {
        success: false,
        error: 'No open dialog found'
      }
    }

    try {
      await context.handleDialog?.(action === 'accept', promptText)
      return {
        success: true,
        data: {
          message: `Successfully ${action === 'accept' ? 'accepted' : 'dismissed'} the dialog`
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to handle dialog: ${(error as Error).message}`
      }
    }
  }
}

export const navigationTools: BrowserTool[] = [
  listPagesTool,
  selectPageTool,
  newPageTool,
  closePageTool,
  navigateTool,
  waitForTool,
  handleDialogTool
]

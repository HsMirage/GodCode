/**
 * Navigation Tools - Browser navigation
 *
 * Adapted from hello-halo (https://github.com/openkursar/halo)
 * Copyright (c) OpenKursar
 * Licensed under MIT
 */

import type { BrowserTool, NavigateParams } from '../types'
import { browserViewManager } from '../../browser-view.service'

export const navigateTool: BrowserTool = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in the browser',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to navigate to (http/https only)'
      }
    },
    required: ['url']
  },
  execute: async (params, context) => {
    try {
      const { url: rawUrl } = params as NavigateParams
      const { viewId } = context

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

      return { success: true, data: { url } }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { allTools } from '../../ai-browser/tools'
import { browserViewManager } from '../../browser-view.service'
import type { BrowserTool, BrowserToolContext } from '../../ai-browser/types'

// Helper to convert BrowserTool to generic Tool
function adaptBrowserTool(browserTool: BrowserTool): Tool {
  // Convert JSON Schema properties to ToolParameter[]
  const parameters = Object.entries(browserTool.parameters.properties).map(([name, prop]) => ({
    name,
    type:
      prop.type === 'string' ||
      prop.type === 'number' ||
      prop.type === 'boolean' ||
      prop.type === 'object' ||
      prop.type === 'array'
        ? prop.type
        : 'string', // Default fallback
    description: prop.description || '',
    required: browserTool.parameters.required?.includes(name) || false
  })) as any[] // Using any[] to bypass strict type matching for now, verified in implementation

  return {
    definition: {
      name: browserTool.name,
      description: browserTool.description,
      category: 'browser',
      parameters
    },
    execute: async (
      params: Record<string, any>,
      context: ToolExecutionContext
    ): Promise<ToolExecutionResult> => {
      // Logic to get or create a view for the session
      // For now, we'll use a deterministic view ID based on session ID
      // This means each session gets its own persistent browser tab
      const viewId = `session-${context.sessionId}`

      // Ensure view exists if it's a navigation command, or if we need to interact with it
      // For navigate, we might need to create it. For others, we need it to exist.

      // Check if view exists
      let viewState = browserViewManager.getState(viewId)

      if (!viewState && browserTool.name === 'browser_navigate') {
        // Auto-create view for navigation if it doesn't exist
        await browserViewManager.create(viewId)
        // We don't need to show it by default, but we could:
        // browserViewManager.show(viewId, { x: 0, y: 0, width: 1000, height: 800 })
      } else if (!viewState) {
        return {
          success: false,
          output: '',
          error: `No active browser session found. Please use 'browser_navigate' first to start a session.`
        }
      }

      const webContents = browserViewManager.getWebContents(viewId)

      const browserContext: BrowserToolContext = {
        viewId,
        webContents
      }

      try {
        const result = await browserTool.execute(params, browserContext)

        return {
          success: result.success,
          output: result.data ? JSON.stringify(result.data, null, 2) : '',
          error: result.error,
          metadata: {
            viewId,
            ...((result.data as any) || {})
          }
        }
      } catch (error) {
        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }
}

// Export adapted tools
export const browserNavigateTool = adaptBrowserTool(
  allTools.find(t => t.name === 'browser_navigate')!
)
export const browserClickTool = adaptBrowserTool(allTools.find(t => t.name === 'browser_click')!)
export const browserFillTool = adaptBrowserTool(allTools.find(t => t.name === 'browser_fill')!)
export const browserSnapshotTool = adaptBrowserTool(
  allTools.find(t => t.name === 'browser_snapshot')!
)
export const browserScreenshotTool = adaptBrowserTool(
  allTools.find(t => t.name === 'browser_screenshot')!
)
export const browserExtractTool = adaptBrowserTool(
  allTools.find(t => t.name === 'browser_extract')!
)

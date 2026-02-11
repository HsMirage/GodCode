import { BrowserWindow } from 'electron'
import type {
  Tool,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolParameter
} from '../tool.interface'
import { randomUUID } from 'crypto'
import { allTools } from '../../ai-browser/tools'
import { browserViewManager } from '../../browser-view.service'
import type { BrowserTool, BrowserToolContext } from '../../ai-browser/types'

// Helper function to notify renderer to open browser panel
function notifyBrowserPanelShow(): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    windows[0].webContents.send('browser:panel-show')
  }
}

// Helper function to notify renderer of AI operation status
function notifyAIOperation(payload: {
  toolName: string
  status: 'running' | 'completed' | 'error'
  viewId: string
  opId: string
  args?: Record<string, any>
  timestamp: number
}): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    windows[0].webContents.send('browser:ai-operation', payload)
  }
}

// Helper to convert BrowserTool to generic Tool
function adaptBrowserTool(browserTool: BrowserTool): Tool {
  // Convert JSON Schema properties to ToolParameter[]
  const parameters: ToolParameter[] = Object.entries(browserTool.parameters.properties).map(
    ([name, prop]) => ({
      name,
      type:
        prop.type === 'string' ||
        prop.type === 'number' ||
        prop.type === 'boolean' ||
        prop.type === 'object' ||
        prop.type === 'array'
          ? prop.type
          : 'string',
      description: prop.description || '',
      required: browserTool.parameters.required?.includes(name) || false
    })
  )

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
      const viewState = browserViewManager.getState(viewId)

      if (!viewState && browserTool.name === 'browser_navigate') {
        // Auto-create view for navigation if it doesn't exist
        await browserViewManager.create(viewId)
        // Notify renderer to open browser panel when AI starts using browser
        notifyBrowserPanelShow()
      } else if (!viewState) {
        return {
          success: false,
          output: '',
          error: `No active browser session found. Please use 'browser_navigate' first to start a session.`
        }
      }

      // Always notify browser panel show when AI interacts with browser
      notifyBrowserPanelShow()

      const opId = randomUUID()

      // Notify AI operation started (include viewId/opId so UI can correlate)
      notifyAIOperation({
        toolName: browserTool.name,
        status: 'running',
        viewId,
        opId,
        args: params,
        timestamp: Date.now()
      })

      const webContents = browserViewManager.getWebContents(viewId)

      const browserContext: BrowserToolContext = {
        viewId,
        webContents
      }

      try {
        const result = await browserTool.execute(params, browserContext)

        // Notify AI operation completed or error
        notifyAIOperation({
          toolName: browserTool.name,
          status: result.success ? 'completed' : 'error',
          viewId,
          opId,
          args: params,
          timestamp: Date.now()
        })

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
        // Notify AI operation error
        notifyAIOperation({
          toolName: browserTool.name,
          status: 'error',
          viewId,
          opId,
          args: params,
          timestamp: Date.now()
        })

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

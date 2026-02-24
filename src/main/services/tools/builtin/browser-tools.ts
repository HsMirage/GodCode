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
import type { BrowserTool, BrowserToolContext, JsonSchemaProperty } from '../../ai-browser/types'

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
  errorCode?: string
  durationMs?: number
}): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    windows[0].webContents.send('browser:ai-operation', payload)
  }
}

// Helper to convert BrowserTool to generic Tool
function formatBrowserValidationError(params: {
  toolName: string
  field: string
  reason: string
  value: unknown
}) {
  const printable =
    params.value === undefined
      ? 'undefined'
      : typeof params.value === 'string'
        ? JSON.stringify(params.value)
        : JSON.stringify(params.value)
  return `BROWSER_TOOL_VALIDATION tool=${params.toolName} field=${params.field} reason=${params.reason} value=${printable}`
}

function validatePropertyType(
  prop: JsonSchemaProperty,
  value: unknown,
  toolName: string,
  field: string
): string | null {
  if (value === undefined || value === null) {
    return null
  }

  switch (prop.type) {
    case 'string':
      if (typeof value !== 'string') {
        return formatBrowserValidationError({
          toolName,
          field,
          reason: 'expected string',
          value
        })
      }

      if (prop.enum && prop.enum.length > 0 && !prop.enum.includes(value)) {
        return formatBrowserValidationError({
          toolName,
          field,
          reason: `must be one of [${prop.enum.join(', ')}]`,
          value
        })
      }
      return null
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return formatBrowserValidationError({
          toolName,
          field,
          reason: 'expected number',
          value
        })
      }
      return null
    case 'boolean':
      if (typeof value !== 'boolean') {
        return formatBrowserValidationError({
          toolName,
          field,
          reason: 'expected boolean',
          value
        })
      }
      return null
    case 'array':
      if (!Array.isArray(value)) {
        return formatBrowserValidationError({
          toolName,
          field,
          reason: 'expected array',
          value
        })
      }
      return null
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        return formatBrowserValidationError({
          toolName,
          field,
          reason: 'expected object',
          value
        })
      }
      return null
    default:
      return null
  }
}

function validateBrowserToolParams(
  browserTool: BrowserTool,
  params: Record<string, any>
): string | null {
  const requiredFields = browserTool.parameters.required || []

  for (const requiredField of requiredFields) {
    if (!(requiredField in params) || params[requiredField] === undefined || params[requiredField] === null) {
      return formatBrowserValidationError({
        toolName: browserTool.name,
        field: requiredField,
        reason: 'required parameter missing',
        value: params[requiredField]
      })
    }
  }

  for (const [field, prop] of Object.entries(browserTool.parameters.properties)) {
    const maybeTypeError = validatePropertyType(prop, params[field], browserTool.name, field)
    if (maybeTypeError) {
      return maybeTypeError
    }
  }

  if (browserTool.name === 'browser_navigate') {
    const typeValue = (params.type as string | undefined) || 'url'
    if (typeValue === 'url' && !params.url) {
      return formatBrowserValidationError({
        toolName: browserTool.name,
        field: 'url',
        reason: 'URL is required for navigation when type=url',
        value: params.url
      })
    }
  }

  return null
}

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
      const executionStartAt = Date.now()

      const validationError = validateBrowserToolParams(browserTool, params)
      if (validationError) {
        notifyAIOperation({
          toolName: browserTool.name,
          status: 'error',
          viewId,
          opId: randomUUID(),
          args: params,
          timestamp: Date.now(),
          errorCode: 'BROWSER_TOOL_VALIDATION',
          durationMs: Date.now() - executionStartAt
        })

        return {
          success: false,
          output: '',
          error: validationError,
          metadata: {
            viewId,
            errorCode: 'BROWSER_TOOL_VALIDATION',
            toolName: browserTool.name,
            durationMs: Date.now() - executionStartAt
          }
        }
      }

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
        notifyAIOperation({
          toolName: browserTool.name,
          status: 'error',
          viewId,
          opId: randomUUID(),
          args: params,
          timestamp: Date.now(),
          errorCode: 'BROWSER_SESSION_REQUIRED',
          durationMs: Date.now() - executionStartAt
        })

        return {
          success: false,
          output: '',
          error: `No active browser session found. Please use 'browser_navigate' first to start a session.`,
          metadata: {
            viewId,
            errorCode: 'BROWSER_SESSION_REQUIRED',
            toolName: browserTool.name,
            durationMs: Date.now() - executionStartAt
          }
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
        timestamp: Date.now(),
        durationMs: 0
      })

      const webContents = browserViewManager.getWebContents(viewId)

      const browserContext: BrowserToolContext = {
        viewId,
        webContents
      }

      try {
        const result = await browserTool.execute(params, browserContext)

        // Notify AI operation completed or error
        const elapsedMs = Date.now() - executionStartAt
        notifyAIOperation({
          toolName: browserTool.name,
          status: result.success ? 'completed' : 'error',
          viewId,
          opId,
          args: params,
          timestamp: Date.now(),
          durationMs: elapsedMs,
          errorCode: result.success ? undefined : 'BROWSER_TOOL_EXECUTION_FAILED'
        })

        return {
          success: result.success,
          output: result.data ? JSON.stringify(result.data, null, 2) : '',
          error: result.error,
          metadata: {
            viewId,
            errorCode: result.success ? undefined : 'BROWSER_TOOL_EXECUTION_FAILED',
            durationMs: elapsedMs,
            toolName: browserTool.name,
            ...((result.data as any) || {})
          }
        }
      } catch (error) {
        const elapsedMs = Date.now() - executionStartAt

        // Notify AI operation error
        notifyAIOperation({
          toolName: browserTool.name,
          status: 'error',
          viewId,
          opId,
          args: params,
          timestamp: Date.now(),
          errorCode: 'BROWSER_TOOL_EXCEPTION',
          durationMs: elapsedMs
        })

        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            viewId,
            errorCode: 'BROWSER_TOOL_EXCEPTION',
            durationMs: elapsedMs,
            toolName: browserTool.name
          }
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

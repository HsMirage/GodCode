import type { Tool, ToolExecutionContext, ToolExecutionResult } from './tool.interface'
import type { BrowserTool, BrowserToolContext, ToolResult } from '../ai-browser/types'
import { toolRegistry } from './tool-registry'
import { defaultPolicy } from './permission-policy'
import { LoggerService } from '../logger'

/**
 * Configuration for tool execution loop
 */
export interface ToolExecutionConfig {
  /** Maximum number of tool iterations (default: 10) */
  maxIterations?: number
  /** Timeout per tool execution in milliseconds (default: 30000) */
  timeoutMs?: number
  /** Whether to stop on first error (default: false) */
  stopOnError?: boolean
}

/**
 * Represents a pending tool call from the LLM
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string
  /** Name of the tool to execute */
  name: string
  /** Arguments/parameters for the tool */
  arguments: Record<string, unknown>
}

/**
 * Result of a single tool execution
 */
export interface ToolExecutionOutput {
  /** The tool call that was executed */
  toolCall: ToolCall
  /** The execution result */
  result: ToolExecutionResult | ToolResult
  /** Whether execution succeeded */
  success: boolean
  /** Error message if execution failed */
  error?: string
  /** Execution time in milliseconds */
  durationMs: number
}

/**
 * Result of a complete execution loop iteration
 */
export interface LoopIterationResult {
  /** Results from all tool executions in this iteration */
  outputs: ToolExecutionOutput[]
  /** Whether all tools executed successfully */
  allSucceeded: boolean
  /** Total execution time for this iteration */
  totalDurationMs: number
}

/**
 * Unified tool type that can be either Tool or BrowserTool
 */
export type UnifiedTool = Tool | BrowserTool

/**
 * Check if a tool is a BrowserTool (has direct name/description properties)
 */
function isBrowserTool(tool: UnifiedTool): tool is BrowserTool {
  return 'name' in tool && 'description' in tool && !('definition' in tool)
}

/**
 * Centralized service for tool execution
 */
export class ToolExecutionService {
  private logger = LoggerService.getInstance().getLogger()
  private browserTools: Map<string, BrowserTool> = new Map()
  private defaultConfig: Required<ToolExecutionConfig> = {
    maxIterations: 10,
    timeoutMs: 30000,
    stopOnError: false
  }

  /**
   * Register browser tools for execution
   * These tools use the BrowserTool interface from ai-browser
   */
  registerBrowserTools(tools: BrowserTool[]): void {
    for (const tool of tools) {
      this.browserTools.set(tool.name, tool)
      this.logger.debug('Registered browser tool', { name: tool.name })
    }
  }

  /**
   * Clear all registered browser tools
   */
  clearBrowserTools(): void {
    this.browserTools.clear()
  }

  /**
   * Get all available tools (both registry and browser tools)
   */
  getAllTools(): UnifiedTool[] {
    const registryTools = toolRegistry.list()
    const browserToolsArray = Array.from(this.browserTools.values())
    return [...registryTools, ...browserToolsArray]
  }

  /**
   * Get tool definitions in Anthropic/OpenAI compatible format
   */
  getToolDefinitions(): Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }> {
    return this.getAllTools().map(tool => {
      if (isBrowserTool(tool)) {
        return {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      } else {
        const properties: Record<string, unknown> = {}
        const required: string[] = []

        for (const param of tool.definition.parameters) {
          properties[param.name] = {
            type: param.type,
            description: param.description,
            ...(param.default !== undefined && { default: param.default })
          }
          if (param.required) {
            required.push(param.name)
          }
        }

        return {
          name: tool.definition.name,
          description: tool.definition.description,
          parameters: {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined
          }
        }
      }
    })
  }

  /**
   * Execute a single tool call
   */
  async executeTool(
    toolCall: ToolCall,
    context: ToolExecutionContext | BrowserToolContext,
    config?: ToolExecutionConfig
  ): Promise<ToolExecutionOutput> {
    const timeoutMs = config?.timeoutMs ?? this.defaultConfig.timeoutMs
    const startTime = Date.now()

    if (!defaultPolicy.isAllowed(toolCall.name)) {
      this.logger.warn('Tool execution denied by policy', { toolName: toolCall.name })
      return {
        toolCall,
        result: {
          success: false,
          output: '',
          error: `Tool '${toolCall.name}' is not allowed by policy`
        },
        success: false,
        error: `Tool '${toolCall.name}' is not allowed by policy`,
        durationMs: Date.now() - startTime
      }
    }

    const browserTool = this.browserTools.get(toolCall.name)
    const registryTool = toolRegistry.get(toolCall.name)
    const tool = browserTool || registryTool

    if (!tool) {
      this.logger.error('Tool not found', { toolName: toolCall.name })
      return {
        toolCall,
        result: {
          success: false,
          output: '',
          error: `Tool '${toolCall.name}' not found`
        },
        success: false,
        error: `Tool '${toolCall.name}' not found`,
        durationMs: Date.now() - startTime
      }
    }

    try {
      this.logger.info('Executing tool', { toolName: toolCall.name, arguments: toolCall.arguments })

      const result = await this.executeWithTimeout(tool, toolCall.arguments, context, timeoutMs)

      const durationMs = Date.now() - startTime
      const success = 'success' in result ? result.success : true

      this.logger.info('Tool execution completed', {
        toolName: toolCall.name,
        success,
        durationMs
      })

      return {
        toolCall,
        result,
        success,
        error: success ? undefined : 'error' in result ? result.error : undefined,
        durationMs
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const durationMs = Date.now() - startTime

      this.logger.error('Tool execution failed', {
        toolName: toolCall.name,
        error: errorMessage,
        durationMs
      })

      return {
        toolCall,
        result: {
          success: false,
          output: '',
          error: `Tool execution failed: ${errorMessage}`
        },
        success: false,
        error: errorMessage,
        durationMs
      }
    }
  }

  /**
   * Execute multiple tool calls in sequence
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    context: ToolExecutionContext | BrowserToolContext,
    config?: ToolExecutionConfig
  ): Promise<LoopIterationResult> {
    const stopOnError = config?.stopOnError ?? this.defaultConfig.stopOnError
    const outputs: ToolExecutionOutput[] = []
    const startTime = Date.now()
    let allSucceeded = true

    for (const toolCall of toolCalls) {
      const output = await this.executeTool(toolCall, context, config)
      outputs.push(output)

      if (!output.success) {
        allSucceeded = false
        if (stopOnError) {
          this.logger.warn('Stopping tool execution loop due to error', {
            toolName: toolCall.name,
            error: output.error
          })
          break
        }
      }
    }

    return {
      outputs,
      allSucceeded,
      totalDurationMs: Date.now() - startTime
    }
  }

  /**
   * Create a tool execution loop callback for use with LLM adapters
   *
   * This returns a function that can be called repeatedly by an LLM adapter
   * to execute tool calls and get results for the next iteration.
   */
  createLoopExecutor(
    context: ToolExecutionContext | BrowserToolContext,
    config?: ToolExecutionConfig
  ): (toolCalls: ToolCall[]) => Promise<LoopIterationResult> {
    const mergedConfig = { ...this.defaultConfig, ...config }
    let iterationCount = 0

    return async (toolCalls: ToolCall[]): Promise<LoopIterationResult> => {
      iterationCount++

      if (iterationCount > mergedConfig.maxIterations) {
        this.logger.warn('Max tool iterations exceeded', {
          maxIterations: mergedConfig.maxIterations,
          currentIteration: iterationCount
        })
        return {
          outputs: [],
          allSucceeded: false,
          totalDurationMs: 0
        }
      }

      this.logger.debug('Tool loop iteration', {
        iteration: iterationCount,
        toolCount: toolCalls.length
      })

      return this.executeToolCalls(toolCalls, context, mergedConfig)
    }
  }

  /**
   * Execute a tool with timeout
   */
  private async executeWithTimeout(
    tool: UnifiedTool,
    args: Record<string, unknown>,
    context: ToolExecutionContext | BrowserToolContext,
    timeoutMs: number
  ): Promise<ToolExecutionResult | ToolResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      const executePromise = isBrowserTool(tool)
        ? tool.execute(args, context as BrowserToolContext)
        : tool.execute(args, context as ToolExecutionContext)

      executePromise
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Format tool results for sending back to LLM
   * Returns results in a format suitable for Anthropic's tool_result blocks
   */
  formatResultsForLLM(outputs: ToolExecutionOutput[]): Array<{
    tool_use_id: string
    content: string
  }> {
    return outputs.map(output => ({
      tool_use_id: output.toolCall.id,
      content: JSON.stringify(output.result)
    }))
  }
}

export const toolExecutionService = new ToolExecutionService()

import type { Tool, ToolExecutionContext, ToolExecutionResult } from './tool.interface'
import type { BrowserTool, BrowserToolContext, ToolResult } from '../ai-browser/types'
import { toolRegistry } from './tool-registry'
import { defaultPolicy, type ToolExecutionPermissionPreview } from './permission-policy'
import { LoggerService } from '../logger'
import { hookManager } from '../hooks'
import { AsyncLocalStorage } from 'node:async_hooks'
import { ToolApprovalRequiredError, toolApprovalService } from './tool-approval.service'
import { executionEventPersistenceService } from '../execution-event-persistence.service'
import { buildUnifiedRetryDecision, type UnifiedRetryDecision } from '../retry/retry-governance'
import type {
  HookContext,
  ToolExecutionInput,
  ToolExecutionOutput as HookToolOutput
} from '../hooks'

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
  /** Permission preview evaluated before execution */
  permissionPreview?: ToolExecutionPermissionPreview
  /** The execution result */
  result: ToolExecutionResult | ToolResult
  /** Whether execution succeeded */
  success: boolean
  /** Error message if execution failed */
  error?: string
  /** Execution time in milliseconds */
  durationMs: number
  /** Unified failure handling decision for downstream retry/recovery layers */
  retryDecision?: UnifiedRetryDecision
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
  private toolScopeStorage = new AsyncLocalStorage<{ allowedToolNames: Set<string> }>()
  private defaultConfig: Required<ToolExecutionConfig> = {
    maxIterations: 10,
    timeoutMs: 30000,
    stopOnError: false
  }

  async withAllowedTools<T>(
    toolNames: string[] | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!toolNames) {
      return operation()
    }

    const normalized = new Set(
      toolNames
        .map(name => toolRegistry.resolveName(name.trim()))
        .filter(Boolean)
    )
    return this.toolScopeStorage.run({ allowedToolNames: normalized }, operation)
  }

  resolveToolName(toolName: string): string {
    return toolRegistry.resolveName(toolName)
  }

  private getToolName(tool: UnifiedTool): string {
    return isBrowserTool(tool) ? tool.name : tool.definition.name
  }

  private isToolAllowedInCurrentScope(toolName: string): boolean {
    const scoped = this.toolScopeStorage.getStore()
    if (!scoped) {
      return true
    }

    return scoped.allowedToolNames.has(toolName)
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
    const allTools = [...registryTools, ...browserToolsArray]
    return allTools.filter(tool => this.isToolAllowedInCurrentScope(this.getToolName(tool)))
  }

  /**
   * Get tool definitions in Anthropic/OpenAI compatible format
   */
  getToolDefinitions(allowedToolNames?: string[]): Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }> {
    const explicitAllowlist =
      allowedToolNames === undefined
        ? null
        : new Set(
            allowedToolNames
              .map(name => toolRegistry.resolveName(name.trim()))
              .filter(Boolean)
          )

    return this.getAllTools()
      .filter(tool => {
        if (!explicitAllowlist) {
          return true
        }
        return explicitAllowlist.has(this.getToolName(tool))
      })
      .map(tool => {
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
            const propSchema: Record<string, unknown> = {
              type: param.type,
              description: param.description,
              ...(param.default !== undefined && { default: param.default })
            }

            // Some providers/proxies (notably Gemini) require array schemas to include `items`.
            // Default to a string array unless the tool parameter declares a more specific schema.
            if (param.type === 'array') {
              const explicitItems =
                (param as { items?: Record<string, unknown> }).items &&
                typeof param.items === 'object'
                  ? param.items
                  : undefined

              propSchema.items =
                explicitItems ??
                (() => {
                  // Best-effort inference from defaults (keeps schema stable without extra config).
                  const def = param.default
                  if (Array.isArray(def) && def.length > 0) {
                    const first = def[0]
                    const t = typeof first
                    if (t === 'number') return { type: 'number' }
                    if (t === 'boolean') return { type: 'boolean' }
                    if (t === 'object' && first !== null) return { type: 'object' }
                  }
                  return { type: 'string' }
                })()
            }

            properties[param.name] = propSchema
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
              required: required.length > 0 ? required : undefined,
              additionalProperties: false
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
    const requestedName = toolCall.name
    const resolvedName = toolRegistry.resolveName(requestedName)
    const permissionPreview = defaultPolicy.getExecutionPreview(resolvedName, requestedName)

    if (resolvedName !== requestedName) {
      this.logger.info('Tool alias resolved', {
        requestedToolName: requestedName,
        resolvedToolName: resolvedName
      })
    }

    this.logger.info('Tool permission preview evaluated', {
      requestedToolName: requestedName,
      resolvedToolName: resolvedName,
      template: permissionPreview.template,
      permission: permissionPreview.permission,
      allowedByPolicy: permissionPreview.allowedByPolicy,
      requiresConfirmation: permissionPreview.requiresConfirmation,
      highRisk: permissionPreview.highRisk,
      highRiskEnforced: permissionPreview.highRiskEnforced
    })

    if (!this.isToolAllowedInCurrentScope(resolvedName)) {
      this.logger.warn('Tool execution denied by scoped allowlist', {
        toolName: resolvedName,
        requestedToolName: requestedName
      })
      return {
        toolCall,
        permissionPreview,
        result: {
          success: false,
          output: '',
          error: `Tool '${requestedName}' is not enabled for this agent`
        },
        success: false,
        error: `Tool '${requestedName}' is not enabled for this agent`,
        durationMs: Date.now() - startTime
      }
    }

    if (!permissionPreview.allowedByPolicy) {
      this.logger.warn('Tool execution denied by policy', {
        toolName: resolvedName,
        requestedToolName: requestedName,
        reason: permissionPreview.reason,
        template: permissionPreview.template,
        permission: permissionPreview.permission
      })
      return {
        toolCall,
        permissionPreview,
        result: {
          success: false,
          output: '',
          error: `Tool '${requestedName}' is not allowed by policy`
        },
        success: false,
        error: `Tool '${requestedName}' is not allowed by policy`,
        durationMs: Date.now() - startTime
      }
    }

    if (permissionPreview.requiresConfirmation && !permissionPreview.allowedWithoutConfirmation) {
      const approvalRequest = await toolApprovalService.requestApproval({
        toolCall,
        permissionPreview,
        context
      })

      if (approvalRequest.status !== 'approved') {
        throw new ToolApprovalRequiredError(
          approvalRequest,
          approvalRequest.decisionReason ||
            `Tool '${requestedName}' was ${approvalRequest.status === 'expired' ? 'not approved in time' : 'rejected by user'}`
        )
      }
    }

    const browserTool = this.browserTools.get(resolvedName)
    const registryTool = toolRegistry.get(resolvedName)
    const tool = browserTool || registryTool

    if (!tool) {
      const suggestion = toolRegistry.suggestName(requestedName)
      const suggestionSuffix = suggestion ? ` Did you mean '${suggestion}'?` : ''
      this.logger.error('Tool not found', {
        toolName: resolvedName,
        requestedToolName: requestedName,
        suggestion
      })
      return {
        toolCall,
        permissionPreview,
        result: {
          success: false,
          output: '',
          error: `Tool '${requestedName}' not found.${suggestionSuffix}`
        },
        success: false,
        error: `Tool '${requestedName}' not found.${suggestionSuffix}`,
        durationMs: Date.now() - startTime
      }
    }

    try {
      this.logger.info('Executing tool', {
        toolName: resolvedName,
        requestedToolName: requestedName,
        arguments: toolCall.arguments
      })

      const result = await this.executeWithTimeout(tool, toolCall.arguments, context, timeoutMs)

      const durationMs = Date.now() - startTime
      const success = 'success' in result ? result.success : true
      const errorMsg = success ? undefined : 'error' in result ? result.error : undefined

      this.logger.info('Tool execution completed', {
        toolName: resolvedName,
        requestedToolName: requestedName,
        success,
        durationMs
      })

      return {
        toolCall,
        permissionPreview,
        result,
        success,
        error: errorMsg,
        durationMs
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const durationMs = Date.now() - startTime
      const retryDecision = buildUnifiedRetryDecision({
        scope: 'tool',
        error,
        attempt: 1,
        maxRetries: 0,
        baseDelayMs: 1000
      })

      this.logger.error('Tool execution failed', {
        toolName: resolvedName,
        requestedToolName: requestedName,
        error: errorMessage,
        durationMs,
        retryClassification: retryDecision.classification,
        retryable: retryDecision.retryable,
        nextAction: retryDecision.nextAction,
        manualTakeoverRequired: retryDecision.manualTakeoverRequired
      })

      return {
        toolCall,
        permissionPreview,
        result: {
          success: false,
          output: '',
          error: `Tool execution failed: ${errorMessage}`
        },
        success: false,
        error: errorMessage,
        durationMs,
        retryDecision
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
    const hookContext = this.buildHookContext(context)

    for (const originalToolCall of toolCalls) {
      let toolCall = originalToolCall
      let hookInput = this.buildHookInput(toolCall)
      let output: ToolExecutionOutput
      let shouldSkip = false

      try {
        const hookResult = await hookManager.emitToolStart(hookContext, hookInput)
        if (hookResult.modifiedInput) {
          hookInput = hookResult.modifiedInput
          toolCall = {
            id: hookInput.callId,
            name: hookInput.tool,
            arguments: hookInput.params as Record<string, unknown>
          }
        }

        shouldSkip = Boolean(hookResult.shouldSkip)
      } catch (hookError) {
        this.logger.warn('Hook error', hookError)
      }

      if (shouldSkip) {
        this.logger.info('Tool execution skipped by hook', { toolName: toolCall.name })
        output = this.buildSkippedOutput(toolCall)
      } else {
        await executionEventPersistenceService.appendEvent({
          sessionId: 'sessionId' in context ? context.sessionId || 'unknown' : 'unknown',
          taskId: 'taskId' in context ? context.taskId : undefined,
          runId: 'runId' in context ? context.runId : undefined,
          type: 'tool-call-requested',
          payload: {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            arguments: toolCall.arguments
          }
        })
        output = await this.executeTool(toolCall, context, config)
      }

      try {
        const hookOutput = this.buildHookOutput(toolCall.name, output)
        const endHookResult = await hookManager.emitToolEnd(hookContext, hookInput, hookOutput)
        if (endHookResult.modifiedOutput) {
          output = this.applyModifiedHookOutput(output, endHookResult.modifiedOutput)
        }
      } catch (hookError) {
        this.logger.warn('Hook error', hookError)
      }

      outputs.push(output)

      await executionEventPersistenceService.appendEvent({
        sessionId: 'sessionId' in context ? context.sessionId || 'unknown' : 'unknown',
        taskId: 'taskId' in context ? context.taskId : undefined,
        runId: 'runId' in context ? context.runId : undefined,
        type: 'tool-call-completed',
        payload: {
          toolCallId: output.toolCall.id,
          toolName: output.toolCall.name,
          success: output.success,
          durationMs: output.durationMs,
          error: output.error,
          retryClassification: output.retryDecision?.classification,
          retryNextAction: output.retryDecision?.nextAction,
          manualTakeoverRequired: output.retryDecision?.manualTakeoverRequired
        }
      })

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

  private buildHookContext(context: ToolExecutionContext | BrowserToolContext): HookContext {
    return {
      sessionId: 'sessionId' in context ? context.sessionId || 'unknown' : 'unknown',
      workspaceDir: 'workspaceDir' in context ? context.workspaceDir || process.cwd() : process.cwd(),
      traceId: 'traceId' in context ? context.traceId : undefined
    }
  }

  private buildHookInput(toolCall: ToolCall): ToolExecutionInput {
    return {
      tool: toolCall.name,
      callId: toolCall.id,
      params: toolCall.arguments as Record<string, unknown>
    }
  }

  private buildSkippedOutput(toolCall: ToolCall): ToolExecutionOutput {
    return {
      toolCall,
      result: {
        success: false,
        output: '',
        error: 'Tool execution skipped by hook'
      },
      success: false,
      error: 'Tool execution skipped by hook',
      durationMs: 0
    }
  }

  private buildHookOutput(toolName: string, output: ToolExecutionOutput): HookToolOutput {
    const resultAsRecord = this.asRecord(output.result)
    const rawOutput =
      resultAsRecord && 'output' in resultAsRecord ? resultAsRecord.output : output.result

    return {
      title: toolName,
      output: typeof rawOutput === 'string' ? rawOutput : this.safeStringify(rawOutput),
      success: output.success,
      error: output.error,
      metadata:
        resultAsRecord && 'metadata' in resultAsRecord
          ? (resultAsRecord.metadata as Record<string, unknown> | undefined)
          : undefined
    }
  }

  private applyModifiedHookOutput(
    output: ToolExecutionOutput,
    modifiedOutput: Partial<HookToolOutput>
  ): ToolExecutionOutput {
    const patchedResult: ToolExecutionResult = {
      success: modifiedOutput.success ?? output.success,
      output: modifiedOutput.output ?? this.extractOutputText(output.result),
      error: modifiedOutput.error ?? output.error,
      metadata: modifiedOutput.metadata
    }

    return {
      ...output,
      result: patchedResult,
      success: modifiedOutput.success ?? output.success,
      error: modifiedOutput.error ?? output.error
    }
  }

  private extractOutputText(result: ToolExecutionResult | ToolResult): string {
    const record = this.asRecord(result)
    if (record && 'output' in record) {
      const rawOutput = record.output
      return typeof rawOutput === 'string' ? rawOutput : this.safeStringify(rawOutput)
    }
    return this.safeStringify(result)
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object'
      ? (value as unknown as Record<string, unknown>)
      : undefined
  }

  private safeStringify(value: unknown): string {
    if (typeof value === 'string') {
      return value
    }
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
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

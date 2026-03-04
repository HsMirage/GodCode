import { toolRegistry } from './tool-registry'
import { defaultPolicy } from './permission-policy'
import type { ToolExecutionContext, ToolExecutionResult } from './tool.interface'
import { LoggerService } from '../logger'

export class ToolExecutor {
  private logger = LoggerService.getInstance().getLogger()

  async execute(
    toolName: string,
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const requestedName = toolName
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

    if (!permissionPreview.allowedByPolicy) {
      this.logger.warn('Tool execution denied by policy', {
        toolName: resolvedName,
        requestedName,
        reason: permissionPreview.reason,
        template: permissionPreview.template,
        permission: permissionPreview.permission
      })
      return {
        success: false,
        output: '',
        error: `Tool '${requestedName}' is not allowed by policy`,
        metadata: {
          permissionPreview
        }
      }
    }

    const tool = toolRegistry.get(resolvedName)
    if (!tool) {
      const suggestion = toolRegistry.suggestName(requestedName)
      const suggestionSuffix = suggestion ? ` Did you mean '${suggestion}'?` : ''
      this.logger.error('Tool not found', { toolName: resolvedName, requestedName, suggestion })
      return {
        success: false,
        output: '',
        error: `Tool '${requestedName}' not found.${suggestionSuffix}`,
        metadata: {
          permissionPreview
        }
      }
    }

    const validationError = this.validateParams(tool, params)
    if (validationError) {
      this.logger.warn('Tool parameter validation failed', { toolName: resolvedName, error: validationError })
      return {
        success: false,
        output: '',
        error: validationError,
        metadata: {
          permissionPreview
        }
      }
    }

    try {
      this.logger.info('Executing tool', { toolName: resolvedName, requestedName, params })
      const result = await tool.execute(params, context)
      this.logger.info('Tool execution completed', {
        toolName: resolvedName,
        requestedName,
        success: result.success
      })
      return {
        ...result,
        metadata: {
          ...(result.metadata ?? {}),
          permissionPreview
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Tool execution failed', { toolName: resolvedName, requestedName, error: errorMessage })
      return {
        success: false,
        output: '',
        error: `Tool execution failed: ${errorMessage}`,
        metadata: {
          permissionPreview
        }
      }
    }
  }

  private validateParams(tool: any, params: Record<string, any>): string | null {
    for (const param of tool.definition.parameters) {
      if (param.required && !(param.name in params)) {
        return `Missing required parameter: ${param.name}`
      }
    }
    return null
  }
}

export const toolExecutor = new ToolExecutor()

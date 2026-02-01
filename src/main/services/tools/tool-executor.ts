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
    if (!defaultPolicy.isAllowed(toolName)) {
      this.logger.warn('Tool execution denied by policy', { toolName })
      return {
        success: false,
        output: '',
        error: `Tool '${toolName}' is not allowed by policy`
      }
    }

    const tool = toolRegistry.get(toolName)
    if (!tool) {
      this.logger.error('Tool not found', { toolName })
      return {
        success: false,
        output: '',
        error: `Tool '${toolName}' not found`
      }
    }

    const validationError = this.validateParams(tool, params)
    if (validationError) {
      this.logger.warn('Tool parameter validation failed', { toolName, error: validationError })
      return {
        success: false,
        output: '',
        error: validationError
      }
    }

    try {
      this.logger.info('Executing tool', { toolName, params })
      const result = await tool.execute(params, context)
      this.logger.info('Tool execution completed', { toolName, success: result.success })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Tool execution failed', { toolName, error: errorMessage })
      return {
        success: false,
        output: '',
        error: `Tool execution failed: ${errorMessage}`
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

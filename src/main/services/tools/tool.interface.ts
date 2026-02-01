export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required: boolean
  default?: any
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameter[]
  category: 'file' | 'terminal' | 'browser' | 'system'
}

export interface ToolExecutionContext {
  workspaceDir: string
  sessionId: string
  userId?: string
}

export interface ToolExecutionResult {
  success: boolean
  output: string
  error?: string
  metadata?: Record<string, any>
}

export interface Tool {
  definition: ToolDefinition
  execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolExecutionResult>
}

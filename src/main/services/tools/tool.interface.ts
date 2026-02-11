export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required: boolean
  default?: any
  /**
   * JSON schema for array items. If omitted, the runtime will default to { type: "string" }.
   * This is important for providers/proxies that require `items` for array parameters (e.g. Gemini).
   */
  items?: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array'
    // Allow passing through additional JSON-schema-ish hints if needed later.
    [key: string]: any
  }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameter[]
  category: 'file' | 'terminal' | 'browser' | 'system' | 'search'
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

import fs from 'fs/promises'
import path from 'path'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

export const fileReadTool: Tool = {
  definition: {
    name: 'file_read',
    description: 'Read content from a file',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to read (relative to workspace)',
        required: true
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const filePath = path.resolve(context.workspaceDir, params.path)

      if (!filePath.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Access denied: path outside workspace'
        }
      }

      const content = await fs.readFile(filePath, 'utf-8')

      return {
        success: true,
        output: content,
        metadata: {
          path: params.path,
          size: content.length
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

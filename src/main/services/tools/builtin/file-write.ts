import fs from 'fs/promises'
import path from 'path'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

export const fileWriteTool: Tool = {
  definition: {
    name: 'file_write',
    description: 'Write content to a file',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to write (relative to workspace)',
        required: true
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to write to the file',
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

      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(filePath, params.content, 'utf-8')

      return {
        success: true,
        output: `File written successfully: ${params.path}`,
        metadata: {
          path: params.path,
          size: params.content.length
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

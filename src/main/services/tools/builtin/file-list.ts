import fs from 'fs/promises'
import path from 'path'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

export const fileListTool: Tool = {
  definition: {
    name: 'file_list',
    description: 'List files in a directory',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Directory path to list (relative to workspace)',
        required: false,
        default: '.'
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const dirPath = path.resolve(context.workspaceDir, params.path || '.')

      if (!dirPath.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Access denied: path outside workspace'
        }
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }))

      return {
        success: true,
        output: JSON.stringify(files, null, 2),
        metadata: {
          path: params.path || '.',
          count: files.length
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

/**
 * LSP References Tool - Find all usages/references of a symbol
 */

import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { withLspClient, formatLocation } from './utils'
import { DEFAULT_MAX_REFERENCES } from './constants'
import type { Location } from './types'

export const lspReferencesTool: Tool = {
  definition: {
    name: 'lsp_find_references',
    description: 'Find ALL usages/references of a symbol across the entire workspace.',
    category: 'system',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: 'Path to the file containing the symbol',
        required: true
      },
      {
        name: 'line',
        type: 'number',
        description: 'Line number (1-based)',
        required: true
      },
      {
        name: 'character',
        type: 'number',
        description: 'Character position (0-based)',
        required: true
      },
      {
        name: 'include_declaration',
        type: 'boolean',
        description: 'Include the declaration itself in results (default: true)',
        required: false,
        default: true
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const filePath = params.file_path as string
      const line = params.line as number
      const character = params.character as number
      const includeDeclaration = params.include_declaration !== false

      if (!filePath) {
        return { success: false, output: '', error: 'file_path is required' }
      }
      if (typeof line !== 'number' || line < 1) {
        return { success: false, output: '', error: 'line must be a positive number (1-based)' }
      }
      if (typeof character !== 'number' || character < 0) {
        return {
          success: false,
          output: '',
          error: 'character must be a non-negative number (0-based)'
        }
      }

      const result = await withLspClient(filePath, context.workspaceDir, async (client) => {
        return (await client.references(filePath, line, character, includeDeclaration)) as
          | Location[]
          | null
      })

      if (!result || result.length === 0) {
        return {
          success: true,
          output: 'No references found',
          metadata: { count: 0 }
        }
      }

      const total = result.length
      const truncated = total > DEFAULT_MAX_REFERENCES
      const limited = truncated ? result.slice(0, DEFAULT_MAX_REFERENCES) : result
      const lines = limited.map(formatLocation)
      if (truncated) {
        lines.unshift(`Found ${total} references (showing first ${DEFAULT_MAX_REFERENCES}):`)
      }

      return {
        success: true,
        output: lines.join('\n'),
        metadata: {
          total,
          shown: limited.length,
          truncated
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

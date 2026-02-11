/**
 * LSP Definition Tool - Jump to symbol definition
 */

import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { withLspClient, formatLocation } from './utils'
import type { Location, LocationLink } from './types'

export const lspDefinitionTool: Tool = {
  definition: {
    name: 'lsp_goto_definition',
    description: 'Jump to symbol definition. Find WHERE something is defined.',
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
        return (await client.definition(filePath, line, character)) as
          | Location
          | Location[]
          | LocationLink[]
          | null
      })

      if (!result) {
        return {
          success: true,
          output: 'No definition found',
          metadata: { found: false }
        }
      }

      const locations = Array.isArray(result) ? result : [result]
      if (locations.length === 0) {
        return {
          success: true,
          output: 'No definition found',
          metadata: { found: false }
        }
      }

      const output = locations.map(formatLocation).join('\n')

      return {
        success: true,
        output,
        metadata: {
          found: true,
          count: locations.length
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

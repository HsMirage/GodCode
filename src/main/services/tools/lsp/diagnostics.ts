/**
 * LSP Diagnostics Tool - Get code errors, warnings from language server
 */

import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { withLspClient, formatDiagnostic, filterDiagnosticsBySeverity } from './utils'
import { DEFAULT_MAX_DIAGNOSTICS } from './constants'
import type { Diagnostic } from './types'

export const lspDiagnosticsTool: Tool = {
  definition: {
    name: 'lsp_diagnostics',
    description:
      'Get errors, warnings, hints from language server. Use to check code problems before running build.',
    category: 'system',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: 'Path to the file to get diagnostics for',
        required: true
      },
      {
        name: 'severity',
        type: 'string',
        description:
          'Filter by severity level: "error", "warning", "information", "hint", or "all" (default: all)',
        required: false,
        default: 'all'
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const filePath = params.file_path as string
      if (!filePath) {
        return {
          success: false,
          output: '',
          error: 'file_path is required'
        }
      }

      const severity = (params.severity as string) || 'all'

      const result = await withLspClient(
        filePath,
        context.workspaceDir,
        async (client) => {
          return (await client.diagnostics(filePath)) as { items?: Diagnostic[] } | Diagnostic[]
        }
      )

      let diagnostics: Diagnostic[] = []
      if (result) {
        if (Array.isArray(result)) {
          diagnostics = result
        } else if (result.items) {
          diagnostics = result.items
        }
      }

      diagnostics = filterDiagnosticsBySeverity(diagnostics, severity)

      if (diagnostics.length === 0) {
        return {
          success: true,
          output: 'No diagnostics found',
          metadata: { count: 0 }
        }
      }

      const total = diagnostics.length
      const truncated = total > DEFAULT_MAX_DIAGNOSTICS
      const limited = truncated ? diagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS) : diagnostics
      const lines = limited.map(formatDiagnostic)
      if (truncated) {
        lines.unshift(`Found ${total} diagnostics (showing first ${DEFAULT_MAX_DIAGNOSTICS}):`)
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

/**
 * LSP Symbols Tool - Get symbols from file or search workspace
 */

import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'
import { withLspClient, formatDocumentSymbol, formatSymbolInfo } from './utils'
import { DEFAULT_MAX_SYMBOLS } from './constants'
import type { DocumentSymbol, SymbolInfo } from './types'

export const lspSymbolsTool: Tool = {
  definition: {
    name: 'lsp_symbols',
    description:
      'Get symbols from file (document) or search across workspace. Use scope="document" for file outline, scope="workspace" for project-wide symbol search.',
    category: 'system',
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: 'File path for LSP context',
        required: true
      },
      {
        name: 'scope',
        type: 'string',
        description:
          '"document" for file symbols, "workspace" for project-wide search (default: document)',
        required: false,
        default: 'document'
      },
      {
        name: 'query',
        type: 'string',
        description: 'Symbol name to search (required for workspace scope)',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Max results (default: 50)',
        required: false,
        default: 50
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const filePath = params.file_path as string
      const scope = (params.scope as string) || 'document'
      const query = params.query as string | undefined
      const limit = Math.min((params.limit as number) || DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)

      if (!filePath) {
        return { success: false, output: '', error: 'file_path is required' }
      }

      if (scope === 'workspace') {
        if (!query) {
          return {
            success: false,
            output: '',
            error: "'query' is required for workspace scope"
          }
        }

        const result = await withLspClient(filePath, context.workspaceDir, async (client) => {
          return (await client.workspaceSymbols(query)) as SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return {
            success: true,
            output: 'No symbols found',
            metadata: { count: 0 }
          }
        }

        const total = result.length
        const truncated = total > limit
        const limited = result.slice(0, limit)
        const lines = limited.map(formatSymbolInfo)
        if (truncated) {
          lines.unshift(`Found ${total} symbols (showing first ${limit}):`)
        }

        return {
          success: true,
          output: lines.join('\n'),
          metadata: { total, shown: limited.length, truncated }
        }
      } else {
        const result = await withLspClient(filePath, context.workspaceDir, async (client) => {
          return (await client.documentSymbols(filePath)) as DocumentSymbol[] | SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return {
            success: true,
            output: 'No symbols found',
            metadata: { count: 0 }
          }
        }

        const total = result.length
        const truncated = total > limit
        const limited = truncated ? result.slice(0, limit) : result

        const lines: string[] = []
        if (truncated) {
          lines.push(`Found ${total} symbols (showing first ${limit}):`)
        }

        if ('range' in limited[0]) {
          lines.push(...(limited as DocumentSymbol[]).map((s) => formatDocumentSymbol(s)))
        } else {
          lines.push(...(limited as SymbolInfo[]).map(formatSymbolInfo))
        }

        return {
          success: true,
          output: lines.join('\n'),
          metadata: { total, shown: limited.length, truncated }
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

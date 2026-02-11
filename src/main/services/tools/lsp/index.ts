/**
 * LSP Tools - Language Server Protocol tools for CodeAll
 *
 * Provides code intelligence capabilities:
 * - lsp_diagnostics: Get errors/warnings from language server
 * - lsp_goto_definition: Jump to symbol definition
 * - lsp_find_references: Find all references to a symbol
 * - lsp_symbols: Search for symbols in file or workspace
 */

export * from './types'
export * from './constants'
export * from './client'
export * from './utils'

// Export individual tools
export { lspDiagnosticsTool } from './diagnostics'
export { lspDefinitionTool } from './definition'
export { lspReferencesTool } from './references'
export { lspSymbolsTool } from './symbols'

// Convenience re-export of all tools
import { lspDiagnosticsTool } from './diagnostics'
import { lspDefinitionTool } from './definition'
import { lspReferencesTool } from './references'
import { lspSymbolsTool } from './symbols'

export const lspTools = [lspDiagnosticsTool, lspDefinitionTool, lspReferencesTool, lspSymbolsTool]

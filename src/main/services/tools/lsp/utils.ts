/**
 * LSP Utils - Utility functions for LSP tools
 */

import { extname, resolve, dirname, join } from 'path'
import { existsSync, statSync } from 'fs'
import { fileURLToPath } from 'node:url'
import { LSPClient, lspManager, isServerInstalled } from './client'
import { BUILTIN_SERVERS, SYMBOL_KIND_MAP, SEVERITY_MAP, LSP_INSTALL_HINTS } from './constants'
import type {
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInfo,
  Diagnostic,
  ServerLookupResult
} from './types'

/**
 * Find the workspace root from a file path
 */
export function findWorkspaceRoot(filePath: string): string {
  let dir = resolve(filePath)

  try {
    const stats = statSync(dir)
    if (!stats.isDirectory()) {
      dir = dirname(dir)
    }
  } catch {
    dir = dirname(dir)
  }

  const markers = [
    '.git',
    'package.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle'
  ]

  let prevDir = ''
  while (dir !== prevDir) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) {
        return dir
      }
    }
    prevDir = dir
    dir = dirname(dir)
  }

  return dirname(resolve(filePath))
}

/**
 * Convert file URI to path
 */
export function uriToPath(uri: string): string {
  return fileURLToPath(uri)
}

/**
 * Find LSP server for a file extension
 */
export function findServerForExtension(ext: string): ServerLookupResult {
  for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
    if (config.extensions.includes(ext) && isServerInstalled(config.command)) {
      return {
        status: 'found',
        server: {
          id,
          command: config.command,
          extensions: config.extensions,
          priority: 0,
          env: config.env,
          initialization: config.initialization
        }
      }
    }
  }

  for (const [id, config] of Object.entries(BUILTIN_SERVERS)) {
    if (config.extensions.includes(ext)) {
      const installHint =
        LSP_INSTALL_HINTS[id] || `Install '${config.command[0]}' and ensure it's in your PATH`
      return {
        status: 'not_installed',
        server: {
          id,
          command: config.command,
          extensions: config.extensions
        },
        installHint
      }
    }
  }

  const availableServers = Object.keys(BUILTIN_SERVERS)
  return {
    status: 'not_configured',
    extension: ext,
    availableServers
  }
}

/**
 * Format server lookup error message
 */
export function formatServerLookupError(
  result: Exclude<ServerLookupResult, { status: 'found' }>
): string {
  if (result.status === 'not_installed') {
    const { server, installHint } = result
    return [
      `LSP server '${server.id}' is configured but NOT INSTALLED.`,
      ``,
      `Command not found: ${server.command[0]}`,
      ``,
      `To install:`,
      `  ${installHint}`,
      ``,
      `Supported extensions: ${server.extensions.join(', ')}`
    ].join('\n')
  }

  return [
    `No LSP server configured for extension: ${result.extension}`,
    ``,
    `Available servers: ${result.availableServers.slice(0, 10).join(', ')}${result.availableServers.length > 10 ? '...' : ''}`
  ].join('\n')
}

/**
 * Execute a function with an LSP client
 */
export async function withLspClient<T>(
  filePath: string,
  workspaceDir: string,
  fn: (client: LSPClient) => Promise<T>
): Promise<T> {
  const absPath = resolve(workspaceDir, filePath)
  const ext = extname(absPath)
  const result = findServerForExtension(ext)

  if (result.status !== 'found') {
    throw new Error(formatServerLookupError(result))
  }

  const server = result.server
  const root = findWorkspaceRoot(absPath)
  const client = await lspManager.getClient(root, server)

  try {
    return await fn(client)
  } catch (e) {
    if (e instanceof Error && e.message.includes('timeout')) {
      const isInitializing = lspManager.isServerInitializing(root, server.id)
      if (isInitializing) {
        throw new Error(
          `LSP server is still initializing. Please retry in a few seconds. ` +
            `Original error: ${e.message}`
        )
      }
    }
    throw e
  } finally {
    lspManager.releaseClient(root, server.id)
  }
}

/**
 * Format a location for output
 */
export function formatLocation(loc: Location | LocationLink): string {
  if ('targetUri' in loc) {
    const uri = uriToPath(loc.targetUri)
    const line = loc.targetRange.start.line + 1
    const char = loc.targetRange.start.character
    return `${uri}:${line}:${char}`
  }

  const uri = uriToPath(loc.uri)
  const line = loc.range.start.line + 1
  const char = loc.range.start.character
  return `${uri}:${line}:${char}`
}

/**
 * Format symbol kind
 */
export function formatSymbolKind(kind: number): string {
  return SYMBOL_KIND_MAP[kind] || `Unknown(${kind})`
}

/**
 * Format severity
 */
export function formatSeverity(severity: number | undefined): string {
  if (!severity) return 'unknown'
  return SEVERITY_MAP[severity] || `unknown(${severity})`
}

/**
 * Format a document symbol
 */
export function formatDocumentSymbol(symbol: DocumentSymbol, indent = 0): string {
  const prefix = '  '.repeat(indent)
  const kind = formatSymbolKind(symbol.kind)
  const line = symbol.range.start.line + 1
  let result = `${prefix}${symbol.name} (${kind}) - line ${line}`

  if (symbol.children && symbol.children.length > 0) {
    for (const child of symbol.children) {
      result += '\n' + formatDocumentSymbol(child, indent + 1)
    }
  }

  return result
}

/**
 * Format a symbol info
 */
export function formatSymbolInfo(symbol: SymbolInfo): string {
  const kind = formatSymbolKind(symbol.kind)
  const loc = formatLocation(symbol.location)
  const container = symbol.containerName ? ` (in ${symbol.containerName})` : ''
  return `${symbol.name} (${kind})${container} - ${loc}`
}

/**
 * Format a diagnostic
 */
export function formatDiagnostic(diag: Diagnostic): string {
  const severity = formatSeverity(diag.severity)
  const line = diag.range.start.line + 1
  const char = diag.range.start.character
  const source = diag.source ? `[${diag.source}]` : ''
  const code = diag.code ? ` (${diag.code})` : ''
  return `${severity}${source}${code} at ${line}:${char}: ${diag.message}`
}

/**
 * Filter diagnostics by severity
 */
export function filterDiagnosticsBySeverity(
  diagnostics: Diagnostic[],
  severityFilter?: string
): Diagnostic[] {
  if (!severityFilter || severityFilter === 'all') {
    return diagnostics
  }

  const severityMap: Record<string, number> = {
    error: 1,
    warning: 2,
    information: 3,
    hint: 4
  }

  const targetSeverity = severityMap[severityFilter]
  if (!targetSeverity) return diagnostics

  return diagnostics.filter((d) => d.severity === targetSeverity)
}

import fs from 'fs/promises'
import path from 'path'
import type { Dirent } from 'fs'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

// Constants for safety limits
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_LIMIT = 100
const DEFAULT_MAX_DEPTH = 20

interface FileMatch {
  path: string
  mtime: number
}

interface GlobResult {
  files: FileMatch[]
  totalFiles: number
  truncated: boolean
  error?: string
}

/**
 * Convert a glob pattern to a RegExp
 * Supports: *, **, ?, [abc], [!abc]
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = ''
  let i = 0

  while (i < pattern.length) {
    const char = pattern[i]

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any path including /
        if (pattern[i + 2] === '/') {
          regexStr += '(?:[^/]+/)*'
          i += 3
        } else {
          regexStr += '.*'
          i += 2
        }
      } else {
        // * matches any character except /
        regexStr += '[^/]*'
        i++
      }
    } else if (char === '?') {
      regexStr += '[^/]'
      i++
    } else if (char === '[') {
      // Character class
      let j = i + 1
      let classContent = ''
      if (pattern[j] === '!') {
        classContent += '^'
        j++
      }
      while (j < pattern.length && pattern[j] !== ']') {
        classContent += pattern[j]
        j++
      }
      regexStr += `[${classContent}]`
      i = j + 1
    } else if (char === '/') {
      regexStr += '[\\\\/]'
      i++
    } else if ('.^$+{}|()\\'.includes(char)) {
      // Escape special regex characters
      regexStr += '\\' + char
      i++
    } else {
      regexStr += char
      i++
    }
  }

  return new RegExp(`^${regexStr}$`, 'i')
}

/**
 * Check if a path matches any of the ignore patterns
 */
function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  // Always ignore .git directory
  if (relativePath.includes('.git') || relativePath.includes('node_modules')) {
    return true
  }

  for (const pattern of ignorePatterns) {
    const regex = globToRegex(pattern)
    if (regex.test(relativePath)) {
      return true
    }
  }

  return false
}

/**
 * Recursively scan directory for files matching the glob pattern
 */
async function scanDirectory(
  baseDir: string,
  currentDir: string,
  pattern: RegExp,
  options: {
    maxDepth: number
    currentDepth: number
    limit: number
    hidden: boolean
    ignorePatterns: string[]
  },
  results: FileMatch[],
  startTime: number
): Promise<boolean> {
  // Check timeout
  if (Date.now() - startTime > DEFAULT_TIMEOUT_MS) {
    return true // truncated due to timeout
  }

  // Check limit
  if (results.length >= options.limit) {
    return true // truncated due to limit
  }

  // Check depth
  if (options.currentDepth > options.maxDepth) {
    return false
  }

  let entries: Dirent[]
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true }) as Dirent[]
  } catch {
    return false
  }

  for (const entry of entries) {
    if (results.length >= options.limit) {
      return true
    }

    // Skip hidden files/directories if not requested
    if (!options.hidden && entry.name.startsWith('.')) {
      continue
    }

    const fullPath = path.join(currentDir, entry.name)
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/')

    // Check ignore patterns
    if (shouldIgnore(relativePath, options.ignorePatterns)) {
      continue
    }

    if (entry.isDirectory()) {
      const truncated = await scanDirectory(
        baseDir,
        fullPath,
        pattern,
        {
          ...options,
          currentDepth: options.currentDepth + 1
        },
        results,
        startTime
      )
      if (truncated) return true
    } else if (entry.isFile()) {
      // Test if file matches the pattern
      if (pattern.test(relativePath)) {
        try {
          const stats = await fs.stat(fullPath)
          results.push({
            path: relativePath,
            mtime: stats.mtime.getTime()
          })
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  return false
}

/**
 * Execute glob search
 */
async function executeGlob(
  pattern: string,
  searchPath: string,
  options: {
    limit?: number
    maxDepth?: number
    hidden?: boolean
    exclude?: string[]
  } = {}
): Promise<GlobResult> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT)
  const maxDepth = Math.min(options.maxDepth ?? DEFAULT_MAX_DEPTH, DEFAULT_MAX_DEPTH)
  const hidden = options.hidden ?? false
  const ignorePatterns = options.exclude ?? []

  const startTime = Date.now()
  const results: FileMatch[] = []

  try {
    // Check if search path exists
    const pathStats = await fs.stat(searchPath)
    if (!pathStats.isDirectory()) {
      return {
        files: [],
        totalFiles: 0,
        truncated: false,
        error: 'Search path is not a directory'
      }
    }

    const regex = globToRegex(pattern)

    const truncated = await scanDirectory(
      searchPath,
      searchPath,
      regex,
      {
        maxDepth,
        currentDepth: 0,
        limit,
        hidden,
        ignorePatterns
      },
      results,
      startTime
    )

    // Sort by modification time (most recent first)
    results.sort((a, b) => b.mtime - a.mtime)

    return {
      files: results,
      totalFiles: results.length,
      truncated
    }
  } catch (error) {
    return {
      files: [],
      totalFiles: 0,
      truncated: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Format glob result for output
 */
function formatGlobResult(result: GlobResult): string {
  if (result.error) {
    return `Error: ${result.error}`
  }

  if (result.files.length === 0) {
    return 'No files found'
  }

  const lines: string[] = []
  lines.push(`Found ${result.totalFiles} file(s)`)
  lines.push('')

  for (const file of result.files) {
    lines.push(file.path)
  }

  if (result.truncated) {
    lines.push('')
    lines.push('(Results are truncated. Consider using a more specific path or pattern.)')
  }

  return lines.join('\n')
}

export const globTool: Tool = {
  definition: {
    name: 'glob',
    description:
      'Fast file pattern matching tool with safety limits (60s timeout, 100 file limit). ' +
      'Supports glob patterns like "**/*.ts" or "src/**/*.tsx". ' +
      'Returns matching file paths sorted by modification time. ' +
      'Use this tool when you need to find files by name patterns.',
    category: 'file',
    parameters: [
      {
        name: 'pattern',
        type: 'string',
        description: 'The glob pattern to match files against (e.g., "**/*.ts", "src/**/*.tsx")',
        required: true
      },
      {
        name: 'path',
        type: 'string',
        description:
          'The directory to search in. If not specified, the workspace root will be used. ' +
          'Must be a valid directory path relative to workspace.',
        required: false,
        default: '.'
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of files to return (default: 100, max: 100)',
        required: false,
        default: 100
      },
      {
        name: 'hidden',
        type: 'boolean',
        description: 'Include hidden files and directories (default: false)',
        required: false,
        default: false
      },
      {
        name: 'exclude',
        type: 'array',
        description: 'Glob patterns to exclude from search (e.g., ["**/test/**", "**/*.spec.ts"])',
        required: false,
        default: []
      }
    ]
  },

  async execute(
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const pattern = params.pattern as string
      const searchPath = path.resolve(context.workspaceDir, params.path || '.')

      // Security check: ensure search path is within workspace
      if (!searchPath.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Access denied: path outside workspace'
        }
      }

      const result = await executeGlob(pattern, searchPath, {
        limit: params.limit,
        hidden: params.hidden,
        exclude: params.exclude
      })

      if (result.error) {
        return {
          success: false,
          output: '',
          error: result.error
        }
      }

      return {
        success: true,
        output: formatGlobResult(result),
        metadata: {
          pattern,
          path: params.path || '.',
          matchCount: result.totalFiles,
          truncated: result.truncated,
          files: result.files.map(f => f.path)
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

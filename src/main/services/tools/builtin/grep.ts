import { spawn } from 'child_process'
import path from 'path'
import { spawnSync } from 'child_process'
import type { Tool, ToolExecutionContext, ToolExecutionResult } from '../tool.interface'

// Types
interface GrepMatch {
  file: string
  line: number
  column?: number
  text: string
}

interface GrepResult {
  matches: GrepMatch[]
  totalMatches: number
  filesSearched: number
  truncated: boolean
  error?: string
}

interface CountResult {
  file: string
  count: number
}

interface GrepOptions {
  pattern: string
  paths?: string[]
  globs?: string[]
  excludeGlobs?: string[]
  context?: number
  contextBefore?: number
  contextAfter?: number
  maxDepth?: number
  maxFilesize?: string
  maxCount?: number
  maxColumns?: number
  caseSensitive?: boolean
  wholeWord?: boolean
  fixedStrings?: boolean
  multiline?: boolean
  hidden?: boolean
  noIgnore?: boolean
  fileType?: string[]
  timeout?: number
}

type OutputMode = 'content' | 'files_with_matches' | 'count'

// Constants
const DEFAULT_MAX_DEPTH = 20
const DEFAULT_MAX_FILESIZE = '10M'
const DEFAULT_MAX_COUNT = 500
const DEFAULT_MAX_COLUMNS = 1000
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024

const RG_SAFETY_FLAGS = [
  '--no-follow',
  '--color=never',
  '--no-heading',
  '--line-number',
  '--with-filename'
] as const

const GREP_SAFETY_FLAGS = ['-n', '-H', '--color=never'] as const

type GrepBackend = 'rg' | 'grep'

interface ResolvedCli {
  path: string
  backend: GrepBackend
}

let cachedCli: ResolvedCli | null = null

function findExecutable(name: string): string | null {
  const isWindows = process.platform === 'win32'
  const cmd = isWindows ? 'where' : 'which'

  try {
    const result = spawnSync(cmd, [name], { encoding: 'utf-8', timeout: 5000 })
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split('\n')[0]
    }
  } catch {
    // Command execution failed
  }
  return null
}

function resolveGrepCli(): ResolvedCli {
  if (cachedCli) return cachedCli

  // Try ripgrep first (preferred)
  const systemRg = findExecutable('rg')
  if (systemRg) {
    cachedCli = { path: systemRg, backend: 'rg' }
    return cachedCli
  }

  // Fallback to grep
  const grep = findExecutable('grep')
  if (grep) {
    cachedCli = { path: grep, backend: 'grep' }
    return cachedCli
  }

  // Default to rg and hope it exists
  cachedCli = { path: 'rg', backend: 'rg' }
  return cachedCli
}

function buildRgArgs(options: GrepOptions): string[] {
  const args: string[] = [
    ...RG_SAFETY_FLAGS,
    `--max-depth=${Math.min(options.maxDepth ?? DEFAULT_MAX_DEPTH, DEFAULT_MAX_DEPTH)}`,
    `--max-filesize=${options.maxFilesize ?? DEFAULT_MAX_FILESIZE}`,
    `--max-count=${Math.min(options.maxCount ?? DEFAULT_MAX_COUNT, DEFAULT_MAX_COUNT)}`,
    `--max-columns=${Math.min(options.maxColumns ?? DEFAULT_MAX_COLUMNS, DEFAULT_MAX_COLUMNS)}`
  ]

  // Context lines
  if (options.contextBefore !== undefined && options.contextBefore > 0) {
    args.push(`-B${Math.min(options.contextBefore, 10)}`)
  }
  if (options.contextAfter !== undefined && options.contextAfter > 0) {
    args.push(`-A${Math.min(options.contextAfter, 10)}`)
  }
  if (
    options.context !== undefined &&
    options.context > 0 &&
    options.contextBefore === undefined &&
    options.contextAfter === undefined
  ) {
    args.push(`-C${Math.min(options.context, 10)}`)
  }

  if (!options.caseSensitive) args.push('-i')
  if (options.wholeWord) args.push('-w')
  if (options.fixedStrings) args.push('-F')
  if (options.multiline) args.push('-U')
  if (options.hidden) args.push('--hidden')
  if (options.noIgnore) args.push('--no-ignore')

  if (options.fileType?.length) {
    for (const type of options.fileType) {
      args.push(`--type=${type}`)
    }
  }

  if (options.globs) {
    for (const glob of options.globs) {
      args.push(`--glob=${glob}`)
    }
  }

  if (options.excludeGlobs) {
    for (const glob of options.excludeGlobs) {
      args.push(`--glob=!${glob}`)
    }
  }

  return args
}

function buildGrepArgs(options: GrepOptions): string[] {
  const args: string[] = [...GREP_SAFETY_FLAGS, '-r']

  // Context lines
  if (options.contextBefore !== undefined && options.contextBefore > 0) {
    args.push(`-B${Math.min(options.contextBefore, 10)}`)
  }
  if (options.contextAfter !== undefined && options.contextAfter > 0) {
    args.push(`-A${Math.min(options.contextAfter, 10)}`)
  }
  if (
    options.context !== undefined &&
    options.context > 0 &&
    options.contextBefore === undefined &&
    options.contextAfter === undefined
  ) {
    args.push(`-C${Math.min(options.context, 10)}`)
  }

  if (!options.caseSensitive) args.push('-i')
  if (options.wholeWord) args.push('-w')
  if (options.fixedStrings) args.push('-F')

  if (options.globs?.length) {
    for (const glob of options.globs) {
      args.push(`--include=${glob}`)
    }
  }

  if (options.excludeGlobs?.length) {
    for (const glob of options.excludeGlobs) {
      args.push(`--exclude=${glob}`)
    }
  }

  args.push('--exclude-dir=.git', '--exclude-dir=node_modules')

  return args
}

function buildArgs(options: GrepOptions, backend: GrepBackend): string[] {
  return backend === 'rg' ? buildRgArgs(options) : buildGrepArgs(options)
}

function parseOutput(output: string): GrepMatch[] {
  if (!output.trim()) return []

  const matches: GrepMatch[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    // Match format: file:line:text
    const match = line.match(/^(.+?):(\d+):(.*)$/)
    if (match) {
      matches.push({
        file: match[1],
        line: parseInt(match[2], 10),
        text: match[3]
      })
    }
  }

  return matches
}

function parseCountOutput(output: string): CountResult[] {
  if (!output.trim()) return []

  const results: CountResult[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    const match = line.match(/^(.+?):(\d+)$/)
    if (match) {
      results.push({
        file: match[1],
        count: parseInt(match[2], 10)
      })
    }
  }

  return results
}

function parseFilesOnlyOutput(output: string): string[] {
  if (!output.trim()) return []
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

async function runGrepSearch(options: GrepOptions): Promise<GrepResult> {
  const cli = resolveGrepCli()
  const args = buildArgs(options, cli.backend)
  const timeout = Math.min(options.timeout ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)

  if (cli.backend === 'rg') {
    args.push('--', options.pattern)
  } else {
    args.push('-e', options.pattern)
  }

  const paths = options.paths?.length ? options.paths : ['.']
  args.push(...paths)

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let killed = false

    const proc = spawn(cli.path, args, {
      cwd: options.paths?.[0] ?? process.cwd(),
      shell: process.platform === 'win32'
    })

    const timeoutId = setTimeout(() => {
      killed = true
      proc.kill()
      resolve({
        matches: [],
        totalMatches: 0,
        filesSearched: 0,
        truncated: false,
        error: `Search timeout after ${timeout}ms`
      })
    }, timeout)

    proc.stdout.on('data', (data) => {
      if (stdout.length < DEFAULT_MAX_OUTPUT_BYTES) {
        stdout += data.toString()
      }
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      if (killed) return

      const truncated = stdout.length >= DEFAULT_MAX_OUTPUT_BYTES
      const outputToProcess = truncated ? stdout.substring(0, DEFAULT_MAX_OUTPUT_BYTES) : stdout

      if (code !== null && code > 1 && stderr.trim()) {
        resolve({
          matches: [],
          totalMatches: 0,
          filesSearched: 0,
          truncated: false,
          error: stderr.trim()
        })
        return
      }

      const matches = parseOutput(outputToProcess)
      const filesSearched = new Set(matches.map((m) => m.file)).size

      resolve({
        matches,
        totalMatches: matches.length,
        filesSearched,
        truncated
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      resolve({
        matches: [],
        totalMatches: 0,
        filesSearched: 0,
        truncated: false,
        error: err.message
      })
    })
  })
}

async function runGrepCount(options: Omit<GrepOptions, 'context'>): Promise<CountResult[]> {
  const cli = resolveGrepCli()
  const args = buildArgs({ ...options, context: 0 }, cli.backend)
  const timeout = Math.min(options.timeout ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)

  if (cli.backend === 'rg') {
    args.push('--count', '--', options.pattern)
  } else {
    args.push('-c', '-e', options.pattern)
  }

  const paths = options.paths?.length ? options.paths : ['.']
  args.push(...paths)

  return new Promise((resolve, reject) => {
    let stdout = ''
    let killed = false

    const proc = spawn(cli.path, args, {
      cwd: options.paths?.[0] ?? process.cwd(),
      shell: process.platform === 'win32'
    })

    const timeoutId = setTimeout(() => {
      killed = true
      proc.kill()
      reject(new Error(`Count search timeout after ${timeout}ms`))
    }, timeout)

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.on('close', () => {
      clearTimeout(timeoutId)
      if (killed) return
      resolve(parseCountOutput(stdout))
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })
  })
}

async function runGrepFilesOnly(options: Omit<GrepOptions, 'context'>): Promise<string[]> {
  const cli = resolveGrepCli()
  const args = buildArgs({ ...options, context: 0 }, cli.backend)
  const timeout = Math.min(options.timeout ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)

  if (cli.backend === 'rg') {
    args.push('--files-with-matches', '--', options.pattern)
  } else {
    args.push('-l', '-e', options.pattern)
  }

  const paths = options.paths?.length ? options.paths : ['.']
  args.push(...paths)

  return new Promise((resolve, reject) => {
    let stdout = ''
    let killed = false

    const proc = spawn(cli.path, args, {
      cwd: options.paths?.[0] ?? process.cwd(),
      shell: process.platform === 'win32'
    })

    const timeoutId = setTimeout(() => {
      killed = true
      proc.kill()
      reject(new Error(`Files search timeout after ${timeout}ms`))
    }, timeout)

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.on('close', () => {
      clearTimeout(timeoutId)
      if (killed) return
      resolve(parseFilesOnlyOutput(stdout))
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })
  })
}

function formatGrepResult(result: GrepResult): string {
  if (result.error) {
    return `Error: ${result.error}`
  }

  if (result.matches.length === 0) {
    return 'No matches found'
  }

  const lines: string[] = []

  lines.push(`Found ${result.totalMatches} match(es) in ${result.filesSearched} file(s)`)
  if (result.truncated) {
    lines.push('[Output truncated due to size limit]')
  }
  lines.push('')

  const byFile = new Map<string, GrepMatch[]>()
  for (const match of result.matches) {
    const existing = byFile.get(match.file) || []
    existing.push(match)
    byFile.set(match.file, existing)
  }

  for (const [file, matches] of byFile) {
    lines.push(file)
    for (const match of matches) {
      lines.push(`  ${match.line}: ${match.text.trim()}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatCountResult(results: CountResult[]): string {
  if (results.length === 0) {
    return 'No matches found'
  }

  const total = results.reduce((sum, r) => sum + r.count, 0)
  const lines: string[] = [`Found ${total} match(es) in ${results.length} file(s):`, '']

  const sorted = [...results].sort((a, b) => b.count - a.count)

  for (const { file, count } of sorted) {
    lines.push(`  ${count.toString().padStart(6)}: ${file}`)
  }

  return lines.join('\n')
}

function formatFilesOnlyResult(files: string[]): string {
  if (files.length === 0) {
    return 'No files with matches found'
  }

  return [`Found matches in ${files.length} file(s):`, '', ...files.map((f) => `  ${f}`)].join('\n')
}

export const grepTool: Tool = {
  definition: {
    name: 'grep',
    description:
      'Fast content search tool with safety limits (60s timeout, 10MB output). ' +
      'Searches file contents using regular expressions. ' +
      'Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+"). ' +
      'Filter files by pattern with the glob parameter (e.g., "*.js", "*.{ts,tsx}") or type parameter (e.g., "js", "py"). ' +
      'Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts.',
    category: 'file',
    parameters: [
      {
        name: 'pattern',
        type: 'string',
        description: 'The regular expression pattern to search for in file contents',
        required: true
      },
      {
        name: 'path',
        type: 'string',
        description:
          'File or directory to search in. Defaults to the current working directory.',
        required: false
      },
      {
        name: 'glob',
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
        required: false
      },
      {
        name: 'type',
        type: 'string',
        description:
          'File type to search (e.g., "js", "py", "rust", "go", "java"). More efficient than glob for standard file types.',
        required: false
      },
      {
        name: 'output_mode',
        type: 'string',
        description:
          'Output mode: "content" shows matching lines, "files_with_matches" shows file paths (default), "count" shows match counts.',
        required: false,
        default: 'files_with_matches'
      },
      {
        name: 'case_insensitive',
        type: 'boolean',
        description: 'Case insensitive search (-i)',
        required: false,
        default: true
      },
      {
        name: 'context',
        type: 'number',
        description: 'Number of lines to show before and after each match (-C)',
        required: false
      },
      {
        name: 'context_before',
        type: 'number',
        description: 'Number of lines to show before each match (-B)',
        required: false
      },
      {
        name: 'context_after',
        type: 'number',
        description: 'Number of lines to show after each match (-A)',
        required: false
      },
      {
        name: 'line_numbers',
        type: 'boolean',
        description: 'Show line numbers in output (-n). Default is true.',
        required: false,
        default: true
      },
      {
        name: 'multiline',
        type: 'boolean',
        description:
          'Enable multiline mode where . matches newlines and patterns can span lines (-U)',
        required: false,
        default: false
      },
      {
        name: 'head_limit',
        type: 'number',
        description: 'Limit output to first N lines/entries',
        required: false
      }
    ]
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    try {
      const pattern = params.pattern as string
      if (!pattern) {
        return {
          success: false,
          output: '',
          error: 'Pattern is required'
        }
      }

      const searchPath = params.path
        ? path.resolve(context.workspaceDir, params.path as string)
        : context.workspaceDir

      // Security check: ensure path is within workspace
      if (!searchPath.startsWith(context.workspaceDir)) {
        return {
          success: false,
          output: '',
          error: 'Access denied: path outside workspace'
        }
      }

      const outputMode = (params.output_mode as OutputMode) || 'files_with_matches'
      const caseSensitive = params.case_insensitive === false // Default to case insensitive
      const headLimit = params.head_limit as number | undefined

      const options: GrepOptions = {
        pattern,
        paths: [searchPath],
        globs: params.glob ? [params.glob as string] : undefined,
        fileType: params.type ? [params.type as string] : undefined,
        caseSensitive,
        context: params.context as number | undefined,
        contextBefore: params.context_before as number | undefined,
        contextAfter: params.context_after as number | undefined,
        multiline: params.multiline as boolean | undefined
      }

      let output: string

      switch (outputMode) {
        case 'content': {
          const result = await runGrepSearch(options)
          if (headLimit && headLimit > 0) {
            result.matches = result.matches.slice(0, headLimit)
            result.totalMatches = Math.min(result.totalMatches, headLimit)
          }
          output = formatGrepResult(result)
          break
        }
        case 'count': {
          let results = await runGrepCount(options)
          if (headLimit && headLimit > 0) {
            results = results.slice(0, headLimit)
          }
          output = formatCountResult(results)
          break
        }
        case 'files_with_matches':
        default: {
          let files = await runGrepFilesOnly(options)
          if (headLimit && headLimit > 0) {
            files = files.slice(0, headLimit)
          }
          output = formatFilesOnlyResult(files)
          break
        }
      }

      return {
        success: true,
        output,
        metadata: {
          pattern,
          path: searchPath,
          outputMode
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

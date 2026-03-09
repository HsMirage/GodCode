/**
 * 工具输出截断 Hook
 *
 * 对大型工具输出进行智能截断，防止上下文窗口溢出
 */

import type { HookConfig, HookContext, ToolExecutionInput, ToolExecutionOutput } from './types'

// 默认最大 token 数（约 200k 字符）
const DEFAULT_MAX_TOKENS = 50_000

// 特定工具的最大 token 数
const TOOL_SPECIFIC_MAX_TOKENS: Record<string, number> = {
  grep: 30_000,
  Grep: 30_000,
  glob: 20_000,
  Glob: 20_000,
  webfetch: 10_000,
  WebFetch: 10_000,
  websearch: 10_000,
  WebSearch: 10_000,
  bash: 30_000,
  Bash: 30_000,
  file_read: 50_000,
  file_list: 20_000
}

// 可截断的工具列表
const TRUNCATABLE_TOOLS = new Set([
  'grep',
  'Grep',
  'glob',
  'Glob',
  'webfetch',
  'WebFetch',
  'websearch',
  'WebSearch',
  'bash',
  'Bash',
  'file_read',
  'file_list',
  'browser_snapshot',
  'browser_extract'
])

/**
 * 估算字符串的 token 数
 * 粗略估计：1 token ≈ 4 字符（英文）或 2 字符（中文）
 */
function estimateTokens(text: string): number {
  // 统计 ASCII 和非 ASCII 字符
  let asciiCount = 0
  let nonAsciiCount = 0

  for (const char of text) {
    if (char.charCodeAt(0) < 128) {
      asciiCount++
    } else {
      nonAsciiCount++
    }
  }

  // ASCII 字符约 4 个一个 token，非 ASCII 约 2 个一个 token
  return Math.ceil(asciiCount / 4 + nonAsciiCount / 2)
}

/**
 * 截断文本到指定 token 数
 */
function truncateToTokens(text: string, maxTokens: number): { result: string; truncated: boolean } {
  const estimatedTokens = estimateTokens(text)

  if (estimatedTokens <= maxTokens) {
    return { result: text, truncated: false }
  }

  // 估算需要保留的字符数
  const ratio = maxTokens / estimatedTokens
  const targetLength = Math.floor(text.length * ratio * 0.95) // 留 5% 余量

  // 尝试在行边界截断
  const lines = text.split('\n')
  let result = ''
  let currentLength = 0

  for (const line of lines) {
    if (currentLength + line.length + 1 > targetLength) {
      break
    }
    result += (result ? '\n' : '') + line
    currentLength += line.length + 1
  }

  // 如果结果太短，直接截断
  if (result.length < targetLength * 0.5) {
    result = text.substring(0, targetLength)
    // 尝试在单词边界截断
    const lastSpace = result.lastIndexOf(' ')
    if (lastSpace > targetLength * 0.8) {
      result = result.substring(0, lastSpace)
    }
  }

  const truncatedLines = text.split('\n').length - result.split('\n').length
  const truncationNote = `\n\n[OUTPUT TRUNCATED: Showing ${result.split('\n').length} of ${text.split('\n').length} lines (${truncatedLines} lines omitted)]`

  return {
    result: result + truncationNote,
    truncated: true
  }
}

/**
 * 智能截断策略：保留开头和结尾
 */
function smartTruncate(
  text: string,
  maxTokens: number
): { result: string; truncated: boolean } {
  const estimatedTokens = estimateTokens(text)

  if (estimatedTokens <= maxTokens) {
    return { result: text, truncated: false }
  }

  const lines = text.split('\n')
  const totalLines = lines.length

  if (totalLines <= 10) {
    // 行数太少，使用简单截断
    return truncateToTokens(text, maxTokens)
  }

  // 保留开头 40% 和结尾 20% 的 token 预算
  const headBudget = Math.floor(maxTokens * 0.4)
  const tailBudget = Math.floor(maxTokens * 0.2)

  // 收集开头行
  const headLines: string[] = []
  let headTokens = 0
  for (const line of lines) {
    const lineTokens = estimateTokens(line)
    if (headTokens + lineTokens > headBudget) break
    headLines.push(line)
    headTokens += lineTokens
  }

  // 收集结尾行
  const tailLines: string[] = []
  let tailTokens = 0
  for (let i = lines.length - 1; i >= headLines.length; i--) {
    const line = lines[i]
    const lineTokens = estimateTokens(line)
    if (tailTokens + lineTokens > tailBudget) break
    tailLines.unshift(line)
    tailTokens += lineTokens
  }

  const omittedLines = totalLines - headLines.length - tailLines.length
  const separator = `\n\n... [${omittedLines} lines omitted] ...\n\n`

  return {
    result: headLines.join('\n') + separator + tailLines.join('\n'),
    truncated: true
  }
}

/**
 * 创建工具输出截断 Hook
 */
export function createToolOutputTruncatorHook(options?: {
  defaultMaxTokens?: number
  toolMaxTokens?: Record<string, number>
  truncateAllTools?: boolean
  useSmartTruncation?: boolean
}): HookConfig<'onToolEnd'> {
  const defaultMaxTokens = options?.defaultMaxTokens ?? DEFAULT_MAX_TOKENS
  const toolMaxTokens = { ...TOOL_SPECIFIC_MAX_TOKENS, ...options?.toolMaxTokens }
  const truncateAllTools = options?.truncateAllTools ?? false
  const useSmartTruncation = options?.useSmartTruncation ?? true

  return {
    id: 'tool-output-truncator',
    name: 'Tool Output Truncator',
    event: 'onToolEnd',
    source: 'builtin',
    scope: 'tool',
    description: 'Truncates large tool outputs to prevent context window overflow',
    priority: 50, // 在其他 hooks 之后执行

    callback: async (
      _context: HookContext,
      input: ToolExecutionInput,
      output: ToolExecutionOutput
    ): Promise<{ modifiedOutput?: Partial<ToolExecutionOutput> }> => {
      // 检查是否需要截断
      if (!truncateAllTools && !TRUNCATABLE_TOOLS.has(input.tool)) {
        return {}
      }

      // 检查输出类型
      if (typeof output.output !== 'string') {
        return {}
      }

      // 获取该工具的最大 token 数
      const maxTokens = toolMaxTokens[input.tool] ?? defaultMaxTokens

      // 执行截断
      const truncateFn = useSmartTruncation ? smartTruncate : truncateToTokens
      const { result, truncated } = truncateFn(output.output, maxTokens)

      if (!truncated) {
        return {}
      }

      return {
        modifiedOutput: {
          output: result,
          metadata: {
            ...output.metadata,
            truncated: true,
            originalLength: output.output.length,
            truncatedLength: result.length
          }
        }
      }
    }
  }
}

/**
 * 导出工具函数供其他模块使用
 */
export { estimateTokens, truncateToTokens, smartTruncate }

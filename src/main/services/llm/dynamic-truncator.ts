import { logger } from '../../../shared/logger'

const CHARS_PER_TOKEN_ESTIMATE = 4
const DEFAULT_TARGET_MAX_TOKENS = 50_000

export interface TruncationResult {
  result: string
  truncated: boolean
  removedCount?: number
}

export interface TruncationOptions {
  targetMaxTokens?: number
  preserveHeaderLines?: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

export function truncateToTokenLimit(
  output: string,
  maxTokens: number,
  preserveHeaderLines = 3
): TruncationResult {
  const currentTokens = estimateTokens(output)

  if (currentTokens <= maxTokens) {
    return { result: output, truncated: false }
  }

  const lines = output.split('\n')

  if (lines.length <= preserveHeaderLines) {
    const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE
    return {
      result: output.slice(0, maxChars) + '\n\n[Output truncated due to context window limit]',
      truncated: true
    }
  }

  const headerLines = lines.slice(0, preserveHeaderLines)
  const contentLines = lines.slice(preserveHeaderLines)

  const headerText = headerLines.join('\n')
  const headerTokens = estimateTokens(headerText)
  const truncationMessageTokens = 50
  const availableTokens = maxTokens - headerTokens - truncationMessageTokens

  if (availableTokens <= 0) {
    return {
      result: headerText + '\n\n[Content truncated due to context window limit]',
      truncated: true,
      removedCount: contentLines.length
    }
  }

  const resultLines: string[] = []
  let currentTokenCount = 0

  for (const line of contentLines) {
    const lineTokens = estimateTokens(line + '\n')
    if (currentTokenCount + lineTokens > availableTokens) {
      break
    }
    resultLines.push(line)
    currentTokenCount += lineTokens
  }

  const truncatedContent = [...headerLines, ...resultLines].join('\n')
  const removedCount = contentLines.length - resultLines.length

  return {
    result:
      truncatedContent + `\n\n[${removedCount} more lines truncated due to context window limit]`,
    truncated: true,
    removedCount
  }
}

export interface ContextWindowUsage {
  usedTokens: number
  remainingTokens: number
  usagePercentage: number
}

export function dynamicTruncate(
  output: string,
  contextUsage?: ContextWindowUsage,
  options: TruncationOptions = {}
): TruncationResult {
  const { targetMaxTokens = DEFAULT_TARGET_MAX_TOKENS, preserveHeaderLines = 3 } = options

  if (!contextUsage) {
    return truncateToTokenLimit(output, targetMaxTokens, preserveHeaderLines)
  }

  const maxOutputTokens = Math.min(contextUsage.remainingTokens * 0.5, targetMaxTokens)

  if (maxOutputTokens <= 0) {
    logger.warn('[DynamicTruncator] Context window exhausted')
    return {
      result: '[Output suppressed - context window exhausted]',
      truncated: true
    }
  }

  return truncateToTokenLimit(output, maxOutputTokens, preserveHeaderLines)
}

export function createDynamicTruncator(contextWindowLimit = 200_000) {
  let usedTokens = 0

  return {
    truncate: (output: string, options?: TruncationOptions): TruncationResult => {
      const contextUsage: ContextWindowUsage = {
        usedTokens,
        remainingTokens: contextWindowLimit - usedTokens,
        usagePercentage: usedTokens / contextWindowLimit
      }
      const result = dynamicTruncate(output, contextUsage, options)
      usedTokens += estimateTokens(result.result)
      return result
    },

    getUsage: (): ContextWindowUsage => ({
      usedTokens,
      remainingTokens: contextWindowLimit - usedTokens,
      usagePercentage: usedTokens / contextWindowLimit
    }),

    addTokens: (count: number): void => {
      usedTokens += count
    },

    reset: (): void => {
      usedTokens = 0
    },

    truncateSync: (
      output: string,
      maxTokens: number,
      preserveHeaderLines?: number
    ): TruncationResult => truncateToTokenLimit(output, maxTokens, preserveHeaderLines)
  }
}

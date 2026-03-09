export type ContextInjectionType =
  | 'workspace-rules'
  | 'continuation-reminder'
  | 'hook-injection'
  | 'context-overflow-warning'
  | 'edit-recovery'
  | 'custom'

export interface ContextInjectionCandidate {
  type: ContextInjectionType
  source: string
  content: string
  priority?: number
}

export interface ContextInjectionSummaryItem {
  type: ContextInjectionType
  source: string
  priority: number
  originalLength: number
  finalLength: number
  truncated: boolean
  filteredSensitive: boolean
  filteredLineCount: number
  dropped: boolean
}

export interface ContextInjectionSummary {
  title: string
  totalCount: number
  acceptedCount: number
  droppedCount: number
  filteredCount: number
  truncatedCount: number
  items: ContextInjectionSummaryItem[]
}

export interface BuildContextInjectionOptions {
  maxTotalChars?: number
  maxItemChars?: number
  sensitivePathPatterns?: RegExp[]
}

export interface BuildContextInjectionResult {
  injectedContent: string
  summary: ContextInjectionSummary
}

const DEFAULT_TOTAL_CHAR_BUDGET = 6_000
const DEFAULT_ITEM_CHAR_BUDGET = 2_000

export const DEFAULT_SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(?:^|[/])\.env(?:\.|$|[/])/i,
  /(?:^|[/])certs?(?:[/]|$)/i,
  /(?:^|[/])secrets?(?:[/]|$)/i,
  /(?:^|[/])credentials?(?:\.json|[/]|$)/i,
  /(?:^|[/])id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.(?:pem|p12|pfx|key)$/i,
  /(?:^|[/])ssh(?:[/]|$)/i
]

const DEFAULT_PRIORITY_BY_TYPE: Record<ContextInjectionType, number> = {
  'workspace-rules': 10,
  'continuation-reminder': 20,
  'hook-injection': 30,
  'context-overflow-warning': 40,
  'edit-recovery': 40,
  custom: 50
}

function matchesSensitivePath(input: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(input))
}

function filterSensitiveSections(content: string, patterns: RegExp[]): {
  content: string
  filteredSensitive: boolean
  filteredLineCount: number
} {
  const normalized = content.trim()
  if (!normalized) {
    return { content: '', filteredSensitive: false, filteredLineCount: 0 }
  }

  let filteredLineCount = 0
  let filteredSensitive = false

  const filteredSections = normalized
    .split('\n\n---\n\n')
    .map(section => section.trim())
    .filter(Boolean)
    .flatMap(section => {
      const firstLine = section.split('\n', 1)[0]?.trim() || ''
      const sectionPath = firstLine.startsWith('## ') ? firstLine.slice(3).trim() : ''

      if (sectionPath && matchesSensitivePath(sectionPath, patterns)) {
        filteredSensitive = true
        filteredLineCount += section.split('\n').length
        return []
      }

      const keptLines = section
        .split('\n')
        .filter(line => {
          if (matchesSensitivePath(line, patterns)) {
            filteredSensitive = true
            filteredLineCount += 1
            return false
          }
          return true
        })
        .join('\n')
        .trim()

      return keptLines ? [keptLines] : []
    })

  return {
    content: filteredSections.join('\n\n---\n\n').trim(),
    filteredSensitive,
    filteredLineCount
  }
}

function truncateWithNotice(content: string, maxChars: number): { content: string; truncated: boolean } {
  if (content.length <= maxChars) {
    return { content, truncated: false }
  }

  if (maxChars <= 30) {
    return {
      content: content.slice(0, Math.max(0, maxChars)).trimEnd(),
      truncated: true
    }
  }

  const trimmed = content.slice(0, maxChars - 24).trimEnd()
  return {
    content: `${trimmed}\n[TRUNCATED CONTEXT]`,
    truncated: true
  }
}

export function buildContextInjectionPayload(
  candidates: ContextInjectionCandidate[],
  options: BuildContextInjectionOptions = {}
): BuildContextInjectionResult {
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_TOTAL_CHAR_BUDGET
  const maxItemChars = options.maxItemChars ?? DEFAULT_ITEM_CHAR_BUDGET
  const patterns = options.sensitivePathPatterns ?? DEFAULT_SENSITIVE_PATH_PATTERNS

  const sorted = [...candidates]
    .map(candidate => ({
      ...candidate,
      priority: candidate.priority ?? DEFAULT_PRIORITY_BY_TYPE[candidate.type]
    }))
    .filter(candidate => candidate.content.trim().length > 0)
    .sort((a, b) => a.priority - b.priority)

  const acceptedContents: string[] = []
  const summaryItems: ContextInjectionSummaryItem[] = []
  let remaining = Math.max(0, maxTotalChars)

  for (const item of sorted) {
    const originalLength = item.content.length

    const filtered = filterSensitiveSections(item.content, patterns)
    const filteredContent = filtered.content.trim()

    if (!filteredContent) {
      summaryItems.push({
        type: item.type,
        source: item.source,
        priority: item.priority,
        originalLength,
        finalLength: 0,
        truncated: false,
        filteredSensitive: filtered.filteredSensitive,
        filteredLineCount: filtered.filteredLineCount,
        dropped: true
      })
      continue
    }

    const perItemTruncation = truncateWithNotice(filteredContent, maxItemChars)
    let finalContent = perItemTruncation.content
    let truncated = perItemTruncation.truncated

    if (remaining <= 0) {
      summaryItems.push({
        type: item.type,
        source: item.source,
        priority: item.priority,
        originalLength,
        finalLength: 0,
        truncated,
        filteredSensitive: filtered.filteredSensitive,
        filteredLineCount: filtered.filteredLineCount,
        dropped: true
      })
      continue
    }

    if (finalContent.length > remaining) {
      const budgetTruncation = truncateWithNotice(finalContent, remaining)
      finalContent = budgetTruncation.content
      truncated = truncated || budgetTruncation.truncated
    }

    if (!finalContent.trim()) {
      summaryItems.push({
        type: item.type,
        source: item.source,
        priority: item.priority,
        originalLength,
        finalLength: 0,
        truncated,
        filteredSensitive: filtered.filteredSensitive,
        filteredLineCount: filtered.filteredLineCount,
        dropped: true
      })
      continue
    }

    acceptedContents.push(finalContent)
    remaining = Math.max(0, remaining - finalContent.length)

    summaryItems.push({
      type: item.type,
      source: item.source,
      priority: item.priority,
      originalLength,
      finalLength: finalContent.length,
      truncated,
      filteredSensitive: filtered.filteredSensitive,
      filteredLineCount: filtered.filteredLineCount,
      dropped: false
    })
  }

  const acceptedCount = summaryItems.filter(item => !item.dropped).length
  const droppedCount = summaryItems.length - acceptedCount
  const filteredCount = summaryItems.filter(item => item.filteredSensitive).length
  const truncatedCount = summaryItems.filter(item => item.truncated).length

  return {
    injectedContent: acceptedContents.join('\n\n').trim(),
    summary: {
      title: '本次注入上下文摘要',
      totalCount: summaryItems.length,
      acceptedCount,
      droppedCount,
      filteredCount,
      truncatedCount,
      items: summaryItems
    }
  }
}

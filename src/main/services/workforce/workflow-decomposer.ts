import fs from 'node:fs'
import path from 'node:path'
import type { SubTask } from './workflow-types'
import {
  KNOWN_SUBAGENT_CODES,
  KNOWN_CATEGORY_CODES,
  resolveCanonicalSubagent,
  resolveCanonicalCategory
} from './workflow-types'

// ---------------------------------------------------------------------------
// Plan file parsing
// ---------------------------------------------------------------------------

export function parsePlanSubtasks(planPath: string): SubTask[] {
  const content = fs.readFileSync(planPath, 'utf-8')
  return parsePlanSubtasksFromContent(content)
}

export function parsePlanSubtasksFromContent(content: string): SubTask[] {
  const lines = content.split(/\r?\n/)
  const pending: Array<{
    logicalId: string
    description: string
    rawDependencies: string[]
    assignedAgent?: string
    assignedCategory?: string
  }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const checkboxMatch = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/)
    if (!checkboxMatch) continue

    const completed = checkboxMatch[1].toLowerCase() === 'x'
    if (completed) continue

    const rawDescription = checkboxMatch[2]
    const normalizedDescription = rawDescription
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const explicitId =
      normalizedDescription.match(/\bTask\s+([0-9]+(?:\.[0-9]+)*)\b/i)?.[1] ??
      normalizedDescription.match(/^([0-9]+(?:\.[0-9]+)*)[:：]/)?.[1]
    const logicalId = explicitId ?? String(pending.length + 1)
    const taskBlockLines: string[] = []

    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j]
      if (/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/i.test(nextLine)) break
      if (!nextLine.trim()) continue
      taskBlockLines.push(nextLine)
    }

    const rawDependencies = [normalizedDescription, ...taskBlockLines].flatMap(blockLine =>
      extractDependencyIds(blockLine)
    )
    const executionHint = extractTaskExecutionHint([normalizedDescription, ...taskBlockLines])

    pending.push({
      logicalId,
      description: normalizedDescription,
      rawDependencies: Array.from(new Set(rawDependencies)),
      assignedAgent: executionHint.assignedAgent,
      assignedCategory: executionHint.assignedCategory
    })
  }

  const hasExplicitDependencies = pending.some(task => task.rawDependencies.length > 0)
  const knownIds = new Set(pending.map(task => task.logicalId))

  return pending.map((task, index) => {
    const safeId = task.logicalId.replace(/[^a-zA-Z0-9_.-]/g, '-')
    const explicitDependencies = task.rawDependencies
      .filter(dep => knownIds.has(dep))
      .map(dep => `plan-${dep.replace(/[^a-zA-Z0-9_.-]/g, '-')}`)
    const previous =
      index > 0 ? pending[index - 1].logicalId.replace(/[^a-zA-Z0-9_.-]/g, '-') : ''
    const dependencies = hasExplicitDependencies
      ? explicitDependencies
      : previous
        ? [`plan-${previous}`]
        : []
    return {
      id: `plan-${safeId}`,
      description: task.description,
      dependencies,
      assignedAgent: task.assignedAgent,
      assignedCategory: task.assignedCategory,
      source: 'plan' as const
    }
  })
}

// ---------------------------------------------------------------------------
// LLM decomposition output normalization
// ---------------------------------------------------------------------------

export function normalizeDecomposedSubtasks(input: unknown): SubTask[] {
  if (!Array.isArray(input)) return []

  const normalized: SubTask[] = []
  for (let index = 0; index < input.length; index++) {
    const item = input[index]
    if (!item || typeof item !== 'object') continue

    const payload = item as Record<string, unknown>
    const id =
      (typeof payload.id === 'string' && payload.id.trim()) || `task-${index + 1}`
    const description =
      (typeof payload.description === 'string' && payload.description.trim()) ||
      `Task ${index + 1}`
    const dependencies = Array.isArray(payload.dependencies)
      ? payload.dependencies
          .filter((dep): dep is string => typeof dep === 'string' && dep.trim().length > 0)
          .map(dep => dep.trim())
      : []

    const explicitSubagent =
      (typeof payload.subagent_type === 'string' && payload.subagent_type) ||
      (typeof payload.assignedAgent === 'string' && payload.assignedAgent) ||
      undefined
    const explicitCategory =
      (typeof payload.category === 'string' && payload.category) ||
      (typeof payload.assignedCategory === 'string' && payload.assignedCategory) ||
      undefined

    const assignedAgent = resolveCanonicalSubagent(explicitSubagent)
    const assignedCategory = resolveCanonicalCategory(explicitCategory)

    normalized.push({
      id: id.trim(),
      description: description.trim(),
      dependencies: Array.from(new Set(dependencies)),
      assignedAgent,
      assignedCategory
    })
  }

  return normalized
}

// ---------------------------------------------------------------------------
// Plan path resolution helpers
// ---------------------------------------------------------------------------

export function extractPlanPathFromInput(input: string): string | undefined {
  const match = input.match(
    /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
  )
  return match?.[0]
}

export function normalizePlanPath(rawPath: string, workspaceDir: string): string {
  const trimmed = rawPath.trim().replace(/^["']|["']$/g, '')
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed)
  return path.resolve(workspaceDir, trimmed)
}

export function shouldPreferPlanExecution(input: string, agentCode?: string): boolean {
  if (agentCode === 'kuafu') return true
  return /(执行计划|继续计划|run plan|execute plan|resume plan|按计划)/i.test(input)
}

// ---------------------------------------------------------------------------
// Referenced markdown helpers
// ---------------------------------------------------------------------------

export interface ReferencedMarkdownFile {
  rawPath: string
  resolvedPath: string
}

export interface ReferencedMarkdownContext {
  existingFiles: ReferencedMarkdownFile[]
  missingFiles: string[]
  needsExistingFiles: boolean
}

export function extractMarkdownPathCandidates(input: string): string[] {
  const matches = Array.from(input.matchAll(/(?:[A-Za-z]:)?[^\s"'`<>]+\.md\b/gi))
    .map(match => match[0].replace(/[，。,.!?;:]+$/u, '').trim())
    .filter(Boolean)
    .filter(candidate => !/\.sisyphus[\\/]+plans[\\/]/i.test(candidate))
  return Array.from(new Set(matches))
}

export function shouldRequireReferencedFiles(input: string): boolean {
  return /(根据|基于|依据|按照|依照|参考|参照|from|based on|according to|per)\s+[^\n]*\.md/i.test(
    input
  )
}

export function buildReferencedMarkdownDecompositionContext(
  referencedFiles: ReferencedMarkdownFile[]
): string | undefined {
  if (referencedFiles.length === 0) return undefined

  const snippets: string[] = []
  for (const file of referencedFiles.slice(0, 3)) {
    try {
      const content = fs.readFileSync(file.resolvedPath, 'utf-8').trim()
      if (!content) continue
      const clippedContent =
        content.length > 6000 ? `${content.slice(0, 6000)}\n[...截断...]` : content
      snippets.push(`FILE: ${file.rawPath}\nPATH: ${file.resolvedPath}\nCONTENT:\n${clippedContent}`)
    } catch {
      // skip unreadable files
    }
  }

  return snippets.length > 0 ? snippets.join('\n\n---\n\n') : undefined
}

// ---------------------------------------------------------------------------
// Dependency and execution-hint extraction (pure helpers)
// ---------------------------------------------------------------------------

export function extractDependencyIds(text: string): string[] {
  const normalized = text
    .replace(/[*`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hasDependencyMarker =
    /(depends on|dependencies|dependency|blocked by|依赖|依赖于|前置|阻塞于|blocked-by|deps?)/i.test(
      normalized
    )
  if (!hasDependencyMarker) return []

  const dependencyPrefix =
    /(depends on|dependencies|dependency|blocked by|依赖|依赖于|前置|阻塞于|blocked-by|deps?)\s*[:：]\s*(.+)$/i
  const prefixMatch = normalized.match(dependencyPrefix)
  const targetText = prefixMatch ? prefixMatch[2] : normalized
  const ids = Array.from(targetText.matchAll(/(?:task\s*)?([0-9]+(?:\.[0-9]+)*)/gi)).map(
    match => match[1]
  )
  return Array.from(new Set(ids))
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface TaskExecutionProfile {
  assignedAgent?: string
  assignedCategory?: string
}

export function extractTaskExecutionHint(lines: string[]): TaskExecutionProfile {
  const normalized = lines
    .map(line => line.replace(/[*`]/g, ' ').trim())
    .filter(Boolean)

  let assignedAgent: string | undefined
  let assignedCategory: string | undefined

  const subagentCandidates = Array.from(KNOWN_SUBAGENT_CODES)
  const categoryCandidates = Array.from(KNOWN_CATEGORY_CODES)

  for (const line of normalized) {
    const explicitAssignee =
      line.match(/subagent_type\s*[:：=]\s*["']?([a-zA-Z0-9_-]+)["']?/i)?.[1] ||
      line.match(/task\s*\(\s*subagent_type\s*=\s*["']([a-zA-Z0-9_-]+)["']/i)?.[1] ||
      line.match(/(?:agent|代理|执行者|assignee)\s*[:：=]\s*([a-zA-Z0-9_-]+)/i)?.[1] ||
      line.match(/\[agent\s*[:：=]\s*([a-zA-Z0-9_-]+)\]/i)?.[1]
    if (explicitAssignee) {
      assignedAgent = assignedAgent || resolveCanonicalSubagent(explicitAssignee)
      assignedCategory = assignedCategory || resolveCanonicalCategory(explicitAssignee)
    }

    const categoryHint =
      line.match(/(?:category|类别)\s*[:：=]\s*([a-zA-Z0-9_-]+)/i)?.[1] ||
      line.match(/task\s*\(\s*category\s*=\s*["']([a-zA-Z0-9_-]+)["']\s*\)/i)?.[1]
    if (categoryHint) {
      assignedCategory = assignedCategory || resolveCanonicalCategory(categoryHint)
    }

    if (!assignedAgent) {
      const inlineSubagent = subagentCandidates.find(code =>
        new RegExp(`\\b${escapeForRegex(code)}\\b`, 'i').test(line)
      )
      if (inlineSubagent) assignedAgent = resolveCanonicalSubagent(inlineSubagent)
    }

    if (!assignedCategory) {
      const inlineCategory = categoryCandidates.find(code =>
        new RegExp(`\\b${escapeForRegex(code)}\\b`, 'i').test(line)
      )
      if (inlineCategory) assignedCategory = resolveCanonicalCategory(inlineCategory)
    }
  }

  return { assignedAgent, assignedCategory }
}

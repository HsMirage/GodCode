import type { Task } from '@/types/domain'

export type DiagnosticCategory = 'config' | 'permission' | 'tool' | 'model'

export interface TaskDiagnosticSummary {
  category: DiagnosticCategory
  label: string
  reason: string
  evidence: string[]
  source: 'recovery-terminal' | 'recovery-history' | 'run-log' | 'task-output'
  updatedAt?: string
  score: number
}

export interface SessionDiagnosticSummary {
  total: number
  config: number
  permission: number
  tool: number
  model: number
}

interface ObservabilityAssignment {
  taskId?: string
  persistedTaskId?: string
}

interface RecoveryTerminalDiagnosticLike {
  taskId?: string
  failureClass?: string
  reason?: string
  remediation?: string[]
  timestamp?: string
}

interface RecoveryHistoryLike {
  taskId?: string
  failureClass?: string
  sourceError?: string
  repairObjective?: string
  strategy?: string
  status?: string
  finishedAt?: string
}

interface ObservabilityRecoveryStateLike {
  terminalDiagnostics?: RecoveryTerminalDiagnosticLike[]
  history?: RecoveryHistoryLike[]
}

export interface WorkflowObservabilityForDiagnostics {
  assignments?: ObservabilityAssignment[]
  recoveryState?: ObservabilityRecoveryStateLike
}

interface DiagnosticCandidate {
  category: DiagnosticCategory
  reason: string
  evidence: string[]
  source: TaskDiagnosticSummary['source']
  updatedAt?: string
  score: number
}

const CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  config: '配置错误',
  permission: '权限拒绝',
  tool: '工具不可用',
  model: '模型失败'
}

const PERMISSION_PATTERN =
  /(permission|forbidden|denied|403|access denied|not allowed|eacces|operation not permitted|权限|拒绝)/i
const CONFIG_PATTERN =
  /(api key|unauthorized|401|auth|credential|token invalid|configuration|config|base url|endpoint|missing env|apikey|密钥|配置)/i
const TOOL_PATTERN =
  /(tool|module not found|cannot find module|command not found|not installed|missing package|dependency|executable file not found|no such file or directory|ENOENT|工具|依赖)/i
const MODEL_PATTERN =
  /(model|llm|provider|rate limit|429|context length|max tokens|completion|stream|anthropic|openai|gemini|overloaded|模型|推理)/i

export function getDiagnosticCategoryLabel(category: DiagnosticCategory): string {
  return CATEGORY_LABELS[category]
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function detectCategoryFromText(text: string): DiagnosticCategory | null {
  if (!text) return null
  if (PERMISSION_PATTERN.test(text)) return 'permission'
  if (CONFIG_PATTERN.test(text)) return 'config'
  if (TOOL_PATTERN.test(text)) return 'tool'
  if (MODEL_PATTERN.test(text)) return 'model'
  return null
}

function mapFailureClassToCategory(failureClass?: string): DiagnosticCategory {
  if (failureClass === 'permission') return 'permission'
  if (failureClass === 'config') return 'config'
  if (failureClass === 'dependency') return 'tool'
  return 'model'
}

function resolveCategory(failureClass: string | undefined, signalText: string): DiagnosticCategory {
  return detectCategoryFromText(signalText) || mapFailureClassToCategory(failureClass)
}

function createSummary(candidate: DiagnosticCandidate): TaskDiagnosticSummary {
  return {
    category: candidate.category,
    label: getDiagnosticCategoryLabel(candidate.category),
    reason: candidate.reason,
    evidence: candidate.evidence,
    source: candidate.source,
    updatedAt: candidate.updatedAt,
    score: candidate.score
  }
}

function buildTaskIdMap(assignments: ObservabilityAssignment[]): Map<string, string> {
  const logicalToPersisted = new Map<string, string>()
  for (const assignment of assignments) {
    const logicalId = typeof assignment.taskId === 'string' ? assignment.taskId : undefined
    const persistedId = typeof assignment.persistedTaskId === 'string' ? assignment.persistedTaskId : undefined
    if (logicalId && persistedId) {
      logicalToPersisted.set(logicalId, persistedId)
    }
  }
  return logicalToPersisted
}

function resolvePersistedTaskId(
  rawTaskId: string | undefined,
  logicalToPersisted: Map<string, string>,
  taskIds: Set<string>
): string | null {
  if (!rawTaskId) return null
  if (taskIds.has(rawTaskId)) return rawTaskId
  const mapped = logicalToPersisted.get(rawTaskId)
  if (mapped && taskIds.has(mapped)) return mapped
  return null
}

function upsertDiagnostic(
  container: Record<string, TaskDiagnosticSummary>,
  taskId: string,
  candidate: DiagnosticCandidate
) {
  const previous = container[taskId]
  if (!previous || candidate.score > previous.score) {
    container[taskId] = createSummary(candidate)
    return
  }

  if (candidate.score === previous.score && candidate.reason.length > previous.reason.length) {
    container[taskId] = createSummary(candidate)
    return
  }

  if (candidate.evidence.length > 0) {
    const mergedEvidence = Array.from(new Set([...previous.evidence, ...candidate.evidence])).slice(0, 6)
    container[taskId] = { ...previous, evidence: mergedEvidence }
  }
}

export function summarizeSessionDiagnostics(
  diagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
): SessionDiagnosticSummary {
  const summary: SessionDiagnosticSummary = {
    total: 0,
    config: 0,
    permission: 0,
    tool: 0,
    model: 0
  }

  for (const diagnostic of Object.values(diagnosticsByTaskId)) {
    summary.total += 1
    summary[diagnostic.category] += 1
  }

  return summary
}

export function buildTaskDiagnosticsFromObservability(
  tasks: Task[],
  observability: WorkflowObservabilityForDiagnostics | null | undefined
): {
  byTaskId: Record<string, TaskDiagnosticSummary>
  summary: SessionDiagnosticSummary
} {
  const diagnosticsByTaskId: Record<string, TaskDiagnosticSummary> = {}
  const taskIds = new Set(tasks.map(task => task.id))
  const assignments = Array.isArray(observability?.assignments) ? observability.assignments : []
  const logicalToPersisted = buildTaskIdMap(assignments)

  const terminalDiagnostics = Array.isArray(observability?.recoveryState?.terminalDiagnostics)
    ? observability.recoveryState?.terminalDiagnostics
    : []

  for (const terminal of terminalDiagnostics) {
    const persistedTaskId = resolvePersistedTaskId(terminal.taskId, logicalToPersisted, taskIds)
    if (!persistedTaskId) continue

    const signalText = [
      normalizeText(terminal.reason),
      Array.isArray(terminal.remediation) ? terminal.remediation.join(' ') : ''
    ]
      .filter(Boolean)
      .join(' ')

    upsertDiagnostic(diagnosticsByTaskId, persistedTaskId, {
      category: resolveCategory(terminal.failureClass, signalText),
      reason: normalizeText(terminal.reason) || '恢复流程终止，建议查看终端诊断',
      evidence: [signalText].filter(Boolean),
      source: 'recovery-terminal',
      updatedAt: terminal.timestamp,
      score: 40
    })
  }

  const historyRecords = Array.isArray(observability?.recoveryState?.history)
    ? observability.recoveryState?.history
    : []

  for (const history of historyRecords) {
    if (history.status !== 'failed' && history.status !== 'aborted') {
      continue
    }

    const persistedTaskId = resolvePersistedTaskId(history.taskId, logicalToPersisted, taskIds)
    if (!persistedTaskId) continue

    const signalText = [
      normalizeText(history.sourceError),
      normalizeText(history.repairObjective),
      normalizeText(history.strategy)
    ]
      .filter(Boolean)
      .join(' ')

    upsertDiagnostic(diagnosticsByTaskId, persistedTaskId, {
      category: resolveCategory(history.failureClass, signalText),
      reason: normalizeText(history.sourceError) || '恢复记录显示任务失败',
      evidence: [signalText].filter(Boolean),
      source: 'recovery-history',
      updatedAt: history.finishedAt,
      score: 20
    })
  }

  for (const task of tasks) {
    if (task.status !== 'failed') continue
    if (diagnosticsByTaskId[task.id]) continue

    const taskOutput = normalizeText(task.output)
    const category = detectCategoryFromText(taskOutput) || 'model'
    upsertDiagnostic(diagnosticsByTaskId, task.id, {
      category,
      reason: taskOutput ? taskOutput.slice(0, 280) : '任务失败但未记录恢复诊断，归类为模型失败',
      evidence: taskOutput ? [taskOutput] : [],
      source: 'task-output',
      score: 8
    })
  }

  return {
    byTaskId: diagnosticsByTaskId,
    summary: summarizeSessionDiagnostics(diagnosticsByTaskId)
  }
}

export function classifyRunLogDiagnostics(runLogs: Array<{ level?: string; message?: string; data?: unknown }>):
  | TaskDiagnosticSummary
  | undefined {
  if (!Array.isArray(runLogs) || runLogs.length === 0) {
    return undefined
  }

  let best: TaskDiagnosticSummary | undefined
  for (const log of runLogs) {
    const signalText = [normalizeText(log.message), normalizeText(log.data)].filter(Boolean).join(' ')
    const category = detectCategoryFromText(signalText)
    if (!category) continue

    const level = String(log.level || '').toLowerCase()
    const weight = level === 'error' ? 16 : level === 'warn' ? 12 : 6
    const candidate: TaskDiagnosticSummary = {
      category,
      label: getDiagnosticCategoryLabel(category),
      reason: normalizeText(log.message) || 'Run 日志存在异常信号',
      evidence: [signalText],
      source: 'run-log',
      score: weight
    }

    if (!best || candidate.score > best.score) {
      best = candidate
    }
  }

  return best
}

export function mergeTaskDiagnostics(
  primary?: TaskDiagnosticSummary,
  secondary?: TaskDiagnosticSummary
): TaskDiagnosticSummary | undefined {
  if (!primary) return secondary
  if (!secondary) return primary

  if (secondary.score > primary.score) {
    return {
      ...secondary,
      evidence: Array.from(new Set([...secondary.evidence, ...primary.evidence])).slice(0, 6)
    }
  }

  return {
    ...primary,
    evidence: Array.from(new Set([...primary.evidence, ...secondary.evidence])).slice(0, 6)
  }
}

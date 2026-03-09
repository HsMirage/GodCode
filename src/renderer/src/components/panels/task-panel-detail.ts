import type { Task } from '@renderer/types/domain'
import type { WorkLogEntry } from '../../store/agent.store'
import { sanitizeDisplayOutput } from '../../utils/output-sanitizer'
import type { TaskDiagnosticSummary } from './task-panel-diagnostics'

export type TaskDetailTab = 'thinking' | 'run' | 'diagnostic'

export interface RunLogEntryLike {
  timestamp?: string | Date
  level?: string
  message?: string
  data?: Record<string, unknown>
}

export interface TaskDetailState {
  task: Task
  thinkingLogs: WorkLogEntry[]
  runLogs: RunLogEntryLike[]
  loading: boolean
  error?: string
  diagnostic?: TaskDiagnosticSummary
}

export const TASK_DIAGNOSTIC_SOURCE_LABELS: Record<TaskDiagnosticSummary['source'], string> = {
  'recovery-terminal': '恢复终端诊断',
  'recovery-history': '恢复历史记录',
  'run-log': 'Run 日志',
  'task-output': '任务输出'
}

export function formatTaskPanelDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export function extractTaskThinkingLogs(
  task: Task,
  logsByAgent: Record<string, WorkLogEntry[]>
): WorkLogEntry[] {
  const allLogs = Object.values(logsByAgent).flat()
  return allLogs
    .filter(log => {
      const taskId = typeof log.metadata?.taskId === 'string' ? String(log.metadata.taskId) : undefined
      const workflowTaskId =
        typeof log.metadata?.workflowTaskId === 'string' ? String(log.metadata.workflowTaskId) : undefined
      const persistedTaskId =
        typeof log.metadata?.persistedTaskId === 'string' ? String(log.metadata.persistedTaskId) : undefined
      return taskId === task.id || workflowTaskId === task.id || persistedTaskId === task.id
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function clipText(value: string, max = 320): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

export function resolveTaskTraceId(
  task: Task,
  runLogs: RunLogEntryLike[]
): string | undefined {
  const taskTraceId = typeof (task.metadata as Record<string, unknown> | undefined)?.traceId === 'string'
    ? String((task.metadata as Record<string, unknown>).traceId)
    : undefined

  if (taskTraceId) {
    return taskTraceId
  }

  for (const log of runLogs) {
    const traceId = typeof log.data?.traceId === 'string' ? String(log.data.traceId) : undefined
    if (traceId) {
      return traceId
    }
  }

  return undefined
}

export function buildDiagnosticPackageText(
  task: Task,
  diagnostic: TaskDiagnosticSummary,
  runLogs: RunLogEntryLike[]
): string {
  const levelCounts = runLogs.reduce<Record<string, number>>((acc, log) => {
    const level = String(log.level || 'info').toLowerCase()
    acc[level] = (acc[level] || 0) + 1
    return acc
  }, {})
  const levelSummary = Object.entries(levelCounts)
    .map(([level, count]) => `${level}:${count}`)
    .join(', ')

  const summarizedRunLogs = runLogs
    .filter(log => Boolean(log.message) || Boolean(log.data))
    .slice(-8)
    .map(log => {
      const timestamp = formatTaskPanelDateTime(log.timestamp)
      const level = String(log.level || 'info').toUpperCase()
      const message = clipText(String(log.message || '无消息'))
      const dataText = log.data ? clipText(safeStringify(log.data), 220) : ''
      return dataText
        ? `- [${timestamp}] [${level}] ${message} | data: ${dataText}`
        : `- [${timestamp}] [${level}] ${message}`
    })

  const evidenceText =
    diagnostic.evidence.length > 0
      ? diagnostic.evidence.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '无'

  const taskOutput = task.output ? clipText(sanitizeDisplayOutput(task.output), 1200) : '—'
  const traceId = resolveTaskTraceId(task, runLogs)

  return [
    '# Task 诊断包',
    '',
    '## 任务',
    `- ID: ${task.id}`,
    `- 状态: ${task.status}`,
    `- 类型: ${task.type}`,
    `- Agent: ${task.assignedAgent || '—'}`,
    `- Model: ${task.assignedModel || '—'}`,
    `- Trace ID: ${traceId || '—'}`,
    `- 开始时间: ${formatTaskPanelDateTime(task.startedAt)}`,
    `- 完成时间: ${formatTaskPanelDateTime(task.completedAt)}`,
    '',
    '## 输入',
    task.input || '—',
    '',
    '## 任务输出',
    taskOutput,
    '',
    '## 诊断',
    `- 类别: ${diagnostic.label} (${diagnostic.category})`,
    `- 来源: ${TASK_DIAGNOSTIC_SOURCE_LABELS[diagnostic.source]}`,
    `- 置信分: ${diagnostic.score}`,
    `- 更新时间: ${diagnostic.updatedAt ? formatTaskPanelDateTime(diagnostic.updatedAt) : '—'}`,
    '',
    '### 失败原因',
    diagnostic.reason || '—',
    '',
    '### 诊断证据',
    evidenceText,
    '',
    '## Run 日志摘要',
    `- 条目数: ${runLogs.length}`,
    `- 分布: ${levelSummary || '—'}`,
    ...(summarizedRunLogs.length > 0 ? ['- 最近关键信号:', ...summarizedRunLogs] : ['- 最近关键信号: 无'])
  ].join('\n')
}

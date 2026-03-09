import type { Task } from '@renderer/types/domain'
import type {
  ModelSelectionAttemptSummary,
  ModelSelectionSnapshot,
  ModelSelectionSource
} from '@shared/model-selection-contract'
import type {
  SessionDiagnosticSummary,
  WorkflowObservabilityForDiagnostics
} from './task-panel-diagnostics'

export interface BackgroundTaskInfo {
  id: string
  pid: number | null
  command: string
  input?: string
  description?: string
  cwd: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
  exitCode: number | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  metadata: Record<string, unknown> | null
}

export interface BackgroundOutputChunk {
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: string
}

export interface BackgroundTaskOutputMeta {
  total: number
  stdout: number
  stderr: number
  truncated: boolean
}

export interface BackgroundTaskOutputState {
  chunks: BackgroundOutputChunk[]
  nextIndex: number
  outputMeta: BackgroundTaskOutputMeta | null
}

export interface BackgroundTaskStats {
  total: number
  running: number
  completed: number
  error: number
  cancelled: number
}

export type TabType = 'tasks' | 'background' | 'artifacts'
export type TaskFilterStatus =
  | 'all'
  | 'running'
  | 'pending'
  | 'pending_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type TaskSortMode = 'newest' | 'oldest'

export interface TaskBindingSnapshot {
  modelSource?: ModelSelectionSource
  modelSelectionSource?: ModelSelectionSource
  modelSelectionReason?: ModelSelectionSnapshot['modelSelectionReason']
  modelSelectionSummary?: string
  fallbackReason?: ModelSelectionSnapshot['fallbackReason']
  fallbackAttemptSummary?: ModelSelectionAttemptSummary[]
  fallbackTrail?: string[]
  concurrencyKey?: string
  workflowId?: string
}

export interface WorkflowObservabilityTaskPanelSnapshot extends WorkflowObservabilityForDiagnostics {
  assignments?: Array<{
    taskId?: string
    persistedTaskId?: string
    workflowPhase?: string
    modelSource?: ModelSelectionSource
    modelSelectionReason?: ModelSelectionSnapshot['modelSelectionReason']
    modelSelectionSummary?: string
    fallbackReason?: ModelSelectionSnapshot['fallbackReason']
    fallbackAttemptSummary?: ModelSelectionAttemptSummary[]
    fallbackTrail?: string[]
    concurrencyKey?: string
    workflowId?: string
  }>
}

export const DEFAULT_SESSION_DIAGNOSTIC_SUMMARY: SessionDiagnosticSummary = {
  total: 0,
  config: 0,
  permission: 0,
  tool: 0,
  model: 0
}

export const diagnosticBadgeConfig = {
  config: 'ui-warning-surface ui-warning-text',
  permission: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  tool: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  model: 'border-rose-500/30 bg-rose-500/10 text-rose-300'
} as const

export const diagnosticCategories = ['config', 'permission', 'tool', 'model'] as const

function isModelSelectionSource(value: unknown): value is ModelSelectionSource {
  return ['override', 'agent-binding', 'category-binding', 'system-default'].includes(
    String(value || '')
  )
}

function coerceFallbackAttemptSummary(value: unknown): ModelSelectionAttemptSummary[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (item): item is ModelSelectionAttemptSummary =>
      Boolean(item) && typeof item === 'object' && 'summary' in item
  )
}

function coerceModelSelectionSnapshot(value: unknown): ModelSelectionSnapshot | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const snapshot = value as Record<string, unknown>
  const source = isModelSelectionSource(snapshot.modelSelectionSource)
    ? snapshot.modelSelectionSource
    : undefined
  if (!source) {
    return undefined
  }

  return {
    modelId: typeof snapshot.modelId === 'string' ? snapshot.modelId : undefined,
    provider: typeof snapshot.provider === 'string' ? snapshot.provider : undefined,
    model: typeof snapshot.model === 'string' ? snapshot.model : undefined,
    modelSelectionSource: source,
    modelSelectionReason:
      typeof snapshot.modelSelectionReason === 'string'
        ? (snapshot.modelSelectionReason as ModelSelectionSnapshot['modelSelectionReason'])
        : 'system-default-hit',
    modelSelectionSummary:
      typeof snapshot.modelSelectionSummary === 'string' ? snapshot.modelSelectionSummary : '',
    fallbackReason:
      typeof snapshot.fallbackReason === 'string'
        ? (snapshot.fallbackReason as ModelSelectionSnapshot['fallbackReason'])
        : undefined,
    fallbackAttemptSummary: coerceFallbackAttemptSummary(snapshot.fallbackAttemptSummary)
  }
}

export function safeStringify(value: unknown): string {
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

export function buildFallbackAttemptText(
  items: ModelSelectionAttemptSummary[] | undefined
): string | null {
  if (!items || items.length === 0) {
    return null
  }

  return clipText(items.map(item => item.summary).join(' → '), 220)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function resolveTaskBindingSnapshot(
  task: Task,
  incoming?: TaskBindingSnapshot
): TaskBindingSnapshot {
  const runtimeBindingSnapshot =
    task.metadata?.runtimeBindingSnapshot &&
    typeof task.metadata.runtimeBindingSnapshot === 'object'
      ? (task.metadata.runtimeBindingSnapshot as Record<string, unknown>)
      : undefined

  const modelSelection = incoming?.modelSelectionSource
    ? {
        modelSelectionSource: incoming.modelSelectionSource,
        modelSelectionReason: incoming.modelSelectionReason || 'system-default-hit',
        modelSelectionSummary: incoming.modelSelectionSummary || '',
        fallbackReason: incoming.fallbackReason,
        fallbackAttemptSummary: incoming.fallbackAttemptSummary || []
      }
    : coerceModelSelectionSnapshot(runtimeBindingSnapshot?.modelSelection) ||
      coerceModelSelectionSnapshot(task.metadata?.modelSelection)

  const modelSource =
    incoming?.modelSource ||
    modelSelection?.modelSelectionSource ||
    (isModelSelectionSource(runtimeBindingSnapshot?.modelSource)
      ? runtimeBindingSnapshot.modelSource
      : undefined) ||
    (isModelSelectionSource(task.metadata?.modelSource) ? task.metadata.modelSource : undefined)

  return {
    modelSource,
    modelSelectionSource: modelSelection?.modelSelectionSource || modelSource,
    modelSelectionReason: incoming?.modelSelectionReason || modelSelection?.modelSelectionReason,
    modelSelectionSummary: incoming?.modelSelectionSummary || modelSelection?.modelSelectionSummary,
    fallbackReason: incoming?.fallbackReason || modelSelection?.fallbackReason,
    fallbackAttemptSummary:
      incoming?.fallbackAttemptSummary || modelSelection?.fallbackAttemptSummary,
    fallbackTrail:
      incoming?.fallbackTrail ||
      (Array.isArray(runtimeBindingSnapshot?.fallbackTrail)
        ? (runtimeBindingSnapshot.fallbackTrail as string[])
        : undefined),
    concurrencyKey:
      incoming?.concurrencyKey ||
      (typeof runtimeBindingSnapshot?.concurrencyKey === 'string'
        ? runtimeBindingSnapshot.concurrencyKey
        : undefined),
    workflowId:
      incoming?.workflowId ||
      (typeof runtimeBindingSnapshot?.workflowId === 'string'
        ? runtimeBindingSnapshot.workflowId
        : undefined)
  }
}

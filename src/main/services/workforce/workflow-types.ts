import type { ModelSource } from '../llm/model-selection.service'
import type {
  FallbackReason,
  ModelSelectionAttemptSummary,
  ModelSelectionReason
} from '@/shared/model-selection-contract'
import type { RecoveryTrackingMetadata } from '@/shared/recovery-contract'
import type { TraceContext } from '@/shared/trace-contract'
import type { StructuredTaskBrief } from '@/shared/task-brief-contract'
import type { RetryConfig, RetryState } from './retry'
import type { RecoveryConfig, WorkflowRecoveryState } from './recovery-types'
import type { WorkflowIntegratorResult } from './workflow-integration-service'
import type { WorkflowGraphNode } from './workflow-graph-builder'

// ---------------------------------------------------------------------------
// Execution stages & state machine
// ---------------------------------------------------------------------------

/**
 * Workflow execution phases represent the high-level stages a workflow
 * transitions through. The valid transitions form a strict DAG:
 *
 *   discovery → plan-review → deep-review → execution
 *
 * - discovery:    Specialist agents (qianliyan, diting) scan the codebase
 *                 and collect external references.
 * - plan-review:  chongming reviews the decomposition for gaps/ambiguity.
 * - deep-review:  leigong performs quality-gate review on the plan.
 * - execution:    Worker categories (dayu, zhinv, etc.) execute concrete tasks.
 *
 * Tasks within the same phase may run in parallel. Cross-phase dependencies
 * are enforced by the DAG built from task dependencies.
 */
export type WorkflowPhase = 'discovery' | 'plan-review' | 'deep-review' | 'execution'

/**
 * Lifecycle stages track the workflow engine's own progression (orthogonal
 * to task-level phases). The engine always progresses in this order:
 *
 *   plan → dispatch → checkpoint → integration → finalize
 */
export type WorkflowLifecycleStage = 'plan' | 'dispatch' | 'checkpoint' | 'integration' | 'finalize'

/**
 * Task intent classifies whether a task produces analysis artifacts
 * or concrete implementation changes.
 */
export type TaskIntent = 'analysis' | 'implementation'

/**
 * Orchestrator checkpoint phases control when the orchestrator agent
 * evaluates ongoing work quality.
 */
export type OrchestratorCheckpointPhase = 'pre-dispatch' | 'between-waves' | 'final'

/**
 * Valid phase transitions. Used for runtime assertions and documentation.
 * A task in phase X may only depend on tasks in the same phase or earlier phases.
 */
export const PHASE_ORDER: readonly WorkflowPhase[] = [
  'discovery',
  'plan-review',
  'deep-review',
  'execution'
] as const

export function isValidPhaseDependency(
  dependentPhase: WorkflowPhase,
  dependencyPhase: WorkflowPhase
): boolean {
  return PHASE_ORDER.indexOf(dependencyPhase) <= PHASE_ORDER.indexOf(dependentPhase)
}

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export interface SubTask {
  id: string
  description: string
  dependencies: string[]
  assignedAgent?: string
  assignedCategory?: string
  source?: 'decomposed' | 'plan'
  workflowPhase?: WorkflowPhase
}

export interface WorkflowTaskExecution {
  logicalTaskId: string
  persistedTaskId: string
  runId?: string
  assignedAgent?: string
  assignedCategory?: string
  model?: string
  modelSource?: ModelSource
  modelSelectionReason?: ModelSelectionReason
  modelSelectionSummary?: string
  fallbackReason?: FallbackReason
  fallbackAttemptSummary?: ModelSelectionAttemptSummary[]
  concurrencyKey?: string
  fallbackTrail?: string[]
  evidenceSummary?: {
    missingFields: string[]
    isComplete: boolean
  }
}

export interface SharedContextEntry {
  id: string
  workflowId: string
  taskId: string
  phase: WorkflowPhase | 'integration'
  category: 'facts' | 'decisions' | 'constraints' | 'artifacts' | 'dependencies'
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface SharedContextStore {
  workflowId: string
  entries: SharedContextEntry[]
  archivedEntries: SharedContextEntry[]
  retentionLimit: number
}

export interface SharedContextQuery {
  workflowId?: string
  taskId?: string
  category?: SharedContextEntry['category']
  includeArchived?: boolean
}

export interface WorkflowResult {
  workflowId: string
  tasks: SubTask[]
  results: Map<string, string>
  executions: Map<string, WorkflowTaskExecution>
  success: boolean
  sharedContextStore: SharedContextStore
  retryStates?: Map<string, RetryState>
  continuationSnapshot?: WorkflowObservabilitySnapshot['continuationSnapshot']
  orchestratorCheckpoints?: OrchestratorCheckpointRecord[]
  orchestratorParticipation?: boolean
}

export interface WorkflowOptions {
  category?: string
  agentCode?: string
  retryConfig?: Partial<RetryConfig>
  enableRetry?: boolean
  recoveryConfig?: Partial<RecoveryConfig>
  planPath?: string
  abortSignal?: AbortSignal
  availableTools?: string[]
  overrideModelSpec?: string
  skillRuntime?: {
    id: string
    command: string
    allowedTools: string[] | null
    model: string | null
  }
  resumeContext?: RecoveryTrackingMetadata
  routingContext?: {
    strategy?: string
    complexityScore?: number
    semanticScores?: {
      complexityScore?: number
      riskScore?: number
      infoSufficiencyScore?: number
      approvalScore?: number
      workforceFitScore?: number
    }
    rationale?: string[]
    taskBriefGenerated?: boolean
  }
  taskBrief?: StructuredTaskBrief | null
  traceContext?: TraceContext
}

export interface WorkflowTaskResolution {
  subtasks: SubTask[]
  source: 'decomposed' | 'plan'
  planPath?: string
  planName?: string
  referencedMarkdownFiles?: string[]
}

export interface TaskPromptContract {
  intent: TaskIntent
  workflowPhase: WorkflowPhase
  readOnly: boolean
}

export interface OrchestratorCheckpointRecord {
  timestamp: string
  phase: OrchestratorCheckpointPhase
  status: 'continue' | 'halt' | 'fallback'
  reportedTaskIds: string[]
  readyTaskIds: string[]
  approvedTaskIds: string[]
  reason?: string
  persistedTaskId?: string
}

export interface WorkflowObservabilitySnapshot {
  workflowId: string
  graph: {
    workflowId: string
    nodeOrder: string[]
    nodes: WorkflowGraphNode[]
  }
  correlation: {
    workflowId: string
    sessionId?: string
    traceId?: string
  }
  timeline: {
    workflow: Array<Record<string, unknown>>
    task: Array<Record<string, unknown>>
    run: Array<Record<string, unknown>>
  }
  integration: WorkflowIntegratorResult
  lifecycleStages: WorkflowLifecycleStage[]
  assignments: Array<{
    taskId: string
    persistedTaskId?: string
    runId?: string
    assignedAgent?: string
    assignedCategory?: string
    workflowPhase?: WorkflowPhase
    assignedModel?: string
    modelSource?: ModelSource
    modelSelectionReason?: ModelSelectionReason
    modelSelectionSummary?: string
    fallbackReason?: FallbackReason
    fallbackAttemptSummary?: ModelSelectionAttemptSummary[]
    concurrencyKey?: string
    fallbackTrail?: string[]
  }>
  retryState: {
    tasks: Record<
      string,
      {
        attemptNumber: number
        status: string
        maxAttempts: number
        errors: Array<{ errorType: string; error: string; timestamp: string }>
      }
    >
    totalRetried: number
  }
  recoveryState: WorkflowRecoveryState
  continuationSnapshot: {
    workflowId: string
    sessionId?: string
    status: 'completed' | 'failed' | 'cancelled' | 'running'
    resumable: boolean
    failedTasks: string[]
    retryableTasks: string[]
    updatedAt: string
  }
  sharedContext: {
    workflowId: string
    totalEntries: number
    activeEntries: number
    archivedEntries: number
    entries: SharedContextEntry[]
    archived: SharedContextEntry[]
  }
}

// ---------------------------------------------------------------------------
// Agent / Category registries (shared by decomposer and engine)
// ---------------------------------------------------------------------------

export const KNOWN_SUBAGENT_CODES = new Set([
  'fuxi',
  'haotian',
  'kuafu',
  'luban',
  'baize',
  'chongming',
  'leigong',
  'diting',
  'qianliyan',
  'multimodal-looker'
])

export const KNOWN_CATEGORY_CODES = new Set([
  'zhinv',
  'cangjie',
  'tianbing',
  'guigu',
  'maliang',
  'guixu',
  'tudi',
  'dayu'
])

export const PRIMARY_ORCHESTRATORS = new Set(['fuxi', 'haotian', 'kuafu'])
export const SPECIALIST_WORKERS = new Set(['qianliyan', 'diting', 'baize', 'chongming', 'leigong'])

export function resolveCanonicalSubagent(raw?: string): string | undefined {
  if (!raw) return undefined
  const normalized = raw.trim().toLowerCase()
  if (KNOWN_SUBAGENT_CODES.has(normalized)) return normalized
  return undefined
}

export function resolveCanonicalCategory(raw?: string): string | undefined {
  if (!raw) return undefined
  const normalized = raw.trim().toLowerCase()
  if (KNOWN_CATEGORY_CODES.has(normalized)) return normalized
  return undefined
}

export function isPrimaryOrchestrator(agentCode?: string): boolean {
  if (!agentCode) return false
  const canonical = resolveCanonicalSubagent(agentCode) || agentCode.trim().toLowerCase()
  return PRIMARY_ORCHESTRATORS.has(canonical)
}

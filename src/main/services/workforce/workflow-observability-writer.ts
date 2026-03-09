import type { ModelSource } from '../llm/model-selection.service'
import type {
  FallbackReason,
  ModelSelectionAttemptSummary,
  ModelSelectionReason
} from '@/shared/model-selection-contract'
import type { WorkflowIntegratorResult } from './workflow-integration-service'
import type { WorkflowGraph, WorkflowGraphNode } from './workflow-graph-builder'
import type { WorkflowRecoveryState } from './recovery-types'

interface WorkflowObservabilityTaskInput {
  id: string
  assignedAgent?: string
  assignedCategory?: string
  workflowPhase?: string
}

interface WorkflowTaskExecutionInput {
  persistedTaskId: string
  runId?: string
  model?: string
  modelSource?: ModelSource
  modelSelectionReason?: ModelSelectionReason
  modelSelectionSummary?: string
  fallbackReason?: FallbackReason
  fallbackAttemptSummary?: ModelSelectionAttemptSummary[]
  concurrencyKey?: string
  fallbackTrail?: string[]
}

interface RetryStateInput {
  attemptNumber: number
  status: string
  maxAttempts: number
  errors: Array<{ errorType: unknown; error: string; timestamp: Date }>
}

export function buildWorkflowObservabilitySnapshot(input: {
  workflowId: string
  sessionId?: string
  traceId?: string
  graph: WorkflowGraph
  integrated: WorkflowIntegratorResult
  sharedContext: {
    workflowId: string
    entries: unknown[]
    archivedEntries: unknown[]
  }
  activeEntries: unknown[]
  archivedEntries: unknown[]
  executions: Map<string, WorkflowTaskExecutionInput>
  tasks: WorkflowObservabilityTaskInput[]
  lifecycleEvents: Array<{ stage: string; timestamp: string; details?: Record<string, unknown> }>
  taskTimeline: Array<Record<string, unknown>>
  runTimeline: Array<Record<string, unknown>>
  retryStates: Map<string, RetryStateInput>
  recoveryState: WorkflowRecoveryState
  status: 'completed' | 'failed' | 'cancelled' | 'running'
}) {
  const assignments = input.tasks.map(task => ({
    taskId: task.id,
    persistedTaskId: input.executions.get(task.id)?.persistedTaskId,
    runId: input.executions.get(task.id)?.runId,
    assignedAgent: task.assignedAgent,
    assignedCategory: task.assignedCategory,
    workflowPhase: task.workflowPhase,
    assignedModel: input.executions.get(task.id)?.model,
    modelSource: input.executions.get(task.id)?.modelSource,
    modelSelectionReason: input.executions.get(task.id)?.modelSelectionReason,
    modelSelectionSummary: input.executions.get(task.id)?.modelSelectionSummary,
    fallbackReason: input.executions.get(task.id)?.fallbackReason,
    fallbackAttemptSummary: input.executions.get(task.id)?.fallbackAttemptSummary || [],
    concurrencyKey: input.executions.get(task.id)?.concurrencyKey,
    fallbackTrail: input.executions.get(task.id)?.fallbackTrail || []
  }))

  const retryTasks = Array.from(input.retryStates.entries()).reduce<
    Record<
      string,
      {
        attemptNumber: number
        status: string
        maxAttempts: number
        errors: Array<{ errorType: string; error: string; timestamp: string }>
      }
    >
  >((acc, [taskId, state]) => {
    acc[taskId] = {
      attemptNumber: state.attemptNumber,
      status: state.status,
      maxAttempts: state.maxAttempts,
      errors: state.errors.map(errorItem => ({
        errorType: String(errorItem.errorType),
        error: errorItem.error,
        timestamp: errorItem.timestamp.toISOString()
      }))
    }
    return acc
  }, {})

  const retryableTasks = Object.entries(retryTasks)
    .filter(([, item]) => item.status === 'retrying' || item.status === 'pending')
    .map(([taskId]) => taskId)

  const failedTasks = Object.entries(retryTasks)
    .filter(([, item]) => item.status === 'exhausted')
    .map(([taskId]) => taskId)

  return {
    workflowId: input.workflowId,
    graph: {
      workflowId: input.graph.workflowId,
      nodeOrder: input.graph.nodeOrder,
      nodes: Array.from(input.graph.nodes.values()) as WorkflowGraphNode[]
    },
    correlation: {
      workflowId: input.workflowId,
      sessionId: input.sessionId,
      traceId: input.traceId
    },
    timeline: {
      workflow: input.lifecycleEvents.map(event => ({
        workflowId: input.workflowId,
        sessionId: input.sessionId,
        traceId: input.traceId,
        eventType: 'workflow:stage',
        stage: event.stage,
        timestamp: event.timestamp,
        details: event.details || {}
      })),
      task: input.taskTimeline,
      run: input.runTimeline
    },
    integration: input.integrated,
    lifecycleStages: ['plan', 'dispatch', 'checkpoint', 'integration', 'finalize'],
    assignments,
    retryState: {
      tasks: retryTasks,
      totalRetried: Object.values(retryTasks).filter(item => item.attemptNumber > 1).length
    },
    recoveryState: input.recoveryState,
    continuationSnapshot: {
      workflowId: input.workflowId,
      sessionId: input.sessionId,
      status: input.status,
      resumable: input.status === 'failed' && retryableTasks.length > 0,
      failedTasks,
      retryableTasks,
      updatedAt: new Date().toISOString()
    },
    sharedContext: {
      workflowId: input.sharedContext.workflowId,
      totalEntries: input.sharedContext.entries.length + input.sharedContext.archivedEntries.length,
      activeEntries: input.sharedContext.entries.length,
      archivedEntries: input.sharedContext.archivedEntries.length,
      entries: input.activeEntries,
      archived: input.archivedEntries
    }
  }
}

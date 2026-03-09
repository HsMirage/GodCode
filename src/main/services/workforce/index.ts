/**
 * @license
 * Copyright (c) 2024-2026 stackframe-projects
 *
 * This file is adapted from eigent
 * Original source: https://github.com/stackframe-projects/eigent
 * License: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Modified by GodCode project.
 */

export { WorkforceEngine } from './workforce-engine'
export { workflowEvents, WorkflowEventEmitter } from './events'
export type {
  SubTask,
  WorkflowResult,
  WorkflowOptions,
  SharedContextEntry,
  SharedContextQuery,
  SharedContextStore,
  WorkflowObservabilitySnapshot,
  WorkflowTaskExecution,
  WorkflowPhase,
  WorkflowLifecycleStage,
  TaskIntent,
  OrchestratorCheckpointPhase,
  OrchestratorCheckpointRecord,
  TaskPromptContract,
  WorkflowTaskResolution
} from './workflow-types'
export {
  PHASE_ORDER,
  isValidPhaseDependency,
  KNOWN_SUBAGENT_CODES,
  KNOWN_CATEGORY_CODES,
  PRIMARY_ORCHESTRATORS,
  SPECIALIST_WORKERS,
  resolveCanonicalSubagent,
  resolveCanonicalCategory,
  isPrimaryOrchestrator
} from './workflow-types'
export { WorkforceWorkerDispatcher } from './worker-dispatcher'
export type { WorkerDispatchInput } from './worker-dispatcher'
export type { WorkflowEvent } from './events'

// Decomposer exports
export {
  normalizeDecomposedSubtasks,
  parsePlanSubtasks,
  parsePlanSubtasksFromContent,
  extractPlanPathFromInput,
  normalizePlanPath,
  shouldPreferPlanExecution,
  extractMarkdownPathCandidates,
  shouldRequireReferencedFiles,
  buildReferencedMarkdownDecompositionContext,
  extractDependencyIds,
  extractTaskExecutionHint
} from './workflow-decomposer'

// Retry mechanism exports
export {
  TaskRetryService,
  getTaskRetryService,
  classifyError,
  isRetryable,
  calculateBackoffDelay,
  createRetryState,
  RetryableErrorType,
  NonRetryableErrorType
} from './retry'
export type {
  RetryConfig,
  RetryState,
  RetryResult,
  ErrorClassification
} from './retry'

export type RecoveryPhase = 'classify' | 'plan' | 'fix' | 'validate' | 'escalate' | 'abort'

export type RecoveryFailureClass =
  | 'transient'
  | 'config'
  | 'dependency'
  | 'implementation'
  | 'permission'
  | 'unknown'

export type RecoveryFallbackPolicy = 'category-first' | 'subagent-first' | 'model-first'

export interface RecoveryClassBudget {
  transient: number
  config: number
  dependency: number
  implementation: number
  permission: number
  unknown: number
}

export interface RecoveryConfig {
  enabled: boolean
  maxAttempts: number
  classBudget: RecoveryClassBudget
  fallbackPolicy: RecoveryFallbackPolicy
}

export interface RecoveryAttemptRecord {
  attemptId: string
  taskId: string
  phase: RecoveryPhase
  failureClass: RecoveryFailureClass
  strategy: string
  sourceError: string
  repairObjective: string
  selectedCategory?: string
  selectedSubagent?: string
  selectedModel?: string
  validatorResult?: 'passed' | 'failed'
  status: 'planned' | 'running' | 'succeeded' | 'failed' | 'aborted'
  startedAt: string
  finishedAt?: string
}

export interface RecoveryTerminalDiagnostic {
  taskId: string
  failureClass: RecoveryFailureClass
  lastStrategy: string
  reason: string
  remediation: string[]
  timestamp: string
}

export interface WorkflowRecoveryState {
  phase: RecoveryPhase
  config: RecoveryConfig
  history: RecoveryAttemptRecord[]
  terminalDiagnostics: RecoveryTerminalDiagnostic[]
  recoveredTasks: string[]
  unrecoveredTasks: string[]
}

export interface RecoveryContext {
  sourceError: string
  failureClass: RecoveryFailureClass
  attemptId: string
  repairObjective: string
  orchestratorOwner: string
  selectedStrategy?: string
  selectedCategory?: string
  selectedSubagent?: string
  selectedModel?: string
}

export interface RecoveryRouteSelection {
  strategy: string
  category?: string
  subagent_type?: string
  model?: string
  diagnostics?: {
    attemptedRoutes: string[]
    blockedReasons: string[]
    alternatives: string[]
  }
}

export const DEFAULT_RECOVERY_CLASS_BUDGET: RecoveryClassBudget = {
  transient: 2,
  config: 1,
  dependency: 1,
  implementation: 1,
  permission: 1,
  unknown: 1
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  enabled: true,
  maxAttempts: 2,
  classBudget: DEFAULT_RECOVERY_CLASS_BUDGET,
  fallbackPolicy: 'category-first'
}

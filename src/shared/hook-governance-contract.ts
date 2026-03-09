export const DEFAULT_HOOK_TIMEOUT_MS = 2_000
export const DEFAULT_HOOK_FAILURE_THRESHOLD = 3
export const DEFAULT_HOOK_COOLDOWN_MS = 30_000
export const HOOK_GOVERNANCE_CONFIG_VERSION = 2

export type HookGovernanceSource = 'builtin' | 'claude-code' | 'custom'
export type HookGovernanceScope = 'global' | 'workspace' | 'session' | 'tool'
export type HookExecutionStatus = 'success' | 'error' | 'timeout' | 'circuit_open'
export type HookCircuitState = 'closed' | 'open'

export interface HookReliabilityPolicy {
  timeoutMs: number
  failureThreshold: number
  cooldownMs: number
}

export interface HookGovernanceStats {
  total: number
  enabled: number
  disabled: number
  byEvent: Record<string, number>
  totalExecutions: number
  totalErrors: number
}

export interface HookGovernanceRuntimeSnapshot {
  consecutiveFailures: number
  circuitState: HookCircuitState
  circuitOpenUntil?: Date | string
  lastStatus?: HookExecutionStatus
  lastDurationMs?: number
  lastError?: string
  lastExecutedAt?: Date | string
}

export interface HookGovernanceAuditSummary {
  executionCount: number
  errorCount: number
  lastAuditAt?: Date | string
  lastStatus?: HookExecutionStatus
}

export interface HookExecutionStrategySnapshot {
  hookId: string
  hookName: string
  event: string
  priority: number
  enabled: boolean
  source: HookGovernanceSource
  scope: HookGovernanceScope
  timeoutMs: number
  failureThreshold: number
  cooldownMs: number
}

export interface HookExecutionContextSnapshot {
  sessionId: string
  workspaceDir: string
  userId?: string
  tool?: string
  callId?: string
  messageId?: string
  messageRole?: 'user' | 'assistant' | 'system'
  currentTokens?: number
  maxTokens?: number
  usagePercentage?: number
  filePath?: string
  errorType?: 'not_found' | 'multiple_matches' | 'same_content' | 'unknown'
  workflowId?: string
  taskId?: string
  taskStatus?: string
}

export interface HookExecutionOutcome {
  success: boolean
  duration: number
  status?: HookExecutionStatus
  degraded?: boolean
  error?: string
  returnValuePreview?: string
  circuitOpenUntil?: Date | string
}

export interface HookGovernanceAuditRecord {
  id: string
  timestamp: Date | string
  strategy: HookExecutionStrategySnapshot
  execution: HookExecutionContextSnapshot
  result: HookExecutionOutcome
}

export type HookExecutionAuditRecord = HookGovernanceAuditRecord

export interface HookGovernanceItem {
  id: string
  name: string
  event: string
  description?: string
  enabled: boolean
  priority: number
  source: HookGovernanceSource
  scope: HookGovernanceScope
  strategy: HookReliabilityPolicy
  runtime: HookGovernanceRuntimeSnapshot
  audit: HookGovernanceAuditSummary
}

export interface HookGovernanceStatus {
  initialized: boolean
  stats: HookGovernanceStats
  hooks: HookGovernanceItem[]
  recentExecutions: HookGovernanceAuditRecord[]
}

export interface HookGovernanceUpdateItem {
  id: string
  enabled?: boolean
  priority?: number
  strategy?: Partial<HookReliabilityPolicy>
}

export interface HookGovernanceUpdateInput {
  hooks: HookGovernanceUpdateItem[]
}

export interface HookGovernanceUpdateResult {
  success: boolean
  updated: string[]
  skipped: Array<{ id: string; reason: string }>
  status: HookGovernanceStatus
}

export interface PersistedHookGovernanceItem {
  id: string
  enabled?: boolean
  priority?: number
  strategy?: Partial<HookReliabilityPolicy>
}

export interface PersistedHookGovernanceConfig {
  version: number
  hooks: PersistedHookGovernanceItem[]
}

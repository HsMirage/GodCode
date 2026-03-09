export type RecoverySource = 'crash-recovery' | 'manual-resume' | 'auto-resume'

export type RecoveryStage =
  | 'detected'
  | 'session-recovery'
  | 'task-resumption'
  | 'context-rebuild'
  | 'prompt-ready'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'aborted'

export type ResumeReason =
  | 'crash-detected'
  | 'interrupted-tasks'
  | 'in-progress-todo'
  | 'pending-todos'
  | 'pending-plan-tasks'
  | 'session-active'
  | 'no-pending-work'
  | 'recovery-failed'

export type ResumeAction =
  | 'show-recovery-dialog'
  | 'restore-session'
  | 'resume-tasks'
  | 'rebuild-context'
  | 'send-resume-prompt'
  | 'auto-send-resume-prompt'
  | 'none'

export interface RecoveryTrackingMetadata {
  recoverySource: RecoverySource
  recoveryStage: RecoveryStage
  resumeReason: ResumeReason
  resumeAction: ResumeAction
  recoveryUpdatedAt: string
}

export function createRecoveryTrackingMetadata(
  input: Omit<RecoveryTrackingMetadata, 'recoveryUpdatedAt'> & {
    recoveryUpdatedAt?: string
  }
): RecoveryTrackingMetadata {
  return {
    ...input,
    recoveryUpdatedAt: input.recoveryUpdatedAt || new Date().toISOString()
  }
}

export function applyRecoveryTrackingMetadata(
  metadata: Record<string, unknown> | null | undefined,
  recovery: RecoveryTrackingMetadata
): Record<string, unknown> {
  return {
    ...(metadata || {}),
    recoverySource: recovery.recoverySource,
    recoveryStage: recovery.recoveryStage,
    resumeReason: recovery.resumeReason,
    resumeAction: recovery.resumeAction,
    recoveryUpdatedAt: recovery.recoveryUpdatedAt,
    recovery: recovery
  }
}

export function getRecoverySourceLabel(source: RecoverySource): string {
  switch (source) {
    case 'crash-recovery':
      return 'Crash recovery'
    case 'auto-resume':
      return 'Auto resume'
    case 'manual-resume':
      return 'Manual resume'
  }
}

export function getResumeReasonLabel(reason: ResumeReason): string {
  switch (reason) {
    case 'crash-detected':
      return 'Unexpected shutdown detected'
    case 'interrupted-tasks':
      return 'Interrupted work found'
    case 'in-progress-todo':
      return 'In-progress TODO found'
    case 'pending-todos':
      return 'Pending TODOs found'
    case 'pending-plan-tasks':
      return 'Pending plan tasks found'
    case 'session-active':
      return 'Session is still active'
    case 'recovery-failed':
      return 'Previous recovery failed'
    case 'no-pending-work':
      return 'No pending work detected'
  }
}

export function getResumeActionLabel(action: ResumeAction): string {
  switch (action) {
    case 'show-recovery-dialog':
      return 'Show recovery prompt'
    case 'restore-session':
      return 'Restore session state'
    case 'resume-tasks':
      return 'Resume interrupted tasks'
    case 'rebuild-context':
      return 'Rebuild session context'
    case 'send-resume-prompt':
      return 'Send resume prompt'
    case 'auto-send-resume-prompt':
      return 'Auto-send resume prompt'
    case 'none':
      return 'No action'
  }
}

export function deriveTodoResumeReason(
  todos: Array<{ status?: string }> | null | undefined
): ResumeReason {
  if (!Array.isArray(todos) || todos.length === 0) {
    return 'no-pending-work'
  }

  if (todos.some(todo => todo?.status === 'in_progress')) {
    return 'in-progress-todo'
  }

  return 'pending-todos'
}

export function derivePlanResumeReason(hasPendingPlanTasks: boolean): ResumeReason {
  return hasPendingPlanTasks ? 'pending-plan-tasks' : 'no-pending-work'
}

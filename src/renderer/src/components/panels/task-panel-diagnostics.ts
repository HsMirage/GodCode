import type { PersistedExecutionEvent } from '@shared/execution-event-contract'
import type { ToolApprovalRequest } from '@shared/tool-approval-contract'
import type { Task } from '@renderer/types/domain'

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

export interface WorkflowStuckDiagnosticSummary {
  currentStage: string
  currentStageCode?: string
  currentSubtask?: {
    taskId: string
    title: string
    status: Task['status']
    phase?: string
  }
  blockerType: string
  blockerReason: string
  recentToolCall?: {
    taskId?: string
    toolName: string
    status: string
    timestamp?: string
    error?: string
  }
  recentFailure?: TaskDiagnosticSummary & {
    taskId: string
    taskTitle: string
  }
  waitingApproval: boolean
  pendingApproval?: {
    requestId: string
    taskId?: string
    toolName: string
    riskLevel: string
    requestedAt: string
    reason: string
  }
  humanTakeoverRecommended: boolean
  humanTakeoverReason: string
  updatedAt?: string
}

interface ObservabilityAssignment {
  taskId?: string
  persistedTaskId?: string
  workflowPhase?: string
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

interface WorkflowTimelineLike {
  workflow?: Array<Record<string, unknown>>
}

interface WorkflowRetryStateLike {
  tasks?: Record<
    string,
    {
      attemptNumber?: number
      status?: string
      maxAttempts?: number
      errors?: Array<{ error?: string; timestamp?: string }>
    }
  >
  totalRetried?: number
}

interface WorkflowContinuationSnapshotLike {
  status?: 'completed' | 'failed' | 'cancelled' | 'running'
  resumable?: boolean
  failedTasks?: string[]
  retryableTasks?: string[]
  updatedAt?: string
}

export interface WorkflowObservabilityForDiagnostics {
  assignments?: ObservabilityAssignment[]
  recoveryState?: ObservabilityRecoveryStateLike
  timeline?: WorkflowTimelineLike
  retryState?: WorkflowRetryStateLike
  continuationSnapshot?: WorkflowContinuationSnapshotLike
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

const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  plan: '规划任务',
  dispatch: '任务分派',
  checkpoint: '检查点复核',
  integration: '结果汇总',
  finalize: '最终收尾'
}

const WORKFLOW_PHASE_LABELS: Record<string, string> = {
  discovery: '发现',
  'plan-review': '计划复核',
  'deep-review': '深度复核',
  execution: '执行'
}

const TOOL_EVENT_STATUS_LABELS: Record<PersistedExecutionEvent['type'], string> = {
  'message-stream-started': '流式开始',
  'tool-call-requested': '已发起',
  'tool-call-approved': '已批准',
  'tool-call-rejected': '已拒绝',
  'tool-call-completed': '已完成',
  'llm-response-chunked': '模型响应',
  'checkpoint-saved': '检查点已保存',
  'run-paused': '已暂停',
  'run-resumed': '已恢复'
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

function getTaskTimestamp(task: Task): number {
  const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : 0
  const startedAt = task.startedAt ? new Date(task.startedAt).getTime() : 0
  const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : 0
  return Math.max(completedAt, startedAt, createdAt)
}

function coerceExecutionEvents(task: Task): PersistedExecutionEvent[] {
  return Array.isArray(task.metadata?.executionEvents)
    ? (task.metadata.executionEvents as PersistedExecutionEvent[])
    : []
}

function resolveWorkflowStage(
  observability: WorkflowObservabilityForDiagnostics | null | undefined
): { code?: string; label: string; updatedAt?: string } {
  const workflowEvents = Array.isArray(observability?.timeline?.workflow)
    ? observability?.timeline?.workflow
    : []

  const latestStage = [...workflowEvents]
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && typeof item.stage === 'string'
    )
    .sort(
      (a, b) =>
        new Date(String(b.timestamp || 0)).getTime() - new Date(String(a.timestamp || 0)).getTime()
    )[0]

  if (latestStage) {
    const code = String(latestStage.stage)
    return {
      code,
      label: WORKFLOW_STAGE_LABELS[code] || code,
      updatedAt: typeof latestStage.timestamp === 'string' ? latestStage.timestamp : undefined
    }
  }

  const continuationStatus = observability?.continuationSnapshot?.status
  if (continuationStatus === 'failed') {
    return { code: 'failed', label: '执行失败', updatedAt: observability?.continuationSnapshot?.updatedAt }
  }
  if (continuationStatus === 'completed') {
    return { code: 'completed', label: '执行完成', updatedAt: observability?.continuationSnapshot?.updatedAt }
  }
  if (continuationStatus === 'cancelled') {
    return { code: 'cancelled', label: '执行取消', updatedAt: observability?.continuationSnapshot?.updatedAt }
  }

  return {
    code: 'running',
    label: '执行中',
    updatedAt: observability?.continuationSnapshot?.updatedAt
  }
}

function resolveTaskPhase(
  task: Task,
  observability: WorkflowObservabilityForDiagnostics | null | undefined
): string | undefined {
  const assignments = Array.isArray(observability?.assignments) ? observability.assignments : []
  const assignment = assignments.find(item => item.persistedTaskId === task.id || item.taskId === task.id)
  const rawPhase =
    assignment && 'workflowPhase' in assignment && typeof assignment.workflowPhase === 'string'
      ? assignment.workflowPhase
      : typeof task.metadata?.workflowPhase === 'string'
        ? String(task.metadata.workflowPhase)
        : undefined

  if (!rawPhase) {
    return undefined
  }

  return WORKFLOW_PHASE_LABELS[rawPhase] || rawPhase
}

function findLatestPendingApproval(
  approvals: ToolApprovalRequest[]
): WorkflowStuckDiagnosticSummary['pendingApproval'] | undefined {
  const latest = [...approvals]
    .filter(item => item.status === 'pending_approval')
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0]

  if (!latest) {
    return undefined
  }

  return {
    requestId: latest.id,
    taskId: latest.taskId,
    toolName: latest.toolName,
    riskLevel: latest.riskLevel,
    requestedAt: latest.requestedAt,
    reason: latest.reason
  }
}

function pickCurrentSubtask(
  tasks: Task[],
  pendingApproval: WorkflowStuckDiagnosticSummary['pendingApproval'] | undefined,
  diagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
): Task | undefined {
  if (pendingApproval?.taskId) {
    const approvalTask = tasks.find(task => task.id === pendingApproval.taskId)
    if (approvalTask) {
      return approvalTask
    }
  }

  const pendingApprovalTask = [...tasks]
    .filter(task => task.type !== 'workflow' && task.status === 'pending_approval')
    .sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a))[0]
  if (pendingApprovalTask) {
    return pendingApprovalTask
  }

  const runningTask = [...tasks]
    .filter(task => task.type !== 'workflow' && task.status === 'running')
    .sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a))[0]
  if (runningTask) {
    return runningTask
  }

  const failedTask = [...tasks]
    .filter(task => task.type !== 'workflow' && task.status === 'failed')
    .sort((a, b) => {
      const aScore = diagnosticsByTaskId[a.id]?.score || 0
      const bScore = diagnosticsByTaskId[b.id]?.score || 0
      if (aScore !== bScore) {
        return bScore - aScore
      }
      return getTaskTimestamp(b) - getTaskTimestamp(a)
    })[0]
  if (failedTask) {
    return failedTask
  }

  return [...tasks]
    .filter(task => task.type !== 'workflow' && task.status === 'pending')
    .sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a))[0]
}

function findLatestToolCall(
  tasks: Task[],
  preferredTaskId?: string
): WorkflowStuckDiagnosticSummary['recentToolCall'] | undefined {
  const preferredTasks = preferredTaskId ? tasks.filter(task => task.id === preferredTaskId) : []
  const searchTasks = preferredTasks.length > 0 ? [...preferredTasks, ...tasks.filter(task => task.id !== preferredTaskId)] : tasks

  const events = searchTasks.flatMap(task =>
    coerceExecutionEvents(task)
      .filter(event =>
        ['tool-call-requested', 'tool-call-completed', 'tool-call-approved', 'tool-call-rejected', 'run-paused'].includes(event.type)
      )
      .map(event => ({ task, event }))
  )

  const latest = events.sort(
    (a, b) => new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime()
  )[0]

  if (!latest) {
    return undefined
  }

  const payload = latest.event.payload || {}
  const toolName = typeof payload.toolName === 'string' ? payload.toolName : 'unknown'
  const completedFailure =
    latest.event.type === 'tool-call-completed' && payload.success === false
      ? normalizeText(payload.error)
      : undefined
  const rejectedReason =
    latest.event.type === 'tool-call-rejected' ? normalizeText(payload.decisionReason) : undefined
  const pausedReason = latest.event.type === 'run-paused' ? normalizeText(payload.reason) : undefined

  return {
    taskId: latest.task.id,
    toolName,
    status: TOOL_EVENT_STATUS_LABELS[latest.event.type],
    timestamp: latest.event.timestamp,
    error: completedFailure || rejectedReason || pausedReason || undefined
  }
}

function findLatestFailure(
  tasks: Task[],
  diagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
): WorkflowStuckDiagnosticSummary['recentFailure'] | undefined {
  const failedTasks = tasks
    .filter(task => task.type !== 'workflow' && task.status === 'failed' && diagnosticsByTaskId[task.id])
    .sort((a, b) => {
      const aDiagnostic = diagnosticsByTaskId[a.id]
      const bDiagnostic = diagnosticsByTaskId[b.id]
      if ((aDiagnostic?.score || 0) !== (bDiagnostic?.score || 0)) {
        return (bDiagnostic?.score || 0) - (aDiagnostic?.score || 0)
      }
      return getTaskTimestamp(b) - getTaskTimestamp(a)
    })

  const latest = failedTasks[0]
  if (!latest) {
    return undefined
  }

  return {
    ...diagnosticsByTaskId[latest.id],
    taskId: latest.id,
    taskTitle: latest.input
  }
}

function resolveRetryState(
  taskId: string | undefined,
  observability: WorkflowObservabilityForDiagnostics | null | undefined
) {
  if (!taskId) {
    return undefined
  }

  const logicalTaskId =
    Array.isArray(observability?.assignments)
      ? observability?.assignments?.find(item => item.persistedTaskId === taskId)?.taskId
      : undefined

  const taskRetryState =
    observability?.retryState?.tasks?.[taskId] ||
    (logicalTaskId ? observability?.retryState?.tasks?.[logicalTaskId] : undefined)
  return taskRetryState && typeof taskRetryState === 'object' ? taskRetryState : undefined
}

function resolveTakeoverRecommendation(input: {
  pendingApproval?: WorkflowStuckDiagnosticSummary['pendingApproval']
  currentSubtask?: Task
  currentDiagnostic?: TaskDiagnosticSummary
  latestFailure?: WorkflowStuckDiagnosticSummary['recentFailure']
  recentToolCall?: WorkflowStuckDiagnosticSummary['recentToolCall']
  retryState?: {
    attemptNumber?: number
    status?: string
    maxAttempts?: number
    errors?: Array<{ error?: string; timestamp?: string }>
  }
  observability?: WorkflowObservabilityForDiagnostics | null
}): Pick<WorkflowStuckDiagnosticSummary, 'humanTakeoverRecommended' | 'humanTakeoverReason'> {
  if (input.pendingApproval) {
    return {
      humanTakeoverRecommended: false,
      humanTakeoverReason: '等待审批结论即可继续，无需立即人工接管'
    }
  }

  if (input.recentToolCall?.status === '已拒绝') {
    return {
      humanTakeoverRecommended: true,
      humanTakeoverReason: '最近一次工具审批被拒绝，建议人工确认范围或改写方案'
    }
  }

  if (input.retryState?.status === 'exhausted') {
    const lastError = input.retryState.errors?.at(-1)?.error
    return {
      humanTakeoverRecommended: true,
      humanTakeoverReason: lastError
        ? `自动重试已耗尽：${lastError}`
        : '自动重试已耗尽，建议人工接管处理'
    }
  }

  const diagnostic = input.currentDiagnostic || input.latestFailure
  if (diagnostic?.category === 'config') {
    return {
      humanTakeoverRecommended: true,
      humanTakeoverReason: '检测到配置/密钥问题，通常需要人工修正环境或凭证'
    }
  }

  if (diagnostic?.category === 'permission') {
    return {
      humanTakeoverRecommended: true,
      humanTakeoverReason: '检测到权限阻塞，建议人工确认审批或放宽修改边界'
    }
  }

  if (diagnostic?.category === 'tool') {
    return {
      humanTakeoverRecommended: true,
      humanTakeoverReason: '检测到工具/依赖异常，建议人工修复环境后再续跑'
    }
  }

  if (
    input.currentSubtask?.status === 'failed' &&
    input.observability?.continuationSnapshot?.status === 'failed' &&
    !input.observability?.continuationSnapshot?.resumable
  ) {
    return {
      humanTakeoverRecommended: true,
      humanTakeoverReason: '工作流已失败且当前不可自动续跑，建议人工接管'
    }
  }

  return {
    humanTakeoverRecommended: false,
    humanTakeoverReason: '当前暂无必须人工接管的信号'
  }
}

export function buildWorkflowStuckDiagnosticSummary(input: {
  tasks: Task[]
  observability?: WorkflowObservabilityForDiagnostics | null
  diagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
  approvals?: ToolApprovalRequest[]
}): WorkflowStuckDiagnosticSummary | null {
  const tasks = input.tasks.filter(task => task.type !== 'workflow')
  const pendingApproval = findLatestPendingApproval(input.approvals || [])
  const currentSubtask = pickCurrentSubtask(tasks, pendingApproval, input.diagnosticsByTaskId)
  const recentFailure = findLatestFailure(tasks, input.diagnosticsByTaskId)
  const currentDiagnostic = currentSubtask ? input.diagnosticsByTaskId[currentSubtask.id] : undefined
  const recentToolCall = findLatestToolCall(tasks, currentSubtask?.id)
  const stage = resolveWorkflowStage(input.observability)
  const retryState = resolveRetryState(currentSubtask?.id, input.observability)

  if (!currentSubtask && !recentFailure && !pendingApproval && !recentToolCall) {
    return null
  }

  let blockerType = '待诊断'
  let blockerReason = '当前没有明确的卡点信号，请结合任务详情继续查看'

  if (pendingApproval) {
    blockerType = '等待审批'
    blockerReason = `${pendingApproval.toolName} 需要审批（风险：${pendingApproval.riskLevel}）`
  } else if (recentToolCall?.status === '已拒绝') {
    blockerType = '审批拒绝'
    blockerReason = recentToolCall.error || `${recentToolCall.toolName} 审批被拒绝`
  } else if (currentDiagnostic) {
    blockerType = currentDiagnostic.label
    blockerReason = currentDiagnostic.reason
  } else if (recentFailure) {
    blockerType = recentFailure.label
    blockerReason = recentFailure.reason
  } else if (retryState?.status === 'retrying' || retryState?.status === 'pending') {
    blockerType = '自动重试中'
    blockerReason =
      retryState.errors?.at(-1)?.error ||
      `已进入自动恢复，第 ${retryState.attemptNumber || 1}/${retryState.maxAttempts || 1} 次尝试`
  } else if (currentSubtask?.status === 'pending') {
    blockerType = '等待依赖'
    blockerReason = '当前子任务尚未满足执行条件，可能仍在等待上游结果'
  } else if (currentSubtask?.status === 'running') {
    blockerType = '执行中'
    blockerReason = '当前子任务仍在执行，最近工具调用见下方摘要'
  }

  const takeover = resolveTakeoverRecommendation({
    pendingApproval,
    currentSubtask,
    currentDiagnostic,
    latestFailure: recentFailure,
    recentToolCall,
    retryState,
    observability: input.observability
  })

  return {
    currentStage: stage.label,
    currentStageCode: stage.code,
    currentSubtask: currentSubtask
      ? {
          taskId: currentSubtask.id,
          title: currentSubtask.input,
          status: currentSubtask.status,
          phase: resolveTaskPhase(currentSubtask, input.observability)
        }
      : undefined,
    blockerType,
    blockerReason,
    recentToolCall,
    recentFailure,
    waitingApproval: Boolean(pendingApproval),
    pendingApproval,
    humanTakeoverRecommended: takeover.humanTakeoverRecommended,
    humanTakeoverReason: takeover.humanTakeoverReason,
    updatedAt:
      pendingApproval?.requestedAt ||
      recentToolCall?.timestamp ||
      recentFailure?.updatedAt ||
      stage.updatedAt
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

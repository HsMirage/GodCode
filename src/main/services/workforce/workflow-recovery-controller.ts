import { buildUnifiedRetryDecision, classifyRecoveryFailureFromError } from '../retry/retry-governance'
import type {
  RecoveryConfig,
  RecoveryFailureClass,
  RecoveryRouteSelection
} from './recovery-types'

export interface WorkflowRecoveryTaskInput {
  id: string
  description: string
}

export function classifyRecoveryFailure(error: unknown): RecoveryFailureClass {
  return classifyRecoveryFailureFromError(error)
}

export function isRecoveryClassRecoverable(failureClass: RecoveryFailureClass): boolean {
  return failureClass !== 'permission' && failureClass !== 'unknown'
}

export function buildRecoveryRouteSelection(input: {
  failureClass: RecoveryFailureClass
  fallbackPolicy: RecoveryConfig['fallbackPolicy']
  assignedAgent?: string
  assignedCategory?: string
  lastModel?: string
  fallbackSubagentsByCategory: Record<string, string>
}): RecoveryRouteSelection {
  const attemptedRoutes: string[] = []
  const blockedReasons: string[] = []
  const alternatives: string[] = []

  if (!isRecoveryClassRecoverable(input.failureClass)) {
    const failureDecision = buildUnifiedRetryDecision({
      scope: 'workflow-recovery',
      error: new Error(`workflow recovery blocked: ${input.failureClass}`)
    })
    blockedReasons.push(`Failure class ${input.failureClass} is non-recoverable`)
    if (input.failureClass === 'permission') {
      alternatives.push('Check credentials and workspace permissions')
    } else {
      alternatives.push('Inspect terminal diagnostics and recover manually')
    }
    return {
      strategy: failureDecision.nextAction === 'manual-takeover' ? 'fail-fast' : 'category-repair',
      diagnostics: { attemptedRoutes, blockedReasons, alternatives }
    }
  }

  let strategy = 'category-repair'
  let category: string | undefined = input.assignedCategory || 'dayu'
  let subagent: string | undefined = input.assignedAgent
  let model: string | undefined

  switch (input.failureClass) {
    case 'transient':
      strategy = 'transient-retry-via-category'
      category = input.assignedCategory || 'tianbing'
      break
    case 'config':
      strategy = 'config-repair-via-subagent'
      subagent = 'luban'
      category = undefined
      break
    case 'dependency':
      strategy = 'dependency-repair-via-category'
      category = input.assignedCategory || 'dayu'
      break
    case 'implementation':
      strategy = 'implementation-repair-via-category'
      category = input.assignedCategory || 'dayu'
      break
    default:
      break
  }

  if (input.fallbackPolicy === 'subagent-first') {
    strategy = `${strategy}:subagent-first`
    subagent =
      subagent || (category ? input.fallbackSubagentsByCategory[category] || 'luban' : 'luban')
    category = undefined
  } else if (input.fallbackPolicy === 'model-first') {
    strategy = `${strategy}:model-first`
    category = undefined
    subagent = undefined
    const normalizedModel =
      typeof input.lastModel === 'string' && input.lastModel.includes('::')
        ? input.lastModel.replace('::', '/')
        : input.lastModel
    if (normalizedModel && normalizedModel.includes('/')) {
      model = normalizedModel
    } else {
      blockedReasons.push('No compatible model token available for model-first recovery')
      alternatives.push('Switch fallback policy to category-first or subagent-first')
    }
  }

  if (!category && !subagent && !model) {
    blockedReasons.push('No route target available for recovery')
    alternatives.push('Configure category/agent bindings for recovery tasks')
    return {
      strategy,
      diagnostics: { attemptedRoutes, blockedReasons, alternatives }
    }
  }

  attemptedRoutes.push(
    [
      category ? `category:${category}` : null,
      subagent ? `subagent:${subagent}` : null,
      model ? `model:${model}` : null
    ]
      .filter(Boolean)
      .join('|')
  )

  return {
    strategy,
    category,
    subagent_type: subagent,
    model,
    diagnostics: {
      attemptedRoutes,
      blockedReasons,
      alternatives
    }
  }
}

export function buildRecoveryRepairPrompt(input: {
  task: WorkflowRecoveryTaskInput
  sourceError: string
  failureClass: RecoveryFailureClass
  attempt: number
  objective: string
}): string {
  return [
    `任务执行失败，进入自动恢复流程（第 ${input.attempt} 轮）。`,
    `失败任务: ${input.task.id} - ${input.task.description}`,
    `失败分类: ${input.failureClass}`,
    `源错误: ${input.sourceError}`,
    `修复目标: ${input.objective}`,
    '请执行最小必要修复并输出结构化证据，必须包含以下字段：',
    '- objective: ...',
    '- changes: ...',
    '- validation: ...',
    '- residual-risk: ...'
  ].join('\n')
}

export function shouldAttemptCheckpointHaltRecovery(
  reason: string | undefined,
  recoverableHaltReasonPattern: RegExp
): boolean {
  const normalizedReason = (reason || '').trim()
  if (!normalizedReason) {
    return false
  }

  if (recoverableHaltReasonPattern.test(normalizedReason)) {
    return true
  }

  const hasTaskReference = /(?:\btask\b[\s#-]*\d+|任务\s*#?\s*\d+)/i.test(normalizedReason)
  const hasEvidenceOrDependencyIssue =
    /(evidence|证据|探索|分析|analysis|intent|计划|依赖|dependency|未提供代码|code change|修复内容|不满足|未满足|verify|验证)/i.test(
      normalizedReason
    )

  return hasTaskReference && hasEvidenceOrDependencyIssue
}

export function selectCheckpointRecoveryTargets<TTask extends { id: string }>(
  reason: string | undefined,
  candidates: TTask[]
): TTask[] {
  if (!reason || candidates.length === 0) {
    return candidates
  }

  const candidateIds = new Set(candidates.map(task => task.id))
  const tokenMatches = reason.match(/[A-Za-z][A-Za-z0-9_.-]*-[A-Za-z0-9_.-]+/g) || []
  const matchedIds = Array.from(
    new Set(
      tokenMatches
        .map(token => token.replace(/[.,;:!?()[\]{}"']/g, ''))
        .filter(token => candidateIds.has(token))
    )
  )

  const taskNumberMatches = Array.from(reason.matchAll(/(?:task|任务)\s*#?\s*(\d+)/gi)).map(
    match => match[1]
  )
  for (const numberToken of taskNumberMatches) {
    const normalized = numberToken.trim()
    if (!normalized) continue
    for (const candidate of candidates) {
      const candidateId = candidate.id.toLowerCase()
      if (
        candidateId === normalized ||
        candidateId === `task-${normalized}` ||
        candidateId.endsWith(`-${normalized}`)
      ) {
        matchedIds.push(candidate.id)
      }
    }
  }

  const dedupMatchedIds = Array.from(new Set(matchedIds))
  if (dedupMatchedIds.length === 0) {
    return candidates
  }

  const matchedSet = new Set(dedupMatchedIds)
  return candidates.filter(task => matchedSet.has(task.id))
}

export function buildCheckpointHaltRecoveryPrompt(input: {
  basePrompt: string
  reason: string
  attempt: number
  phase: 'pre-dispatch' | 'between-waves' | 'final'
  maxAttempts: number
}): string {
  return [
    input.basePrompt,
    '',
    'CHECKPOINT HALT RECOVERY (MANDATORY):',
    `- 本任务在 orchestrator checkpoint (${input.phase}) 被拦截，恢复尝试次数: ${input.attempt}/${input.maxAttempts}。`,
    `- 拦截原因: ${input.reason}`,
    '- 必须输出可验证的执行证据，不得只给计划/意图/待办。',
    '- 证据至少包含：',
    '  1) Changed files（真实文件路径）',
    '  2) Verification command（至少一条命令 + 关键输出）',
    '  3) 若涉及数据库，明确 schema/migration 校验结果。'
  ].join('\n')
}

const DEFAULT_MAX_CONCURRENT = 3

export interface WorkflowSchedulerTask {
  id: string
}

export interface WorkflowDispatchBatchItem<TTask extends WorkflowSchedulerTask> {
  task: TTask
  key: string
}

export interface WorkflowDispatchBatchResult<TTask extends WorkflowSchedulerTask> {
  batch: Array<WorkflowDispatchBatchItem<TTask>>
  nextInProgressByKey: Map<string, number>
}

function parseModelProviderAndName(spec?: string): { provider?: string; model?: string } {
  const normalized = spec?.trim()
  if (!normalized) {
    return {}
  }

  const slashIndex = normalized.indexOf('/')
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    return { model: normalized }
  }

  return {
    provider: normalized.slice(0, slashIndex),
    model: normalized.slice(slashIndex + 1)
  }
}

export function buildWorkflowConcurrencyKey(input: {
  category?: string
  modelSpec?: string
  provider?: string
}): string {
  const parsed = parseModelProviderAndName(input.modelSpec)
  const provider = (input.provider || parsed.provider || '').trim()
  const model = (parsed.model || '').trim()
  const category = (input.category || '').trim()

  if (provider && model) {
    return `${provider}::${model}`
  }
  if (provider) {
    return provider
  }
  if (category) {
    return category
  }

  return 'default'
}

export function getConcurrencyLimitForKey(
  key: string,
  limits: Record<string, number>,
  defaultLimit = DEFAULT_MAX_CONCURRENT
): number {
  const trimmed = key.trim()
  const resolvedDefaultLimit = typeof limits.default === 'number' ? limits.default : defaultLimit
  if (!trimmed) {
    return resolvedDefaultLimit
  }

  return limits[trimmed] ?? resolvedDefaultLimit
}

export function findNextFairTask<TTask extends WorkflowSchedulerTask>(
  candidates: TTask[],
  lastServedIndexByKey: Map<string, number>,
  keyResolver: (task: TTask) => string
): TTask | undefined {
  if (candidates.length === 0) {
    return undefined
  }

  const grouped = new Map<string, Array<{ task: TTask; index: number }>>()
  candidates.forEach((task, index) => {
    const key = keyResolver(task)
    const bucket = grouped.get(key) || []
    bucket.push({ task, index })
    grouped.set(key, bucket)
  })

  let selected: { task: TTask; index: number } | undefined
  for (const [key, bucket] of grouped.entries()) {
    const last = lastServedIndexByKey.get(key) ?? -1
    const preferred = bucket.find(item => item.index > last) || bucket[0]
    if (!selected || preferred.index < selected.index) {
      selected = preferred
    }
  }

  if (!selected) {
    return candidates[0]
  }

  const selectedKey = keyResolver(selected.task)
  lastServedIndexByKey.set(selectedKey, selected.index)
  return selected.task
}

export function getReadyWorkflowTasks<TTask extends WorkflowSchedulerTask>(input: {
  tasks: TTask[]
  completed: Set<string>
  inProgress: Set<string>
  failed: Set<string>
  canExecute: (task: TTask) => boolean
}): TTask[] {
  return input.tasks.filter(
    task =>
      !input.completed.has(task.id) &&
      !input.inProgress.has(task.id) &&
      !input.failed.has(task.id) &&
      input.canExecute(task)
  )
}

export function buildDispatchBatch<TTask extends WorkflowSchedulerTask>(input: {
  candidates: TTask[]
  availableSlots: number
  inProgressByKey: Map<string, number>
  lastServedIndexByKey: Map<string, number>
  concurrencyLimits: Record<string, number>
  keyResolver: (task: TTask) => string
  defaultLimit?: number
}): WorkflowDispatchBatchResult<TTask> {
  const batch: Array<WorkflowDispatchBatchItem<TTask>> = []
  const remaining = [...input.candidates]
  const nextInProgressByKey = new Map(input.inProgressByKey)

  while (batch.length < input.availableSlots && remaining.length > 0) {
    const nextTask = findNextFairTask(remaining, input.lastServedIndexByKey, input.keyResolver)
    if (!nextTask) {
      break
    }

    const key = input.keyResolver(nextTask)
    const inUse = nextInProgressByKey.get(key) || 0
    const limit = getConcurrencyLimitForKey(key, input.concurrencyLimits, input.defaultLimit)
    if (inUse < limit) {
      batch.push({ task: nextTask, key })
      nextInProgressByKey.set(key, inUse + 1)
    }

    const nextIndex = remaining.findIndex(task => task.id === nextTask.id)
    if (nextIndex >= 0) {
      remaining.splice(nextIndex, 1)
    }
  }

  return {
    batch,
    nextInProgressByKey
  }
}

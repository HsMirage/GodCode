import { DelegateEngine, type DelegateTaskInput, type DelegateTaskResult } from '@/main/services/delegate'

export type WorkerDispatchInput = Omit<
  DelegateTaskInput,
  'sessionId' | 'description' | 'prompt'
> & {
  sessionId: string
  description: string
  prompt: string
}

const DEFAULT_CONCURRENCY_LIMIT = 3

export class WorkforceWorkerDispatcher {
  private delegateEngine = new DelegateEngine()
  private static inFlightByConcurrencyKey = new Map<string, number>()
  private static waitersByConcurrencyKey = new Map<string, Array<() => void>>()
  private static activeReleaseLeaseIds = new Set<string>()
  private static releaseLeaseSequence = 0
  private static inFlightTransitionsForTests: Array<{ key: string; inFlight: number }> = []

  private normalizeConcurrencyKey(concurrencyKey: string): string {
    return concurrencyKey.trim() || 'default'
  }

  private parseMetadataConcurrencyLimit(metadata: Record<string, unknown> | undefined): number | null {
    const rawValue = metadata?.concurrencyLimit
    const parsed = Number.parseInt(String(rawValue ?? ''), 10)
    if (!Number.isFinite(parsed)) return null
    const normalized = Math.trunc(parsed)
    if (normalized <= 0) return null
    return normalized
  }

  private getConcurrencyLimit(
    _key: string,
    metadata: Record<string, unknown> | undefined
  ): number {
    const metadataLimit = this.parseMetadataConcurrencyLimit(metadata)
    if (metadataLimit !== null) {
      return metadataLimit
    }

    return DEFAULT_CONCURRENCY_LIMIT
  }

  private resolveDispatchTaskKey(input: WorkerDispatchInput): string {
    const metadata = input.metadata as Record<string, unknown> | undefined
    const metadataTaskKeyCandidates = [
      metadata?.logicalTaskId,
      metadata?.taskId,
      metadata?.workflowTaskId
    ]

    for (const candidate of metadataTaskKeyCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }

    if (input.parentTaskId?.trim()) {
      return `${input.parentTaskId.trim()}:${input.description.trim() || 'dispatch'}`
    }

    return input.description.trim() || 'dispatch'
  }

  private createReleaseLeaseId(concurrencyKey: string, input: WorkerDispatchInput): string {
    WorkforceWorkerDispatcher.releaseLeaseSequence += 1
    return `${this.normalizeConcurrencyKey(concurrencyKey)}:${this.resolveDispatchTaskKey(input)}:${WorkforceWorkerDispatcher.releaseLeaseSequence}`
  }

  private recordInFlightTransition(key: string): void {
    WorkforceWorkerDispatcher.inFlightTransitionsForTests.push({
      key,
      inFlight: WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
    })
  }

  private async waitForConcurrencySlot(
    concurrencyKey: string,
    metadata: Record<string, unknown> | undefined,
    releaseLeaseId: string
  ): Promise<void> {
    const key = this.normalizeConcurrencyKey(concurrencyKey)

    for (;;) {
      const inFlight = WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
      const limit = this.getConcurrencyLimit(key, metadata)

      if (inFlight < limit) {
        WorkforceWorkerDispatcher.inFlightByConcurrencyKey.set(key, inFlight + 1)
        WorkforceWorkerDispatcher.activeReleaseLeaseIds.add(releaseLeaseId)
        this.recordInFlightTransition(key)
        return
      }

      await new Promise<void>(resolve => {
        const queue = WorkforceWorkerDispatcher.waitersByConcurrencyKey.get(key) || []
        queue.push(resolve)
        WorkforceWorkerDispatcher.waitersByConcurrencyKey.set(key, queue)
      })
    }
  }

  private releaseConcurrencySlot(concurrencyKey: string, releaseLeaseId: string): void {
    const key = this.normalizeConcurrencyKey(concurrencyKey)

    if (!WorkforceWorkerDispatcher.activeReleaseLeaseIds.delete(releaseLeaseId)) {
      return
    }

    const queue = WorkforceWorkerDispatcher.waitersByConcurrencyKey.get(key)

    if (queue && queue.length > 0) {
      const next = queue.shift()
      if (queue.length === 0) {
        WorkforceWorkerDispatcher.waitersByConcurrencyKey.delete(key)
      }
      const currentInFlight = WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
      if (currentInFlight <= 1) {
        WorkforceWorkerDispatcher.inFlightByConcurrencyKey.delete(key)
      } else {
        WorkforceWorkerDispatcher.inFlightByConcurrencyKey.set(key, currentInFlight - 1)
      }
      this.recordInFlightTransition(key)
      next?.()
      return
    }

    const inFlight = WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
    if (inFlight <= 1) {
      WorkforceWorkerDispatcher.inFlightByConcurrencyKey.delete(key)
      this.recordInFlightTransition(key)
      return
    }

    WorkforceWorkerDispatcher.inFlightByConcurrencyKey.set(key, inFlight - 1)
    this.recordInFlightTransition(key)
  }

  static resetDispatcherStateForTests(): void {
    WorkforceWorkerDispatcher.inFlightByConcurrencyKey.clear()
    WorkforceWorkerDispatcher.waitersByConcurrencyKey.clear()
    WorkforceWorkerDispatcher.activeReleaseLeaseIds.clear()
    WorkforceWorkerDispatcher.releaseLeaseSequence = 0
    WorkforceWorkerDispatcher.inFlightTransitionsForTests = []
  }

  static getDispatcherStateForTests(): {
    inFlightByConcurrencyKey: Record<string, number>
    waitersByConcurrencyKey: Record<string, number>
    activeReleaseLeaseCount: number
    inFlightTransitions: Array<{ key: string; inFlight: number }>
  } {
    return {
      inFlightByConcurrencyKey: Object.fromEntries(WorkforceWorkerDispatcher.inFlightByConcurrencyKey),
      waitersByConcurrencyKey: Object.fromEntries(
        Array.from(WorkforceWorkerDispatcher.waitersByConcurrencyKey.entries()).map(([key, queue]) => [
          key,
          queue.length
        ])
      ),
      activeReleaseLeaseCount: WorkforceWorkerDispatcher.activeReleaseLeaseIds.size,
      inFlightTransitions: [...WorkforceWorkerDispatcher.inFlightTransitionsForTests]
    }
  }

  async dispatch(input: WorkerDispatchInput): Promise<DelegateTaskResult> {
    const metadata = input.metadata as Record<string, unknown> | undefined
    const concurrencyKey = String(metadata?.concurrencyKey || '')
    const shouldThrottle = !input.runInBackground && Boolean(concurrencyKey)
    const releaseLeaseId = shouldThrottle
      ? this.createReleaseLeaseId(concurrencyKey, input)
      : null

    if (shouldThrottle) {
      await this.waitForConcurrencySlot(concurrencyKey, metadata, releaseLeaseId!)
    }

    try {
      return await this.delegateEngine.delegateTask({
        ...input,
        runInBackground: input.runInBackground ?? false
      })
    } finally {
      if (shouldThrottle && releaseLeaseId) {
        this.releaseConcurrencySlot(concurrencyKey, releaseLeaseId)
      }
    }
  }
}

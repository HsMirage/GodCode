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

  private async waitForConcurrencySlot(
    concurrencyKey: string,
    metadata: Record<string, unknown> | undefined
  ): Promise<void> {
    const key = this.normalizeConcurrencyKey(concurrencyKey)

    for (;;) {
      const inFlight = WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
      const limit = this.getConcurrencyLimit(key, metadata)

      if (inFlight < limit) {
        WorkforceWorkerDispatcher.inFlightByConcurrencyKey.set(key, inFlight + 1)
        return
      }

      await new Promise<void>(resolve => {
        const queue = WorkforceWorkerDispatcher.waitersByConcurrencyKey.get(key) || []
        queue.push(resolve)
        WorkforceWorkerDispatcher.waitersByConcurrencyKey.set(key, queue)
      })
    }
  }

  private releaseConcurrencySlot(concurrencyKey: string): void {
    const key = this.normalizeConcurrencyKey(concurrencyKey)
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
      next?.()
      return
    }

    const inFlight = WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
    if (inFlight <= 1) {
      WorkforceWorkerDispatcher.inFlightByConcurrencyKey.delete(key)
      return
    }

    WorkforceWorkerDispatcher.inFlightByConcurrencyKey.set(key, inFlight - 1)
  }

  static resetDispatcherStateForTests(): void {
    WorkforceWorkerDispatcher.inFlightByConcurrencyKey.clear()
    WorkforceWorkerDispatcher.waitersByConcurrencyKey.clear()
  }

  async dispatch(input: WorkerDispatchInput): Promise<DelegateTaskResult> {
    const metadata = input.metadata as Record<string, unknown> | undefined
    const concurrencyKey = String(metadata?.concurrencyKey || '')
    const shouldThrottle = !input.runInBackground && Boolean(concurrencyKey)

    if (shouldThrottle) {
      await this.waitForConcurrencySlot(concurrencyKey, metadata)
    }

    try {
      return await this.delegateEngine.delegateTask({
        ...input,
        runInBackground: input.runInBackground ?? false
      })
    } finally {
      if (shouldThrottle) {
        this.releaseConcurrencySlot(concurrencyKey)
      }
    }
  }
}

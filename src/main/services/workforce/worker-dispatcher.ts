import { DelegateEngine, type DelegateTaskInput, type DelegateTaskResult } from '@/main/services/delegate'

export type WorkerDispatchInput = Omit<
  DelegateTaskInput,
  'sessionId' | 'description' | 'prompt'
> & {
  sessionId: string
  description: string
  prompt: string
}

const DEFAULT_CONCURRENCY_LIMITS: Record<string, number> = {
  'openai-compatible::gpt-4o-mini': 1,
  'anthropic::claude-3-5-sonnet-20240620': 2,
  'openai-compatible': 2,
  anthropic: 2,
  dayu: 2,
  zhinv: 2,
  default: 3
}

export class WorkforceWorkerDispatcher {
  private delegateEngine = new DelegateEngine()
  private static inFlightByConcurrencyKey = new Map<string, number>()
  private static waitersByConcurrencyKey = new Map<string, Array<() => void>>()

  private normalizeConcurrencyKey(concurrencyKey: string): string {
    return concurrencyKey.trim() || 'default'
  }

  private getConcurrencyLimit(key: string): number {
    const trimmed = key.trim()
    if (!trimmed) {
      return DEFAULT_CONCURRENCY_LIMITS.default
    }

    return DEFAULT_CONCURRENCY_LIMITS[trimmed] ?? DEFAULT_CONCURRENCY_LIMITS.default
  }

  private async waitForConcurrencySlot(concurrencyKey: string): Promise<void> {
    const key = this.normalizeConcurrencyKey(concurrencyKey)

    for (;;) {
      const inFlight = WorkforceWorkerDispatcher.inFlightByConcurrencyKey.get(key) || 0
      const limit = this.getConcurrencyLimit(key)

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
    const concurrencyKey = String((input.metadata as Record<string, unknown> | undefined)?.concurrencyKey || '')
    const shouldThrottle = !input.runInBackground && Boolean(concurrencyKey)

    if (shouldThrottle) {
      await this.waitForConcurrencySlot(concurrencyKey)
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

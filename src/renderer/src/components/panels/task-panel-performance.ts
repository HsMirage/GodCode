export function createRafEventBuffer(onFlush: () => void) {
  let pending = false

  const schedule = () => {
    if (pending) {
      return
    }

    pending = true
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 16)
    frame(() => {
      pending = false
      onFlush()
    })
  }

  return {
    schedule
  }
}

export function createThrottledTaskReloader(
  reload: () => void,
  minIntervalMs = 180,
  nowProvider: () => number = () => Date.now()
) {
  let lastRunAt: number | null = null

  return () => {
    const now = nowProvider()
    if (lastRunAt !== null && now - lastRunAt < minIntervalMs) {
      return
    }

    lastRunAt = now
    reload()
  }
}

export function createThrottledOutputFetcher(fetcher: (taskId: string) => void) {
  const inTick = new Set<string>()

  return (taskId: string) => {
    if (!taskId || inTick.has(taskId)) {
      return
    }

    inTick.add(taskId)
    fetcher(taskId)
    queueMicrotask(() => {
      inTick.delete(taskId)
    })
  }
}

import { describe, expect, it } from 'vitest'

import {
  createRafEventBuffer,
  createThrottledTaskReloader,
  createThrottledOutputFetcher
} from '../../../src/renderer/src/components/panels/task-panel-performance'

describe('task panel performance helpers', () => {
  it('coalesces burst events into a single flush', async () => {
    const flushed: number[] = []
    const buffer = createRafEventBuffer(() => {
      flushed.push(Date.now())
    })

    buffer.schedule()
    buffer.schedule()
    buffer.schedule()

    await new Promise(resolve => setTimeout(resolve, 20))

    expect(flushed.length).toBe(1)
  })

  it('throttles task reload calls by interval', () => {
    let calls = 0
    let now = 0

    const throttled = createThrottledTaskReloader(
      () => {
        calls += 1
      },
      200,
      () => now
    )

    throttled()
    throttled()
    throttled()
    expect(calls).toBe(1)

    now = 210
    throttled()
    expect(calls).toBe(2)
  })

  it('deduplicates output fetch requests within a tick', () => {
    const requested: string[] = []
    const schedule = createThrottledOutputFetcher(id => {
      requested.push(id)
    })

    schedule('task-a')
    schedule('task-a')
    schedule('task-b')
    schedule('task-b')

    expect(requested).toEqual(['task-a', 'task-b'])
  })
})

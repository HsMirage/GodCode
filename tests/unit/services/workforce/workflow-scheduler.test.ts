import { describe, expect, it } from 'vitest'
import {
  buildDispatchBatch,
  buildWorkflowConcurrencyKey,
  getConcurrencyLimitForKey,
  getReadyWorkflowTasks
} from '@/main/services/workforce/workflow-scheduler'

describe('workflow-scheduler', () => {
  it('builds concurrency keys from model and category hints', () => {
    expect(buildWorkflowConcurrencyKey({ modelSpec: 'openai/gpt-4o-mini' })).toBe('openai::gpt-4o-mini')
    expect(buildWorkflowConcurrencyKey({ provider: 'anthropic' })).toBe('anthropic')
    expect(buildWorkflowConcurrencyKey({ category: 'frontend' })).toBe('frontend')
    expect(buildWorkflowConcurrencyKey({})).toBe('default')
  })

  it('filters ready tasks based on completion, failure, and execution guards', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const ready = getReadyWorkflowTasks({
      tasks,
      completed: new Set(['a']),
      inProgress: new Set<string>(),
      failed: new Set(['c']),
      canExecute: task => task.id !== 'b'
    })

    expect(ready).toEqual([])
  })

  it('respects per-key concurrency limits while filling a batch', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = buildDispatchBatch({
      candidates: tasks,
      availableSlots: 3,
      inProgressByKey: new Map<string, number>(),
      lastServedIndexByKey: new Map<string, number>(),
      concurrencyLimits: { default: 2, alpha: 1 },
      keyResolver: task => (task.id === 'c' ? 'beta' : 'alpha')
    })

    expect(result.batch.map(item => item.task.id)).toEqual(['a', 'c'])
    expect(result.nextInProgressByKey.get('alpha')).toBe(1)
    expect(result.nextInProgressByKey.get('beta')).toBe(1)
  })

  it('uses explicit limits over fallback defaults', () => {
    expect(getConcurrencyLimitForKey('alpha', { default: 2, alpha: 5 }, 3)).toBe(5)
    expect(getConcurrencyLimitForKey('', { default: 2 }, 3)).toBe(2)
    expect(getConcurrencyLimitForKey('missing', {}, 3)).toBe(3)
  })
})

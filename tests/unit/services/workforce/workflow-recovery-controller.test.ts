import { describe, expect, it } from 'vitest'
import {
  buildCheckpointHaltRecoveryPrompt,
  buildRecoveryRepairPrompt,
  buildRecoveryRouteSelection,
  classifyRecoveryFailure,
  selectCheckpointRecoveryTargets,
  shouldAttemptCheckpointHaltRecovery
} from '@/main/services/workforce/workflow-recovery-controller'

describe('workflow-recovery-controller', () => {
  it('classifies common recovery failures', () => {
    expect(classifyRecoveryFailure(new Error('403 forbidden'))).toBe('permission')
    expect(classifyRecoveryFailure(new Error('module not found: eslint'))).toBe('dependency')
    expect(classifyRecoveryFailure(new Error('test failed on CI'))).toBe('implementation')
  })

  it('builds fallback route selection for subagent-first policy', () => {
    const route = buildRecoveryRouteSelection({
      failureClass: 'implementation',
      fallbackPolicy: 'subagent-first',
      assignedCategory: 'dayu',
      fallbackSubagentsByCategory: { dayu: 'luban' }
    })

    expect(route.strategy).toBe('implementation-repair-via-category:subagent-first')
    expect(route.subagent_type).toBe('luban')
    expect(route.category).toBeUndefined()
  })

  it('selects checkpoint recovery targets from halt reason', () => {
    const targets = selectCheckpointRecoveryTargets('请重试 task-2，证据不足', [
      { id: 'task-1' },
      { id: 'task-2' }
    ])

    expect(targets.map(item => item.id)).toEqual(['task-2'])
    expect(shouldAttemptCheckpointHaltRecovery('task 2 evidence missing', /evidence/i)).toBe(true)
  })

  it('renders structured recovery prompts', () => {
    const repairPrompt = buildRecoveryRepairPrompt({
      task: { id: 'task-1', description: '修复测试' },
      sourceError: 'test failed',
      failureClass: 'implementation',
      attempt: 1,
      objective: '让测试通过'
    })
    const checkpointPrompt = buildCheckpointHaltRecoveryPrompt({
      basePrompt: 'base',
      reason: 'evidence missing',
      attempt: 1,
      phase: 'between-waves',
      maxAttempts: 3
    })

    expect(repairPrompt).toContain('结构化证据')
    expect(checkpointPrompt).toContain('CHECKPOINT HALT RECOVERY')
    expect(checkpointPrompt).toContain('1/3')
  })
})

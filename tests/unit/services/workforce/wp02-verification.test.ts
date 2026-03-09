/**
 * WP-02 D Verification tests
 *
 * These tests verify that the workforce module split preserves:
 * - Plan file mode (D: 验证 plan file 模式)
 * - Auto decomposition mode (D: 验证自动分解模式)
 * - Retry triggering (D: 验证 retry 仍可触发)
 * - Recovery metadata writing (D: 验证 recovery metadata 仍写入)
 * - Observability output readable by frontend (D: 验证 observability 输出仍可被前端读取)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkforceEngine } from '@/main/services/workforce/workforce-engine'
import {
  parsePlanSubtasksFromContent,
  normalizeDecomposedSubtasks
} from '@/main/services/workforce/workflow-decomposer'
import {
  buildWorkflowGraph,
  validateWorkflowGraph
} from '@/main/services/workforce/workflow-graph-builder'
import {
  buildDispatchBatch,
  getReadyWorkflowTasks,
  buildWorkflowConcurrencyKey,
  getConcurrencyLimitForKey
} from '@/main/services/workforce/workflow-scheduler'
import {
  buildWorkflowIntegratedResult,
  buildWorkflowFinalOutput
} from '@/main/services/workforce/workflow-integration-service'
import { buildWorkflowObservabilitySnapshot } from '@/main/services/workforce/workflow-observability-writer'
import {
  classifyRecoveryFailure,
  isRecoveryClassRecoverable,
  buildRecoveryRouteSelection,
  buildRecoveryRepairPrompt,
  shouldAttemptCheckpointHaltRecovery
} from '@/main/services/workforce/workflow-recovery-controller'
import type { SubTask } from '@/main/services/workforce/workflow-types'
import { createRetryState, calculateBackoffDelay, RetryableErrorType, classifyError, isRetryable } from '@/main/services/workforce/retry'

const mockPrisma: any = {
  task: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  model: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  systemSetting: { findUnique: vi.fn() },
  agentBinding: { findUnique: vi.fn() },
  categoryBinding: { findUnique: vi.fn() },
  session: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  space: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(callback => callback(mockPrisma))
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      getClient: vi.fn(() => mockPrisma)
    }))
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
      }))
    }))
  }
}))

vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => ({
    sendMessage: vi.fn()
  }))
}))

vi.mock('@/main/services/secure-storage.service', () => ({
  SecureStorageService: {
    getInstance: vi.fn(() => ({
      decrypt: vi.fn((s: string) => s)
    }))
  }
}))

vi.mock('@/main/services/boulder-state.service', () => ({
  BoulderStateService: {
    getInstance: vi.fn(() => ({
      getState: vi.fn(() => ({})),
      isSessionTracked: vi.fn(() => false)
    }))
  }
}))

describe('WP-02 D: Plan file mode verification', () => {
  it('parses a realistic plan file into executable subtasks with DAG', () => {
    const planContent = `# Feature Plan

## Tasks
- [x] Setup project structure
- [ ] Task 1: Implement API endpoints
- [ ] Task 2: Implement database schema (depends on: 1)
- [ ] Task 3: Write integration tests (depends on: 1, 2)
- [ ] Task 4: Deploy to staging (depends on: 3)
`
    const subtasks = parsePlanSubtasksFromContent(planContent)
    expect(subtasks.length).toBe(4)
    expect(subtasks.every(t => t.source === 'plan')).toBe(true)

    const graph = buildWorkflowGraph('wf-plan-test', subtasks)
    const validation = validateWorkflowGraph(graph)
    expect(validation.valid).toBe(true)

    expect(subtasks[0].dependencies).toEqual([])
    expect(subtasks[1].dependencies).toEqual(['plan-1'])
    expect(subtasks[2].dependencies).toEqual(['plan-1', 'plan-2'])
    expect(subtasks[3].dependencies).toEqual(['plan-3'])
  })

  it('plan-generated subtasks integrate with scheduler', () => {
    const subtasks = parsePlanSubtastsForScheduler()

    const completedSet = new Set<string>()
    const canExecuteWithDeps = (task: SubTask) =>
      task.dependencies.every(d => completedSet.has(d))

    const ready = getReadyWorkflowTasks({
      tasks: subtasks,
      completed: completedSet,
      inProgress: new Set(),
      failed: new Set(),
      canExecute: canExecuteWithDeps
    })
    expect(ready.map(t => t.id)).toEqual(['plan-1'])

    completedSet.add('plan-1')
    const readyAfter1 = getReadyWorkflowTasks({
      tasks: subtasks,
      completed: completedSet,
      inProgress: new Set(),
      failed: new Set(),
      canExecute: canExecuteWithDeps
    })
    expect(readyAfter1.map(t => t.id)).toEqual(['plan-2'])
  })
})

describe('WP-02 D: Auto decomposition mode verification', () => {
  it('normalizes LLM decomposition output into valid subtasks', () => {
    const llmOutput = [
      { id: 'task-1', description: 'Explore codebase', dependencies: [], subagent_type: 'qianliyan' },
      { id: 'task-2', description: 'Implement feature', dependencies: ['task-1'], category: 'dayu' },
      { id: 'task-3', description: 'Write tests', dependencies: ['task-2'], category: 'tianbing' }
    ]
    const subtasks = normalizeDecomposedSubtasks(llmOutput)
    expect(subtasks).toHaveLength(3)

    const graph = buildWorkflowGraph('wf-decompose-test', subtasks)
    const validation = validateWorkflowGraph(graph)
    expect(validation.valid).toBe(true)
    expect(graph.nodes.get('task-1')?.dependents).toContain('task-2')
  })

  it('normalizes malformed LLM output gracefully', () => {
    const badOutput = [
      { description: 'No ID', dependencies: [] },
      null,
      { id: '', description: '', dependencies: 'not-array' },
      { id: 'ok', description: 'Valid task', dependencies: [''] }
    ]
    const subtasks = normalizeDecomposedSubtasks(badOutput)
    expect(subtasks.length).toBeGreaterThanOrEqual(2)
    expect(subtasks.every(t => t.id.trim().length > 0)).toBe(true)
  })
})

describe('WP-02 D: Retry triggering verification', () => {
  it('retry state tracks attempt progression', () => {
    const state = createRetryState('task-verify', 3)
    expect(state.attemptNumber).toBe(1)
    expect(state.status).toBe('pending')
  })

  it('backoff delay increases with attempts', () => {
    const delay1 = calculateBackoffDelay(1)
    const delay2 = calculateBackoffDelay(2)
    const delay3 = calculateBackoffDelay(3)
    expect(delay2).toBeGreaterThan(delay1)
    expect(delay3).toBeGreaterThan(delay2)
  })

  it('retryable errors are classified correctly', () => {
    const rateLimit = classifyError(new Error('rate limit exceeded'))
    expect(isRetryable(rateLimit)).toBe(true)

    const timeout = classifyError(new Error('Request timeout'))
    expect(isRetryable(timeout)).toBe(true)
  })
})

describe('WP-02 D: Recovery metadata writing verification', () => {
  it('classifies recovery failures into correct classes', () => {
    expect(classifyRecoveryFailure(new Error('403 forbidden'))).toBe('permission')
    expect(classifyRecoveryFailure(new Error('api key invalid'))).toBe('config')
    expect(classifyRecoveryFailure(new Error('module not found'))).toBe('dependency')
    expect(classifyRecoveryFailure(new Error('test failed'))).toBe('implementation')
  })

  it('recovery route selection produces strategy and diagnostics', () => {
    const route = buildRecoveryRouteSelection({
      failureClass: 'transient',
      fallbackPolicy: 'category-first',
      assignedCategory: 'dayu',
      fallbackSubagentsByCategory: { dayu: 'luban' }
    })
    expect(route.strategy).toBeTruthy()
    expect(route.diagnostics).toBeDefined()
    expect(route.diagnostics!.attemptedRoutes.length).toBeGreaterThan(0)
  })

  it('recovery repair prompt includes structured fields', () => {
    const prompt = buildRecoveryRepairPrompt({
      task: { id: 'task-1', description: 'Fix bug' },
      sourceError: 'timeout',
      failureClass: 'transient',
      attempt: 1,
      objective: 'Retry with increased timeout'
    })
    expect(prompt).toContain('task-1')
    expect(prompt).toContain('transient')
    expect(prompt).toContain('objective')
    expect(prompt).toContain('validation')
  })

  it('non-recoverable classes are identified', () => {
    expect(isRecoveryClassRecoverable('permission')).toBe(false)
    expect(isRecoveryClassRecoverable('unknown')).toBe(false)
    expect(isRecoveryClassRecoverable('transient')).toBe(true)
    expect(isRecoveryClassRecoverable('config')).toBe(true)
  })
})

describe('WP-02 D: Observability output frontend-readable verification', () => {
  it('buildWorkflowObservabilitySnapshot produces complete snapshot', () => {
    const tasks: Array<{ id: string; assignedAgent?: string; assignedCategory?: string }> = [
      { id: 'task-1', assignedAgent: 'qianliyan' },
      { id: 'task-2', assignedCategory: 'dayu' }
    ]
    const graph = buildWorkflowGraph('wf-obs-test', [
      { id: 'task-1', dependencies: [] },
      { id: 'task-2', dependencies: ['task-1'] }
    ])
    const integrated = buildWorkflowIntegratedResult({
      workflowId: 'wf-obs-test',
      tasks: [{ id: 'task-1' }, { id: 'task-2' }],
      results: new Map([
        ['task-1', 'Scanned codebase'],
        ['task-2', 'Implemented feature with changed files: src/index.ts']
      ]),
      collectMissingEvidenceFields: () => []
    })

    const snapshot = buildWorkflowObservabilitySnapshot({
      workflowId: 'wf-obs-test',
      sessionId: 'session-1',
      graph,
      integrated,
      sharedContext: { workflowId: 'wf-obs-test', entries: [], archivedEntries: [] },
      activeEntries: [],
      archivedEntries: [],
      executions: new Map([
        ['task-1', { persistedTaskId: 'p-1', model: 'claude-3-sonnet' }],
        ['task-2', { persistedTaskId: 'p-2', model: 'gpt-4' }]
      ]),
      tasks,
      lifecycleEvents: [
        { stage: 'plan', timestamp: new Date().toISOString() },
        { stage: 'dispatch', timestamp: new Date().toISOString() }
      ],
      taskTimeline: [],
      runTimeline: [],
      retryStates: new Map(),
      recoveryState: {
        phase: 'classify',
        config: { enabled: true, maxAttempts: 2, classBudget: { transient: 2, config: 1, dependency: 1, implementation: 1, permission: 1, unknown: 1 }, fallbackPolicy: 'category-first' },
        history: [],
        terminalDiagnostics: [],
        recoveredTasks: [],
        unrecoveredTasks: []
      },
      status: 'completed'
    })

    expect(snapshot.workflowId).toBe('wf-obs-test')
    expect(snapshot.graph.nodeOrder).toEqual(['task-1', 'task-2'])
    expect(snapshot.correlation.sessionId).toBe('session-1')
    expect(snapshot.timeline.workflow).toHaveLength(2)
    expect(snapshot.assignments).toHaveLength(2)
    expect(snapshot.assignments[0].assignedModel).toBe('claude-3-sonnet')
    expect(snapshot.continuationSnapshot.status).toBe('completed')
    expect(snapshot.continuationSnapshot.resumable).toBe(false)
    expect(snapshot.integration.summary).toContain('wf-obs-test')
  })

  it('integration result detects conflicts and unresolved items', () => {
    const integrated = buildWorkflowIntegratedResult({
      workflowId: 'wf-conflict-test',
      tasks: [{ id: 'task-1' }, { id: 'task-2' }],
      results: new Map([
        ['task-1', 'Found conflict in module A'],
        ['task-2', '']
      ]),
      collectMissingEvidenceFields: () => []
    })

    expect(integrated.conflicts.length).toBeGreaterThan(0)
    expect(integrated.unresolvedItems.some(item => item.includes('无输出'))).toBe(true)
  })

  it('final output is human-readable text', () => {
    const integrated = buildWorkflowIntegratedResult({
      workflowId: 'wf-final-test',
      tasks: [{ id: 'task-1' }],
      results: new Map([['task-1', 'Done with changed files: src/app.ts']]),
      collectMissingEvidenceFields: () => []
    })
    const output = buildWorkflowFinalOutput(integrated)
    expect(typeof output).toBe('string')
    expect(output).toContain('task-1')
    expect(output).toContain('task_outputs')
  })

  it('checkpoint halt recovery detection works', () => {
    expect(
      shouldAttemptCheckpointHaltRecovery(
        'evidence_detected=no for task #2',
        /(evidence_detected=no)/i
      )
    ).toBe(true)

    expect(
      shouldAttemptCheckpointHaltRecovery('all tasks completed successfully', /(evidence_detected=no)/i)
    ).toBe(false)
  })
})

function parsePlanSubtastsForScheduler(): SubTask[] {
  return parsePlanSubtasksFromContent(`- [ ] Task 1: Setup\n- [ ] Task 2: Build (depends on: 1)\n- [ ] Task 3: Test (depends on: 2)`)
}

import { describe, expect, it } from 'vitest'
import { buildWorkflowGraph } from '@/main/services/workforce/workflow-graph-builder'
import { buildWorkflowObservabilitySnapshot } from '@/main/services/workforce/workflow-observability-writer'

describe('workflow-observability-writer', () => {
  it('builds assignments, retry state, and shared context snapshot', () => {
    const snapshot = buildWorkflowObservabilitySnapshot({
      workflowId: 'workflow-1',
      sessionId: 'session-1',
      graph: buildWorkflowGraph('workflow-1', [{ id: 'task-1', dependencies: [] }]),
      integrated: {
        summary: 'summary',
        conflicts: [],
        unresolvedItems: [],
        taskOutputs: [],
        rawTaskOutputs: []
      },
      sharedContext: {
        workflowId: 'workflow-1',
        entries: [{ id: 'entry-1' }],
        archivedEntries: [{ id: 'entry-2' }]
      },
      activeEntries: [{ id: 'entry-1' }],
      archivedEntries: [{ id: 'entry-2' }],
      executions: new Map([
        [
          'task-1',
          {
            persistedTaskId: 'persisted-1',
            runId: 'run-1',
            concurrencyKey: 'alpha',
            modelSource: 'system-default',
            modelSelectionReason: 'system-default-hit',
            modelSelectionSummary: '命中系统默认模型 openai-compatible/gpt-4o-mini。'
          }
        ]
      ]),
      tasks: [{ id: 'task-1', assignedAgent: 'haotian', workflowPhase: 'execution' }],
      lifecycleEvents: [{ stage: 'dispatch', timestamp: '2026-03-06T00:00:00.000Z' }],
      taskTimeline: [],
      runTimeline: [],
      retryStates: new Map([
        [
          'task-1',
          {
            attemptNumber: 2,
            status: 'retrying',
            maxAttempts: 3,
            errors: [{ errorType: 'rate_limit', error: 'retry later', timestamp: new Date('2026-03-06T00:00:00.000Z') }]
          }
        ]
      ]),
      recoveryState: {
        phase: 'classify',
        config: {
          enabled: true,
          maxAttempts: 2,
          classBudget: {
            transient: 1,
            config: 1,
            dependency: 1,
            implementation: 1,
            permission: 1,
            unknown: 1
          },
          fallbackPolicy: 'category-first'
        },
        history: [],
        terminalDiagnostics: [],
        recoveredTasks: [],
        unrecoveredTasks: []
      },
      status: 'failed'
    })

    expect(snapshot.assignments[0]).toMatchObject({
      taskId: 'task-1',
      persistedTaskId: 'persisted-1',
      runId: 'run-1',
      assignedAgent: 'haotian',
      concurrencyKey: 'alpha',
      modelSource: 'system-default',
      modelSelectionReason: 'system-default-hit'
    })
    expect(snapshot.retryState.totalRetried).toBe(1)
    expect(snapshot.continuationSnapshot.resumable).toBe(true)
    expect(snapshot.sharedContext.totalEntries).toBe(2)
  })
})

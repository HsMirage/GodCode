import { describe, expect, it } from 'vitest'

import {
  buildTaskDiagnosticsFromObservability,
  classifyRunLogDiagnostics,
  mergeTaskDiagnostics,
  type TaskDiagnosticSummary
} from '../../../src/renderer/src/components/panels/task-panel-diagnostics'
import type { Task } from '../../../src/types/domain'

describe('task panel diagnostics merge', () => {
  const createTask = (id: string, status: Task['status'] = 'failed', output?: string): Task => ({
    id,
    sessionId: 'session-1',
    type: 'subtask',
    status,
    input: `task-${id}`,
    output,
    createdAt: new Date('2026-03-01T00:00:00.000Z')
  })

  it('keeps primary diagnostic when it has higher score than run-log fallback', () => {
    const primary: TaskDiagnosticSummary = {
      category: 'permission',
      label: '权限拒绝',
      reason: 'Policy denied tool execution',
      evidence: ['policy deny from recovery state'],
      source: 'recovery-terminal',
      score: 40
    }

    const runLog: TaskDiagnosticSummary = {
      category: 'tool',
      label: '工具不可用',
      reason: 'command not found',
      evidence: ['tool command not found in run-log'],
      source: 'run-log',
      score: 16
    }

    const merged = mergeTaskDiagnostics(primary, runLog)

    expect(merged).toBeDefined()
    expect(merged?.category).toBe('permission')
    expect(merged?.source).toBe('recovery-terminal')
    expect(merged?.evidence).toEqual(
      expect.arrayContaining(['policy deny from recovery state', 'tool command not found in run-log'])
    )
  })

  it('classifies run-log errors and prioritizes error level signals', () => {
    const diagnostic = classifyRunLogDiagnostics([
      {
        level: 'warn',
        message: 'tool command not found',
        data: { code: 'ENOENT' }
      },
      {
        level: 'error',
        message: '401 unauthorized api key',
        data: { provider: 'openai' }
      }
    ])

    expect(diagnostic).toBeDefined()
    expect(diagnostic?.category).toBe('config')
    expect(diagnostic?.source).toBe('run-log')
    expect(diagnostic?.score).toBe(16)
    expect(diagnostic?.reason).toContain('401 unauthorized api key')
  })

  it('builds session/task diagnostics from observability and falls back to task output', () => {
    const tasks: Task[] = [
      createTask('task-permission', 'failed', 'permission denied by policy'),
      createTask('task-output-fallback', 'failed', 'llm overloaded timeout')
    ]

    const diagnostics = buildTaskDiagnosticsFromObservability(tasks, {
      assignments: [{ taskId: 'logical-1', persistedTaskId: 'task-permission' }],
      recoveryState: {
        terminalDiagnostics: [
          {
            taskId: 'logical-1',
            failureClass: 'permission',
            reason: 'operation not permitted during tool execution',
            remediation: ['request approval'],
            timestamp: '2026-03-01T01:02:03.000Z'
          }
        ],
        history: [
          {
            taskId: 'logical-1',
            status: 'failed',
            failureClass: 'config',
            sourceError: '401 unauthorized token',
            finishedAt: '2026-03-01T01:03:03.000Z'
          }
        ]
      }
    })

    expect(diagnostics.byTaskId['task-permission']).toBeDefined()
    expect(diagnostics.byTaskId['task-permission']?.category).toBe('permission')
    expect(diagnostics.byTaskId['task-permission']?.source).toBe('recovery-terminal')
    expect(diagnostics.byTaskId['task-permission']?.score).toBe(40)

    expect(diagnostics.byTaskId['task-output-fallback']).toBeDefined()
    expect(diagnostics.byTaskId['task-output-fallback']?.source).toBe('task-output')
    expect(diagnostics.byTaskId['task-output-fallback']?.category).toBe('model')

    expect(diagnostics.summary.total).toBe(2)
    expect(diagnostics.summary.permission).toBe(1)
    expect(diagnostics.summary.model).toBe(1)
  })
})

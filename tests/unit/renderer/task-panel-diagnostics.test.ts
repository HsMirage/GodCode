import { describe, expect, it } from 'vitest'

import {
  buildWorkflowStuckDiagnosticSummary,
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

  it('builds stuck summary for pending approval tasks', () => {
    const tasks: Task[] = [
      createTask('task-approval', 'pending_approval', 'apply schema migration')
    ]

    const summary = buildWorkflowStuckDiagnosticSummary({
      tasks,
      observability: {
        timeline: {
          workflow: [
            {
              stage: 'dispatch',
              timestamp: '2026-03-01T01:00:00.000Z'
            }
          ]
        },
        assignments: [
          {
            persistedTaskId: 'task-approval',
            workflowPhase: 'execution'
          }
        ]
      },
      diagnosticsByTaskId: {},
      approvals: [
        {
          id: 'approval-1',
          sessionId: 'session-1',
          taskId: 'task-approval',
          toolCallId: 'call-1',
          toolName: 'file_write',
          requestedToolName: 'file_write',
          resolvedToolName: 'file_write',
          arguments: { path: 'src/main.ts' },
          riskLevel: 'high',
          reason: '需要写入仓库文件',
          status: 'pending_approval',
          requestedAt: '2026-03-01T01:02:03.000Z'
        }
      ]
    })

    expect(summary).toBeDefined()
    expect(summary?.currentStage).toBe('任务分派')
    expect(summary?.currentSubtask?.taskId).toBe('task-approval')
    expect(summary?.currentSubtask?.phase).toBe('执行')
    expect(summary?.blockerType).toBe('等待审批')
    expect(summary?.waitingApproval).toBe(true)
    expect(summary?.pendingApproval?.toolName).toBe('file_write')
    expect(summary?.humanTakeoverRecommended).toBe(false)
  })

  it('recommends human takeover for config failures after workflow failure', () => {
    const tasks: Task[] = [
      createTask('task-config-failed', 'failed', '401 unauthorized api key')
    ]

    const summary = buildWorkflowStuckDiagnosticSummary({
      tasks,
      observability: {
        continuationSnapshot: {
          status: 'failed',
          resumable: false,
          failedTasks: ['task-config-failed'],
          retryableTasks: [],
          updatedAt: '2026-03-01T02:00:00.000Z'
        }
      },
      diagnosticsByTaskId: {
        'task-config-failed': {
          category: 'config',
          label: '配置错误',
          reason: '401 unauthorized api key',
          evidence: ['401 unauthorized api key'],
          source: 'task-output',
          score: 8
        }
      },
      approvals: []
    })

    expect(summary).toBeDefined()
    expect(summary?.blockerType).toBe('配置错误')
    expect(summary?.humanTakeoverRecommended).toBe(true)
    expect(summary?.humanTakeoverReason).toContain('配置')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { buildTaskReadinessDashboardSnapshot } from '../../../src/shared/task-readiness-dashboard'
import { TaskPanel } from '../../../src/renderer/src/components/panels/TaskPanel'
import { useAgentStore } from '../../../src/renderer/src/store/agent.store'
import { useDataStore } from '../../../src/renderer/src/store/data.store'
import { useTraceNavigationStore } from '../../../src/renderer/src/store/trace-navigation.store'
import type { Task } from '../../../src/types/domain'

function createTask(task: Partial<Task> & Pick<Task, 'id' | 'type' | 'status' | 'input'>): Task {
  const now = new Date('2026-03-08T00:00:00.000Z')
  return {
    sessionId: 'session-1',
    createdAt: now,
    ...task
  } as Task
}

describe('<TaskPanel /> task readiness dashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem(
      'godcode.task-readiness.dashboard.history',
      JSON.stringify([
        buildTaskReadinessDashboardSnapshot({
          version: '0.9.0',
          label: 'v0.9.0',
          totalTasks: 10,
          completedTasks: 9,
          firstPassTasks: 8,
          retryCount: 2,
          manualTakeovers: 1,
          approvalRequiredActions: 2,
          approvalHits: 2,
          scopeViolations: null,
          contextLossIncidents: 0,
          crossSessionRecoveryAttempts: 1,
          crossSessionRecoverySuccesses: 1,
          sourceStatusOverrides: { scope_violation_rate: 'missing' },
          capturedAt: '2026-03-01T00:00:00.000Z'
        })
      ])
    )
    useDataStore.setState({ currentSessionId: 'session-1' })
    useAgentStore.setState({ workLogs: {} })
    useTraceNavigationStore.getState().clearNavigate()
  })

  it('renders version trend and layer regression hints in observability panel', async () => {
    const tasks: Task[] = [
      createTask({ id: 'workflow-1', type: 'workflow', status: 'running', input: 'workflow root' }),
      createTask({
        id: 'task-done',
        type: 'subtask',
        status: 'completed',
        input: 'completed task'
      }),
      createTask({
        id: 'task-failed',
        type: 'subtask',
        status: 'failed',
        input: 'write config',
        output: 'operation not permitted'
      }),
      createTask({
        id: 'task-approval',
        type: 'subtask',
        status: 'pending_approval',
        input: 'sensitive change'
      })
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'workflow-observability:get') {
        return {
          assignments: [],
          retryState: {
            tasks: {
              'task-done': {
                attemptNumber: 2,
                status: 'completed',
                maxAttempts: 2,
                errors: [
                  {
                    errorType: 'tool',
                    error: 'temporary failure',
                    timestamp: '2026-03-08T00:00:01.000Z'
                  }
                ]
              }
            },
            totalRetried: 2
          },
          continuationSnapshot: {
            workflowId: 'workflow-1',
            status: 'running',
            resumable: true,
            failedTasks: [],
            retryableTasks: [],
            updatedAt: '2026-03-08T00:00:02.000Z'
          }
        }
      }
      if (channel === 'tool-approval:list') return []
      if (channel === 'background-task:list') return { success: true, data: [] }
      if (channel === 'background-task:stats') {
        return {
          success: true,
          data: { total: 0, running: 0, completed: 0, error: 0, cancelled: 0 }
        }
      }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    render(<TaskPanel />)

    expect(await screen.findByText('KPI 仪表盘')).toBeInTheDocument()
    expect(screen.getByText(/当前版本 v1.0.0 · 对比 v0.9.0/)).toBeInTheDocument()
    expect(screen.getByText('Delegate')).toBeInTheDocument()
    expect(screen.getByText('Tool')).toBeInTheDocument()
    expect(screen.getAllByText(/任务完成率/).length).toBeGreaterThan(0)
    expect(screen.getByText(/审批命中率下降 100pp/)).toBeInTheDocument()
    expect(screen.queryByText('运行绑定快照')).not.toBeInTheDocument()
    expect(screen.queryByText('诊断统计')).not.toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalledWith('background-task:stats')
  })
})

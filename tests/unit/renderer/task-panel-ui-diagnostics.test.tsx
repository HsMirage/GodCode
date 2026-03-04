import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TaskPanel } from '../../../src/renderer/src/components/panels/TaskPanel'
import { useDataStore } from '../../../src/renderer/src/store/data.store'
import { useAgentStore } from '../../../src/renderer/src/store/agent.store'
import { useTraceNavigationStore } from '../../../src/renderer/src/store/trace-navigation.store'
import type { Task } from '../../../src/types/domain'

function createTask(task: Partial<Task> & Pick<Task, 'id' | 'type' | 'status' | 'input'>): Task {
  const now = new Date('2026-03-04T00:00:00.000Z')
  return {
    sessionId: 'session-1',
    createdAt: now,
    ...task
  } as Task
}

describe('<TaskPanel /> diagnostics view', () => {
  beforeEach(() => {
    useDataStore.setState({
      currentSessionId: 'session-1'
    })
    useAgentStore.setState({
      workLogs: {}
    })
    useTraceNavigationStore.getState().clearNavigate()
    vi.restoreAllMocks()
  })

  it('shows session summary and upgrades task-output diagnosis with run-log signals in detail modal', async () => {
    const tasks: Task[] = [
      createTask({
        id: 'task-model-failure',
        type: 'subtask',
        status: 'failed',
        input: 'retry provider call',
        output: 'llm overloaded timeout',
        metadata: { runId: 'run-1' }
      })
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'background-task:list') return { success: true, data: [] }
      if (channel === 'background-task:stats') {
        return {
          success: true,
          data: { total: 0, running: 0, completed: 0, error: 0, cancelled: 0 }
        }
      }
      if (channel === 'agent-run:get-logs') {
        return [
          { level: 'warn', message: 'tool command not found', data: { code: 'ENOENT' } },
          { level: 'error', message: '401 unauthorized api key', data: { provider: 'openai' } }
        ]
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

    expect(await screen.findByText('失败诊断概览')).toBeInTheDocument()
    expect(screen.getByText(/总计:\s*1/)).toBeInTheDocument()
    expect(screen.getByText(/模型失败:\s*1/)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /模型失败/ }))

    expect(await screen.findByText('任务详情')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/来源:\s*Run 日志/)).toBeInTheDocument()
      expect(screen.getByText(/置信分:\s*16/)).toBeInTheDocument()
    })

    expect(screen.getAllByText(/401 unauthorized api key/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/llm overloaded timeout/).length).toBeGreaterThan(0)
  })

  it('keeps high-confidence recovery terminal diagnosis when run logs are lower confidence', async () => {
    const tasks: Task[] = [
      createTask({
        id: 'workflow-1',
        type: 'workflow',
        status: 'running',
        input: 'workflow root'
      }),
      createTask({
        id: 'task-permission',
        type: 'subtask',
        status: 'failed',
        input: 'write protected file',
        output: 'llm overloaded timeout',
        metadata: { runId: 'run-2' }
      })
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'workflow-observability:get') {
        return {
          assignments: [{ taskId: 'logical-1', persistedTaskId: 'task-permission' }],
          recoveryState: {
            terminalDiagnostics: [
              {
                taskId: 'logical-1',
                failureClass: 'permission',
                reason: 'operation not permitted during tool execution',
                remediation: ['request approval'],
                timestamp: '2026-03-04T01:02:03.000Z'
              }
            ]
          }
        }
      }
      if (channel === 'background-task:list') return { success: true, data: [] }
      if (channel === 'background-task:stats') {
        return {
          success: true,
          data: { total: 0, running: 0, completed: 0, error: 0, cancelled: 0 }
        }
      }
      if (channel === 'agent-run:get-logs') {
        return [{ level: 'error', message: '401 unauthorized api key', data: { provider: 'openai' } }]
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

    expect(await screen.findByText('失败诊断概览')).toBeInTheDocument()
    expect(screen.getByText(/权限拒绝:\s*1/)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /权限拒绝/ }))

    await waitFor(() => {
      expect(screen.getByText(/来源:\s*恢复终端诊断/)).toBeInTheDocument()
      expect(screen.getByText(/置信分:\s*40/)).toBeInTheDocument()
    })

    expect(screen.getAllByText(/operation not permitted during tool execution/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/401 unauthorized api key/i).length).toBeGreaterThan(0)
  })
})

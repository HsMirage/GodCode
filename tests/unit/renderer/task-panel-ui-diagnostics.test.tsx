import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TaskPanel } from '../../../src/renderer/src/components/panels/TaskPanel'
import { useDataStore } from '../../../src/renderer/src/store/data.store'
import { useAgentStore } from '../../../src/renderer/src/store/agent.store'
import { useTraceNavigationStore } from '../../../src/renderer/src/store/trace-navigation.store'
import type { Task } from '../../../src/types/domain'

const clipboardWriteText = vi.fn()

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
    vi.restoreAllMocks()
    useDataStore.setState({
      currentSessionId: 'session-1'
    })
    useAgentStore.setState({
      workLogs: {}
    })
    useTraceNavigationStore.getState().clearNavigate()
    clipboardWriteText.mockReset()
    const clipboardMock = { writeText: clipboardWriteText }
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      get: () => clipboardMock
    })
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      get: () => clipboardMock
    })
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
      if (channel === 'tool-approval:list') return []
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

    const copyButton = screen.getByRole('button', { name: /复制诊断包/ })
    await user.click(copyButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /已复制|复制失败/ })).toBeInTheDocument()
    })

    if (clipboardWriteText.mock.calls.length > 0) {
      expect(String(clipboardWriteText.mock.calls[0]?.[0] || '')).toContain('# Task 诊断包')
      expect(String(clipboardWriteText.mock.calls[0]?.[0] || '')).toContain('## 诊断')
      expect(String(clipboardWriteText.mock.calls[0]?.[0] || '')).toContain('Run 日志摘要')
    }
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
      if (channel === 'tool-approval:list') return []
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

  it('shows model selection source and fallback explanation from workflow observability', async () => {
    const tasks: Task[] = [
      createTask({
        id: 'workflow-1',
        type: 'workflow',
        status: 'running',
        input: 'workflow root'
      }),
      createTask({
        id: 'task-model-source',
        type: 'subtask',
        status: 'completed',
        input: 'implement ui polish',
        assignedModel: 'gpt-4o-mini'
      })
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'workflow-observability:get') {
        return {
          assignments: [
            {
              persistedTaskId: 'task-model-source',
              modelSource: 'category-binding',
              modelSelectionReason: 'category-binding-hit',
              modelSelectionSummary: '命中类别绑定（织女 / zhinv），使用模型 openai-compatible/gpt-4o-mini。',
              fallbackReason: 'binding-disabled',
              fallbackAttemptSummary: [
                { summary: '未提供覆盖模型，继续检查绑定。' },
                { summary: 'Agent 绑定（白泽 / baize）已禁用，继续回退。' }
              ]
            }
          ]
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

    expect((await screen.findAllByText(content => content.includes('来源: 类别绑定'))).length).toBeGreaterThan(0)
    expect(screen.getByText(content => content.includes('命中: 命中类别绑定'))).toBeInTheDocument()
    expect(screen.getByText(content => content.includes('模型选择: 命中类别绑定'))).toBeInTheDocument()
    expect(screen.queryByText(content => content.includes('选择回退:'))).not.toBeInTheDocument()
  })

  it('shows stuck diagnostic panel with approval blocker summary', async () => {
    const tasks: Task[] = [
      createTask({
        id: 'workflow-1',
        type: 'workflow',
        status: 'running',
        input: 'workflow root'
      }),
      createTask({
        id: 'task-approval',
        type: 'subtask',
        status: 'pending_approval',
        input: 'apply schema migration',
        metadata: {
          executionEvents: [
            {
              id: 'event-1',
              type: 'tool-call-requested',
              sessionId: 'session-1',
              taskId: 'task-approval',
              timestamp: '2026-03-04T00:00:05.000Z',
              payload: {
                toolName: 'file_write'
              }
            }
          ]
        }
      })
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'workflow-observability:get') {
        return {
          timeline: {
            workflow: [
              {
                stage: 'dispatch',
                timestamp: '2026-03-04T00:00:06.000Z'
              }
            ]
          },
          continuationSnapshot: {
            status: 'running',
            resumable: true,
            failedTasks: [],
            retryableTasks: [],
            updatedAt: '2026-03-04T00:00:06.000Z'
          },
          assignments: [
            {
              persistedTaskId: 'task-approval',
              workflowPhase: 'execution'
            }
          ]
        }
      }
      if (channel === 'tool-approval:list') {
        return [
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
            requestedAt: '2026-03-04T00:00:07.000Z'
          }
        ]
      }
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

    expect(await screen.findByText('卡点诊断面板')).toBeInTheDocument()
    expect(screen.getByText('任务分派')).toBeInTheDocument()
    expect(screen.getAllByText('apply schema migration').length).toBeGreaterThan(0)
    expect(screen.getAllByText('等待审批').length).toBeGreaterThan(0)
    expect(screen.getByText(content => content.includes('file_write · 已发起'))).toBeInTheDocument()
    expect(
      screen.getByText(content => content.includes('file_write · 风险 high · 需要写入仓库文件'))
    ).toBeInTheDocument()
    expect(screen.getByText('暂不需要')).toBeInTheDocument()
  })
})

describe('<TaskPanel /> trace visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useDataStore.setState({ currentSessionId: 'session-1' })
    useAgentStore.setState({ workLogs: {} })
    useTraceNavigationStore.getState().clearNavigate()
    clipboardWriteText.mockReset()
    const clipboardMock = { writeText: clipboardWriteText }
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      get: () => clipboardMock
    })
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      get: () => clipboardMock
    })
  })

  it('shows trace id in task detail and diagnostic package', async () => {
    const tasks: Task[] = [
      createTask({
        id: 'task-trace-detail',
        type: 'subtask',
        status: 'failed',
        input: 'trace diagnostic flow',
        output: 'llm overloaded timeout',
        metadata: { runId: 'run-trace-detail', traceId: 'tr-ui-001' }
      })
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'tool-approval:list') return []
      if (channel === 'background-task:list') return { success: true, data: [] }
      if (channel === 'background-task:stats') {
        return {
          success: true,
          data: { total: 0, running: 0, completed: 0, error: 0, cancelled: 0 }
        }
      }
      if (channel === 'agent-run:get-logs') {
        return [
          { level: 'warn', message: 'tool command not found', data: { code: 'ENOENT', traceId: 'tr-ui-001' } },
          { level: 'error', message: '401 unauthorized api key', data: { provider: 'openai', traceId: 'tr-ui-001' } }
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

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /模型失败/ }))

    expect(await screen.findByText('任务详情')).toBeInTheDocument()
    expect(screen.getByText('Trace ID：')).toBeInTheDocument()
    expect(screen.getByText('tr-ui-001')).toBeInTheDocument()

  })
})

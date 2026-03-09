import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useTaskPanelDetail } from '../../../src/renderer/src/hooks/useTaskPanelDetail'
import type { Task } from '../../../src/types/domain'
import type { WorkLogEntry } from '../../../src/renderer/src/store/agent.store'

const { agentRunList, agentRunGetLogs } = vi.hoisted(() => ({
  agentRunList: vi.fn(),
  agentRunGetLogs: vi.fn()
}))
const clipboardWriteText = vi.fn()

vi.mock('../../../src/renderer/src/api', () => ({
  workflowApi: {
    agentRunList,
    agentRunGetLogs
  }
}))

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    sessionId: 'session-1',
    type: 'subtask',
    status: 'failed',
    input: 'repair provider auth',
    output: 'llm overloaded timeout',
    createdAt: new Date('2026-03-06T00:00:00.000Z'),
    ...overrides
  } as Task
}

describe('useTaskPanelDetail', () => {
  beforeEach(() => {
    agentRunList.mockReset()
    agentRunGetLogs.mockReset()
    clipboardWriteText.mockReset()

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText
      }
    })
  })

  it('loads fallback run logs and upgrades diagnostics', async () => {
    agentRunList.mockResolvedValue([{ id: 'run-1' }])
    agentRunGetLogs.mockResolvedValue([
      { level: 'warn', message: 'tool command not found', data: { code: 'ENOENT' } },
      { level: 'error', message: '401 unauthorized api key', data: { provider: 'openai' } }
    ])

    const workLogs: Record<string, WorkLogEntry[]> = {
      haotian: [
        {
          id: 'log-1',
          agentId: 'haotian',
          type: 'thinking',
          message: 'Inspecting provider configuration',
          timestamp: new Date('2026-03-06T00:00:01.000Z'),
          metadata: {
            taskId: 'task-1'
          }
        }
      ]
    }

    const { result } = renderHook(() =>
      useTaskPanelDetail({
        workLogs,
        taskDiagnosticsByTaskId: {
          'task-1': {
            category: 'model',
            label: '模型失败',
            reason: 'llm overloaded timeout',
            evidence: ['llm overloaded timeout'],
            source: 'task-output',
            score: 8
          }
        }
      })
    )

    await act(async () => {
      await result.current.openTaskDetail(createTask())
    })

    await waitFor(() => {
      expect(result.current.taskDetailState?.loading).toBe(false)
    })

    expect(agentRunList).toHaveBeenCalledWith('task-1')
    expect(agentRunGetLogs).toHaveBeenCalledWith('run-1')
    expect(result.current.taskDetailState?.thinkingLogs).toHaveLength(1)
    expect(result.current.taskDetailDiagnostic?.source).toBe('run-log')
    expect(result.current.taskDetailDiagnostic?.reason).toContain('401 unauthorized api key')
  })

  it('copies diagnostic package from loaded task detail state', async () => {
    agentRunList.mockResolvedValue([{ id: 'run-2' }])
    agentRunGetLogs.mockResolvedValue([{ level: 'error', message: 'permission denied', data: { code: 'EACCES' } }])

    const { result } = renderHook(() =>
      useTaskPanelDetail({
        workLogs: {},
        taskDiagnosticsByTaskId: {
          'task-1': {
            category: 'permission',
            label: '权限拒绝',
            reason: 'permission denied',
            evidence: ['permission denied'],
            source: 'task-output',
            score: 8
          }
        }
      })
    )

    await act(async () => {
      await result.current.openTaskDetail(createTask({ metadata: {} }))
    })

    await waitFor(() => {
      expect(result.current.taskDetailState?.loading).toBe(false)
    })

    await act(async () => {
      await result.current.copyDiagnosticPackage()
    })

    expect(clipboardWriteText).toHaveBeenCalledTimes(1)
    expect(String(clipboardWriteText.mock.calls[0]?.[0] || '')).toContain('# Task 诊断包')
    expect(String(clipboardWriteText.mock.calls[0]?.[0] || '')).toContain('## Run 日志摘要')
    expect(result.current.diagnosticCopyState).toBe('success')
  })
})

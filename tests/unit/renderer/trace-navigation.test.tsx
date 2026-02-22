import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useTraceNavigationStore } from '../../../src/renderer/src/store/trace-navigation.store.ts'
import { AgentWorkViewer } from '../../../src/renderer/src/components/agents/AgentWorkViewer'
import { useAgentStore } from '../../../src/renderer/src/store/agent.store'

describe('trace navigation store', () => {
  beforeEach(() => {
    useTraceNavigationStore.getState().clearNavigate()
  })

  it('records navigation target with monotonic request timestamp', () => {
    const store = useTraceNavigationStore.getState()

    store.requestNavigate({
      source: 'workflow-node',
      taskId: 'task-1',
      agentId: 'haotian'
    })

    const first = useTraceNavigationStore.getState().target
    expect(first?.taskId).toBe('task-1')
    expect(first?.agentId).toBe('haotian')
    expect(first?.source).toBe('workflow-node')

    store.requestNavigate({
      source: 'workflow-node',
      taskId: 'task-1',
      agentId: 'haotian'
    })

    const second = useTraceNavigationStore.getState().target
    expect(second?.requestedAt).toBeGreaterThan(first?.requestedAt ?? 0)
  })
})

describe('<AgentWorkViewer /> trace linkage', () => {
  beforeEach(() => {
    useTraceNavigationStore.getState().clearNavigate()
    useAgentStore.setState({
      agents: [
        {
          id: 'haotian',
          name: '昊天',
          role: '主编排',
          status: 'working',
          currentTask: '协调任务',
          tasksCompleted: 2,
          tokensUsed: 1024,
          model: 'claude-sonnet-4-6'
        }
      ],
      selectedAgentId: 'haotian',
      workLogs: {
        haotian: [
          {
            id: 'log-1',
            agentId: 'haotian',
            type: 'result',
            message: '任务执行完成',
            timestamp: new Date('2026-02-21T00:00:00.000Z'),
            metadata: {
              taskId: 'task-123'
            }
          }
        ]
      }
    })
  })

  it('jumps from agent log to related workflow task', async () => {
    render(<AgentWorkViewer agentId="haotian" />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Jump to task task-123' }))

    const target = useTraceNavigationStore.getState().target
    expect(target?.taskId).toBe('task-123')
    expect(target?.agentId).toBe('haotian')
    expect(target?.source).toBe('agent-log')
  })
})

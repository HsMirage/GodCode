import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { WorkflowView } from '../../../src/renderer/src/components/workflow/WorkflowView'

vi.mock('@xyflow/react', () => {
  return {
    ReactFlow: ({ nodes = [], children }: any) => (
      <div data-testid="mock-reactflow">
        {nodes.map((node: any) => (
          <button
            key={node.id}
            type="button"
            onClick={() => node.data?.onSelectTask?.(node.data?.task)}
          >
            {`node-${node.id}`}
          </button>
        ))}
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useNodesState: (initial: any[] = []) => {
      const [state, setState] = React.useState(initial)
      return [state, setState, vi.fn()]
    },
    useEdgesState: (initial: any[] = []) => {
      const [state, setState] = React.useState(initial)
      return [state, setState, vi.fn()]
    }
  }
})

describe('<WorkflowView /> loading behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const createTasks = () => {
    const now = new Date('2026-02-22T00:00:00.000Z')
    return [
      {
        id: 'wf-1',
        sessionId: 'session-1',
        type: 'workflow',
        status: 'running',
        input: 'workflow root',
        createdAt: now,
        metadata: {}
      },
      {
        id: 'task-1',
        sessionId: 'session-1',
        type: 'subtask',
        status: 'running',
        input: 'sub task',
        createdAt: now,
        metadata: {
          dependencies: [],
          logicalDependencies: []
        }
      }
    ]
  }

  it('does not repeatedly reload tasks after initial load', async () => {
    const tasks = createTasks()
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'workflow-observability:get') return { assignments: [] }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    render(<WorkflowView sessionId="session-1" />)

    const countTaskListCalls = () => invoke.mock.calls.filter(([channel]) => channel === 'task:list').length

    await waitFor(() => {
      expect(countTaskListCalls()).toBeGreaterThan(0)
    })

    await new Promise(resolve => setTimeout(resolve, 60))

    expect(countTaskListCalls()).toBe(1)
  })

  it('does not show global loading text when selecting a node', async () => {
    const tasks = createTasks()
    let taskListCallCount = 0

    const invoke = vi.fn((channel: string) => {
      if (channel === 'task:list') {
        taskListCallCount += 1
        return Promise.resolve(tasks)
      }
      if (channel === 'workflow-observability:get') return Promise.resolve({ assignments: [] })
      return Promise.resolve(null)
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    render(<WorkflowView sessionId="session-1" />)

    const nodeButton = await screen.findByRole('button', { name: 'node-task-1' })
    expect(taskListCallCount).toBe(1)

    const user = userEvent.setup()
    await user.click(nodeButton)

    await new Promise(resolve => setTimeout(resolve, 20))

    expect(taskListCallCount).toBe(1)
    expect(screen.queryByText('加载工作流...')).not.toBeInTheDocument()
  })

  it('keeps latest session selection when older request resolves later', async () => {
    const now = new Date('2026-02-22T00:00:00.000Z')
    const tasksA = [
      {
        id: 'wf-a',
        sessionId: 'session-1',
        type: 'workflow',
        status: 'running',
        input: 'workflow A',
        createdAt: now,
        metadata: {}
      },
      {
        id: 'task-a',
        sessionId: 'session-1',
        type: 'subtask',
        status: 'running',
        input: 'task A',
        createdAt: now,
        metadata: { dependencies: [], logicalDependencies: [] }
      }
    ]
    const tasksB = [
      {
        id: 'wf-b',
        sessionId: 'session-2',
        type: 'workflow',
        status: 'running',
        input: 'workflow B',
        createdAt: now,
        metadata: {}
      },
      {
        id: 'task-b',
        sessionId: 'session-2',
        type: 'subtask',
        status: 'running',
        input: 'task B',
        createdAt: now,
        metadata: { dependencies: [], logicalDependencies: [] }
      }
    ]

    let resolveSession1: ((value: unknown) => void) | null = null
    const session1Promise = new Promise(resolve => {
      resolveSession1 = resolve
    })

    const invoke = vi.fn((channel: string, sessionId?: string) => {
      if (channel === 'task:list') {
        if (sessionId === 'session-1') {
          return session1Promise as Promise<any>
        }
        if (sessionId === 'session-2') {
          return Promise.resolve(tasksB)
        }
      }
      if (channel === 'workflow-observability:get') return Promise.resolve({ assignments: [] })
      return Promise.resolve(null)
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    const view = render(<WorkflowView sessionId="session-1" />)
    view.rerender(<WorkflowView sessionId="session-2" />)

    expect(await screen.findByRole('button', { name: 'node-task-b' })).toBeInTheDocument()

    resolveSession1?.(tasksA)
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(screen.getByRole('button', { name: 'node-task-b' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'node-task-a' })).not.toBeInTheDocument()
  })

  it('does not render garbled wrapper fragments in workflow view', async () => {
    const now = new Date('2026-02-22T00:00:00.000Z')
    const tasks = [
      {
        id: 'wf-1',
        sessionId: 'session-1',
        type: 'workflow',
        status: 'running',
        input: 'workflow root',
        createdAt: now,
        metadata: {}
      },
      {
        id: 'task-1',
        sessionId: 'session-1',
        type: 'subtask',
        status: 'completed',
        input: 'sub task',
        output: [
          'Running validation (typecheck/build)',
          'assistant to=functions.bash',
          '{"command":"npm run build","timeout":600000}',
          'Validation passed.'
        ].join('\n'),
        createdAt: now,
        metadata: { dependencies: [], logicalDependencies: [] }
      }
    ]

    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task:list') return tasks
      if (channel === 'workflow-observability:get') return { assignments: [] }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    render(<WorkflowView sessionId="session-1" />)

    expect(await screen.findByRole('button', { name: 'node-task-1' })).toBeInTheDocument()
    expect(screen.queryByText('assistant to=functions.bash')).not.toBeInTheDocument()
    expect(screen.queryByText('{"command":"npm run build","timeout":600000}')).not.toBeInTheDocument()
  })

  it('shows error state and supports retry after load failure', async () => {
    const tasks = createTasks()
    let firstAttempt = true

    const invoke = vi.fn((channel: string) => {
      if (channel === 'task:list') {
        if (firstAttempt) {
          firstAttempt = false
          return Promise.reject(new Error('network down'))
        }
        return Promise.resolve(tasks)
      }
      if (channel === 'workflow-observability:get') return Promise.resolve({ assignments: [] })
      return Promise.resolve(null)
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn(() => () => {})
      }
    })

    render(<WorkflowView sessionId="session-1" />)

    expect(await screen.findByText('加载工作流失败')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByRole('button', { name: 'node-task-1' })).toBeInTheDocument()
  })
})

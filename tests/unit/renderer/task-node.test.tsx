import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { TaskNode } from '../../../src/renderer/src/components/workflow/TaskNode'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom'
  }
}))

describe('<TaskNode />', () => {
  it('renders model selection source and reason from workflow selection snapshot', () => {
    const now = new Date('2026-03-06T00:00:00.000Z')

    render(
      <TaskNode
        id="task-1"
        data={{
          task: {
            id: 'task-1',
            sessionId: 'session-1',
            type: 'subtask',
            status: 'completed',
            input: 'implement ui polish',
            assignedAgent: 'zhinv',
            assignedModel: 'gpt-4o-mini',
            createdAt: now,
            metadata: {
              workflowSelectionSnapshot: {
                modelSelectionSource: 'category-binding',
                modelSelectionReason: 'category-binding-hit',
                modelSelectionSummary: '命中类别绑定（织女 / zhinv），使用模型 openai-compatible/gpt-4o-mini。'
              }
            }
          }
        }}
        selected={false}
        dragging={false}
        zIndex={1}
        isConnectable={false}
        type="task"
        xPos={0}
        yPos={0}
      />
    )

    expect(screen.getByText('Source:')).toBeInTheDocument()
    expect(screen.getByText('类别绑定')).toBeInTheDocument()
    expect(screen.getByText('Reason:')).toBeInTheDocument()
    expect(screen.getByText('命中类别绑定')).toBeInTheDocument()
    expect(screen.getByText(/命中类别绑定（织女 \/ zhinv）/)).toBeInTheDocument()
  })
})

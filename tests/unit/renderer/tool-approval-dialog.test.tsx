import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ToolApprovalDialog } from '../../../src/renderer/src/components/tools/ToolApprovalDialog'

describe('ToolApprovalDialog', () => {
  it('renders request details and fires approve/reject actions', () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()

    render(
      <ToolApprovalDialog
        request={{
          id: 'req-1',
          sessionId: 'session-1',
          taskId: 'task-1',
          toolCallId: 'call-1',
          toolName: 'bash',
          requestedToolName: 'bash',
          resolvedToolName: 'bash',
          arguments: { command: 'npm test' },
          riskLevel: 'high',
          reason: 'Shell execution requires confirmation',
          status: 'pending_approval',
          requestedAt: '2026-03-08T00:00:00.000Z'
        }}
        onApprove={onApprove}
        onReject={onReject}
      />
    )

    expect(screen.getByText('工具执行审批')).toBeInTheDocument()
    expect(screen.getByText('bash')).toBeInTheDocument()
    expect(screen.getByText('Shell execution requires confirmation')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '批准并继续' }))
    fireEvent.click(screen.getByRole('button', { name: '拒绝并终止' }))

    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })
})


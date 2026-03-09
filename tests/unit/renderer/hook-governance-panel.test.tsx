import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HookGovernancePanel } from '../../../src/renderer/src/components/settings/HookGovernancePanel'

vi.mock('../../../src/renderer/src/components/settings/AuditLogViewer', () => ({
  AuditLogViewer: ({ defaultActionFilter }: { defaultActionFilter?: string }) => (
    <div data-testid="audit-log-viewer">{defaultActionFilter}</div>
  )
}))

describe('<HookGovernancePanel />', () => {
  it('renders governance metrics and wires interactions to callbacks', async () => {
    const onRefresh = vi.fn()
    const onReset = vi.fn()
    const onSave = vi.fn()
    const onDraftChange = vi.fn()
    const onResetContinuation = vi.fn()
    const onSaveContinuation = vi.fn()
    const onContinuationInputChange = vi.fn()
    const onContinuationInputBlur = vi.fn()

    render(
      <HookGovernancePanel
        governance={{
          initialized: true,
          stats: {
            total: 1,
            enabled: 1,
            disabled: 0,
            byEvent: { onToolStart: 1 },
            totalExecutions: 4,
            totalErrors: 1
          },
          hooks: [
            {
              id: 'hook-1',
              name: 'Hook One',
              event: 'onToolStart',
              description: 'Protect tool execution',
              enabled: true,
              priority: 2,
              source: 'builtin',
              scope: 'workspace',
              strategy: {
                timeoutMs: 2000,
                failureThreshold: 3,
                cooldownMs: 30000
              },
              runtime: {
                consecutiveFailures: 1,
                circuitState: 'closed',
                lastStatus: 'success',
                lastDurationMs: 220,
                lastExecutedAt: '2026-03-06T00:00:00.000Z'
              },
              audit: {
                executionCount: 4,
                errorCount: 1,
                lastAuditAt: '2026-03-06T00:00:00.000Z',
                lastStatus: 'success'
              }
            }
          ],
          recentExecutions: [
            {
              id: 'audit-1',
              timestamp: '2026-03-06T00:00:00.000Z',
              strategy: {
                hookId: 'hook-1',
                hookName: 'Hook One',
                event: 'onToolStart',
                priority: 2,
                enabled: true,
                source: 'builtin',
                scope: 'workspace',
                timeoutMs: 2000,
                failureThreshold: 3,
                cooldownMs: 30000
              },
              execution: {
                sessionId: 'session-1',
                workspaceDir: '/tmp/workspace',
                tool: 'bash',
                callId: 'call-1'
              },
              result: {
                success: true,
                duration: 220,
                status: 'success',
                returnValuePreview: 'ok'
              }
            }
          ]
        }}
        draft={{
          'hook-1': {
            enabled: true,
            priority: 2,
            timeoutMs: 2000,
            failureThreshold: 3,
            cooldownMs: 30000
          }
        }}
        loading={false}
        saving={false}
        dirty={true}
        onRefresh={onRefresh}
        onReset={onReset}
        onSave={onSave}
        onDraftChange={onDraftChange}
        continuationDraft={{
          countdownSeconds: 2,
          idleDedupWindowMs: 500,
          abortWindowMs: 3000
        }}
        continuationLoading={false}
        continuationSaving={false}
        continuationDirty={true}
        onResetContinuation={onResetContinuation}
        onSaveContinuation={onSaveContinuation}
        onContinuationInputChange={onContinuationInputChange}
        onContinuationInputBlur={onContinuationInputBlur}
      />
    )

    expect(screen.getByText('Hook 治理统计')).toBeInTheDocument()
    expect(screen.getByText('Hook 明细')).toBeInTheDocument()
    expect(screen.getByText('总 Hook')).toBeInTheDocument()
    expect(screen.getByText('Hook One')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '刷新统计' }))
    await user.click(screen.getByRole('button', { name: '保存 Hook 策略' }))
    await user.click(screen.getByRole('button', { name: '保存配置' }))
    await user.click(screen.getByRole('button', { name: '显示审计查询' }))

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    const countdownInput = screen.getByLabelText('倒计时（秒）')
    fireEvent.change(countdownInput, { target: { value: '5' } })
    fireEvent.blur(countdownInput)

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSaveContinuation).toHaveBeenCalledTimes(1)
    expect(onDraftChange).toHaveBeenCalledWith('hook-1', 'enabled', false)
    expect(onContinuationInputChange).toHaveBeenCalledWith('countdownSeconds', '5')
    expect(onContinuationInputBlur).toHaveBeenCalledWith('countdownSeconds')
    expect(screen.getByTestId('audit-log-viewer')).toHaveTextContent('hook:execution')
  })
})

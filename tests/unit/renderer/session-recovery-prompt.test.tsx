import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const selectSession = vi.fn()
const setCurrentSession = vi.fn()

vi.mock('../../../src/renderer/src/store/data.store', () => ({
  useDataStore: (selector: (state: any) => unknown) =>
    selector({
      selectSession,
      setCurrentSession
    })
}))

import { SessionRecoveryPrompt } from '../../../src/renderer/src/components/session/SessionRecoveryPrompt'

describe('<SessionRecoveryPrompt />', () => {
  it('executes crash recovery and sends resume prompt through message pipeline', async () => {
    const invoke = vi.fn(async (channel: string, payload?: unknown) => {
      if (channel === 'session-recovery:list') {
        return [
          {
            sessionId: 'session-1',
            status: 'crashed',
            checkpoint: {
              completedTasks: ['done-1'],
              inProgressTasks: ['run-1'],
              pendingTasks: ['pending-1'],
              checkpointAt: '2026-03-06T00:00:00.000Z'
            },
            context: {
              spaceId: 'space-1',
              workDir: '/tmp/workdir',
              recoverySource: 'crash-recovery',
              recoveryStage: 'detected',
              resumeReason: 'crash-detected',
              resumeAction: 'show-recovery-dialog',
              recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
            }
          }
        ]
      }
      if (channel === 'session-recovery:execute') {
        expect(payload).toBe('session-1')
        return { success: true }
      }
      if (channel === 'session-recovery:resume-prompt') {
        return 'resume session now'
      }
      if (channel === 'message:send') {
        return { success: true }
      }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: { invoke }
    })

    render(<SessionRecoveryPrompt />)

    await screen.findByText('Restore Interrupted Session?')
    expect(screen.getByText(/Crash recovery is available/i)).toBeInTheDocument()
    expect(screen.getByText('Unexpected shutdown detected')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Resume Session' }))

    await waitFor(() => {
      expect(selectSession).toHaveBeenCalledWith('space-1', 'session-1')
      expect(invoke).toHaveBeenCalledWith('session-recovery:execute', 'session-1')
      expect(invoke).toHaveBeenCalledWith('session-recovery:resume-prompt', 'session-1')
      expect(invoke).toHaveBeenCalledWith('message:send', {
        sessionId: 'session-1',
        content: 'resume session now',
        resumeContext: expect.objectContaining({
          recoverySource: 'crash-recovery',
          resumeReason: 'crash-detected'
        })
      })
    })
  })
})

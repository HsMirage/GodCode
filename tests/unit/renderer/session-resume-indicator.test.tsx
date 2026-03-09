import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SessionResumeIndicator } from '../../../src/renderer/src/components/session/SessionResumeIndicator'

describe('<SessionResumeIndicator />', () => {
  it('sends continuation prompt via message:send when user clicks resume', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task-continuation:get-status') {
        return {
          shouldContinue: true,
          incompleteTodos: [{ id: '1', content: 'pending', status: 'pending' }],
          continuationPrompt: 'continue now',
          totalTodos: 3,
          completedTodos: 1,
          recoveryContext: {
            recoverySource: 'manual-resume',
            recoveryStage: 'prompt-ready',
            resumeReason: 'pending-todos',
            resumeAction: 'send-resume-prompt',
            recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
          }
        }
      }
      if (channel === 'session-recovery:list') {
        return []
      }
      if (channel === 'message:send') {
        return { success: true }
      }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke
      }
    })

    render(<SessionResumeIndicator sessionId="session-1" />)

    await screen.findByText('1 items pending')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Resume Session' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('message:send', {
        sessionId: 'session-1',
        content: 'continue now',
        resumeContext: {
          recoverySource: 'manual-resume',
          recoveryStage: 'prompt-ready',
          resumeReason: 'pending-todos',
          resumeAction: 'send-resume-prompt',
          recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
        }
      })
    })
  })

  it('does not send message when shouldContinue is false', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task-continuation:get-status') {
        return {
          shouldContinue: false,
          incompleteTodos: [{ id: '1', content: 'pending', status: 'pending' }],
          continuationPrompt: 'should not send',
          totalTodos: 1,
          completedTodos: 0,
          recoveryContext: {
            recoverySource: 'manual-resume',
            recoveryStage: 'prompt-ready',
            resumeReason: 'pending-todos',
            resumeAction: 'send-resume-prompt',
            recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
          }
        }
      }
      if (channel === 'session-recovery:list') {
        return []
      }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke
      }
    })

    render(<SessionResumeIndicator sessionId="session-1" />)

    await screen.findByText('1 items pending')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Resume Session' }))

    expect(invoke).not.toHaveBeenCalledWith('message:send', expect.anything())
  })

  it('renders nothing when no pending continuation work exists', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task-continuation:get-status') {
        return {
          shouldContinue: false,
          incompleteTodos: [],
          totalTodos: 0,
          completedTodos: 0,
          recoveryContext: null
        }
      }
      if (channel === 'session-recovery:list') {
        return []
      }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke
      }
    })

    const { container } = render(<SessionResumeIndicator sessionId="session-1" />)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('task-continuation:get-status', 'session-1')
    })

    expect(screen.queryByRole('button', { name: 'Resume Session' })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders unified recovery labels', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task-continuation:get-status') {
        return {
          shouldContinue: true,
          incompleteTodos: [{ id: '1', content: 'pending', status: 'pending' }],
          continuationPrompt: 'continue now',
          totalTodos: 2,
          completedTodos: 1,
          recoveryContext: {
            recoverySource: 'manual-resume',
            recoveryStage: 'prompt-ready',
            resumeReason: 'pending-todos',
            resumeAction: 'send-resume-prompt',
            recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
          }
        }
      }
      if (channel === 'session-recovery:list') {
        return []
      }
      return null
    })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke
      }
    })

    render(<SessionResumeIndicator sessionId="session-1" />)

    await screen.findByText('Manual resume')
    expect(screen.getByText('Pending TODOs found')).toBeInTheDocument()
    expect(screen.getByText('Send resume prompt')).toBeInTheDocument()
  })
})

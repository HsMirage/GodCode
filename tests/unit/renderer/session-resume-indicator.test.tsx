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
          continuationPrompt: 'continue now'
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
        content: 'continue now'
      })
    })
  })

  it('does not send message when shouldContinue is false', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'task-continuation:get-status') {
        return {
          shouldContinue: false,
          incompleteTodos: [{ id: '1', content: 'pending', status: 'pending' }],
          continuationPrompt: 'should not send'
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
          incompleteTodos: []
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
})

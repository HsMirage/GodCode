import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MessageInput } from '../../../src/renderer/src/components/chat/MessageInput'
import { UI_TEXT } from '../../../src/renderer/src/constants/i18n'
import { useUIStore } from '../../../src/renderer/src/store/ui.store'

describe('<MessageInput />', () => {
  beforeEach(() => {
    localStorage.removeItem('godcode-ui-storage')
    useUIStore.setState({ slashCommandMru: [] })
  })

  it('restores selected agent after unmount/remount with the same resetKey', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()

    const firstMount = render(<MessageInput onSend={onSend} resetKey="session-1" />)

    await user.click(screen.getByTitle(UI_TEXT.agentSelector.currentAgentTitle('昊天')))
    await user.click(screen.getByRole('button', { name: /鲁班/i }))
    expect(screen.getByTitle(UI_TEXT.agentSelector.currentAgentTitle('鲁班'))).toBeInTheDocument()

    firstMount.unmount()

    render(<MessageInput onSend={onSend} resetKey="session-1" />)
    expect(screen.getByTitle(UI_TEXT.agentSelector.currentAgentTitle('鲁班'))).toBeInTheDocument()
  })

  it('records slash command usage in MRU after successful send', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()

    render(<MessageInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type your message...')
    await user.type(input, '/Review run diagnostics{enter}')

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1)
    })

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '/Review run diagnostics',
        skillCommand: {
          command: '/Review',
          input: 'run diagnostics',
          rawInput: '/Review run diagnostics'
        }
      }),
      'haotian'
    )
    expect(useUIStore.getState().slashCommandMru).toEqual(['/review'])
  })

  it('does not record slash command usage when send fails', async () => {
    const onSend = vi.fn().mockResolvedValue(false)
    const user = userEvent.setup()

    render(<MessageInput onSend={onSend} />)

    const input = screen.getByPlaceholderText('Type your message...')
    await user.type(input, '/review run diagnostics{enter}')

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1)
    })

    expect(useUIStore.getState().slashCommandMru).toEqual([])
  })
})

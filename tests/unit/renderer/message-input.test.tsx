import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MessageInput } from '../../../src/renderer/src/components/chat/MessageInput'

describe('<MessageInput />', () => {
  it('restores selected agent after unmount/remount with the same resetKey', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()

    const firstMount = render(<MessageInput onSend={onSend} resetKey="session-1" />)

    await user.click(screen.getByTitle('当前智能体: 昊天'))
    await user.click(screen.getByRole('button', { name: /鲁班/i }))
    expect(screen.getByTitle('当前智能体: 鲁班')).toBeInTheDocument()

    firstMount.unmount()

    render(<MessageInput onSend={onSend} resetKey="session-1" />)
    expect(screen.getByTitle('当前智能体: 鲁班')).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgentSelector } from '../../../src/renderer/src/components/chat/AgentSelector'

describe('<AgentSelector />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('opens downward when the viewport has insufficient space above', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 40,
      width: 120,
      height: 36,
      top: 40,
      right: 130,
      bottom: 76,
      left: 10,
      toJSON: () => ''
    } as DOMRect)

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900
    })

    render(<AgentSelector selectedAgent="haotian" onAgentChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '昊天' }))

    const presetTitle = await screen.findByText('选择运行预设')
    const menu = presetTitle.closest('div[class*="absolute"]')

    await waitFor(() => {
      expect(menu?.className).toContain('top-full')
    })
  })
})

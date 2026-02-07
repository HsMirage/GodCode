import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useDataStore } from '../../../src/renderer/src/store/data.store'
import { Sidebar } from '../../../src/renderer/src/components/layout/Sidebar'

describe('<Sidebar />', () => {
  it('renders spaces and shows sessions under expanded spaces', async () => {
    useDataStore.setState({
      spaces: [
        {
          id: 'sp_1',
          name: 'Space 1',
          workDir: 'C:\\sp1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'sp_2',
          name: 'Space 2',
          workDir: 'C:\\sp2',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      sessionsBySpaceId: {
        sp_1: [
          {
            id: 'ses_1',
            spaceId: 'sp_1',
            title: 'Chat A',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        sp_2: [
          {
            id: 'ses_2',
            spaceId: 'sp_2',
            title: 'Chat B',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      },
      currentSpaceId: 'sp_1',
      currentSessionId: 'ses_1'
    })

    render(<Sidebar />)

    expect(screen.getByText('Space 1')).toBeInTheDocument()
    expect(screen.getByText('Space 2')).toBeInTheDocument()

    // Current space auto-expands
    expect(await screen.findByText('Chat A')).toBeInTheDocument()
    expect(screen.queryByText('Chat B')).not.toBeInTheDocument()

    const user = userEvent.setup()
    const toggles = screen.getAllByLabelText(/Expand space|Collapse space/)
    await user.click(toggles[1])
    expect(await screen.findByText('Chat B')).toBeInTheDocument()
  })
})


import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/renderer/src/api', () => ({
  safeInvoke: vi.fn()
}))

import { safeInvoke } from '../../../src/renderer/src/api'
import { useDataStore } from '../../../src/renderer/src/store/data.store'

type Space = { id: string; name: string; workDir: string; createdAt: Date; updatedAt: Date }
type Session = {
  id: string
  spaceId: string
  title: string
  createdAt: Date
  updatedAt: Date
  status: 'active' | 'archived'
}

beforeEach(() => {
  vi.resetAllMocks()
  useDataStore.setState({
    spaces: [],
    sessionsBySpaceId: {},
    currentSpaceId: null,
    currentSessionId: null,
    isLoading: false,
    error: null
  })
})

describe('useDataStore', () => {
  it('fetchSpaces sets a default space and ensures a default session', async () => {
    const spaces: Space[] = [
      {
        id: 'sp_1',
        name: 'Repo',
        workDir: 'C:\\repo',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    const defaultSession: Session = {
      id: 'ses_1',
      spaceId: 'sp_1',
      title: 'New Chat',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    ;(safeInvoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (channel: string, ...args: unknown[]) => {
        if (channel === 'space:list') return spaces
        if (channel === 'session:list') {
          expect(args[0]).toBe('sp_1')
          return []
        }
        if (channel === 'session:get-or-create-default') {
          expect(args[0]).toEqual({ spaceId: 'sp_1' })
          return defaultSession
        }
        throw new Error(`Unexpected channel: ${channel}`)
      }
    )

    await useDataStore.getState().fetchSpaces()

    const state = useDataStore.getState()
    expect(state.currentSpaceId).toBe('sp_1')
    expect(state.currentSessionId).toBe('ses_1')
    expect(state.sessionsBySpaceId['sp_1']?.[0]?.id).toBe('ses_1')
  })

  it('bumpSessionActivity moves the session to the top', () => {
    const s1: Session = {
      id: 'ses_1',
      spaceId: 'sp_1',
      title: 'One',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(0)
    }
    const s2: Session = {
      id: 'ses_2',
      spaceId: 'sp_1',
      title: 'Two',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(0)
    }

    useDataStore.setState({
      sessionsBySpaceId: { sp_1: [s1, s2] }
    })

    useDataStore.getState().bumpSessionActivity('sp_1', 'ses_2')

    const list = useDataStore.getState().sessionsBySpaceId['sp_1']
    expect(list?.[0]?.id).toBe('ses_2')
  })
})


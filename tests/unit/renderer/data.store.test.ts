import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/renderer/src/api', () => ({
  safeInvoke: vi.fn(),
  sessionApi: {
    update: vi.fn()
  }
}))

import { safeInvoke, sessionApi } from '../../../src/renderer/src/api'
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
    selectedSessionIdBySpaceId: {},
    isLoading: false,
    error: null
  })
})

describe('useDataStore', () => {
  it('fetchSpaces sets a default space but does not auto-select a session', async () => {
    const spaces: Space[] = [
      {
        id: 'sp_1',
        name: 'Repo',
        workDir: 'C:\\repo',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    ;(safeInvoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (channel: string, ...args: unknown[]) => {
        if (channel === 'space:list') return spaces
        if (channel === 'session:list') {
          expect(args[0]).toBe('sp_1')
          return []
        }
        throw new Error(`Unexpected channel: ${channel}`)
      }
    )

    await useDataStore.getState().fetchSpaces()

    const state = useDataStore.getState()
    expect(state.currentSpaceId).toBe('sp_1')
    expect(state.currentSessionId).toBe(null)
    expect(state.sessionsBySpaceId['sp_1']).toEqual([])
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

  it('updateSessionTitle delegates to sessionApi.update and updates store state', async () => {
    const createdAt = new Date('2026-03-07T00:00:00.000Z')
    const updatedAt = new Date('2026-03-07T00:01:00.000Z')
    const original: Session = {
      id: 'ses_1',
      spaceId: 'sp_1',
      title: 'Before',
      status: 'active',
      createdAt,
      updatedAt: createdAt
    }
    const renamed: Session = {
      ...original,
      title: 'After',
      updatedAt
    }

    useDataStore.setState({
      sessionsBySpaceId: { sp_1: [original] }
    })

    ;(sessionApi.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(renamed)

    await useDataStore.getState().updateSessionTitle('sp_1', 'ses_1', 'After')

    expect(sessionApi.update).toHaveBeenCalledWith('ses_1', { title: 'After' })
    expect(useDataStore.getState().sessionsBySpaceId['sp_1']).toEqual([renamed])
    expect(useDataStore.getState().isLoading).toBe(false)
    expect(useDataStore.getState().error).toBe(null)
  })
})

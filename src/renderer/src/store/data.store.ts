import { create } from 'zustand'
import { safeInvoke } from '../api'
import type { Space, Session } from '../types/domain'

interface DataState {
  spaces: Space[]
  sessionsBySpaceId: Record<string, Session[]>
  currentSpaceId: string | null
  currentSessionId: string | null

  isLoading: boolean
  error: string | null

  fetchSpaces: () => Promise<void>
  fetchSessions: (spaceId: string) => Promise<void>
  setCurrentSpace: (spaceId: string) => void
  setCurrentSession: (sessionId: string) => void
  selectSession: (spaceId: string, sessionId: string) => Promise<void>
  createSpace: (name: string, workDir: string) => Promise<void>
  updateSpace: (spaceId: string, updates: { name?: string; workDir?: string }) => Promise<void>
  createSession: (spaceId: string, title?: string) => Promise<void>
  ensureDefaultSession: (spaceId: string) => Promise<void>
  bumpSessionActivity: (spaceId: string, sessionId: string) => void
}

export const useDataStore = create<DataState>((set, get) => ({
  spaces: [],
  sessionsBySpaceId: {},
  currentSpaceId: null,
  currentSessionId: null,
  isLoading: false,
  error: null,

  fetchSpaces: async () => {
    set({ isLoading: true, error: null })
    try {
      const spaces = await safeInvoke<Space[]>('space:list')
      set({ spaces, isLoading: false })

      const { currentSpaceId } = get()
      if (!currentSpaceId && spaces.length > 0) {
        set({ currentSpaceId: spaces[0].id, currentSessionId: null })
        await get().fetchSessions(spaces[0].id)
        await get().ensureDefaultSession(spaces[0].id)
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  fetchSessions: async (spaceId: string) => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await safeInvoke<Session[]>('session:list', spaceId)
      set(state => ({
        sessionsBySpaceId: { ...state.sessionsBySpaceId, [spaceId]: sessions },
        isLoading: false
      }))

      const { currentSpaceId, currentSessionId } = get()
      if (currentSpaceId === spaceId) {
        const stillValid = sessions.some(s => s.id === currentSessionId)
        if (!stillValid) {
          set({ currentSessionId: sessions[0]?.id ?? null })
        }
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  setCurrentSpace: (spaceId: string) => {
    set({ currentSpaceId: spaceId, currentSessionId: null })
    void (async () => {
      await get().fetchSessions(spaceId)
      await get().ensureDefaultSession(spaceId)
    })()
  },

  setCurrentSession: (sessionId: string) => {
    set({ currentSessionId: sessionId })
  },

  selectSession: async (spaceId: string, sessionId: string) => {
    set({ currentSpaceId: spaceId, currentSessionId: sessionId })
    const sessions = get().sessionsBySpaceId[spaceId]
    if (!sessions) {
      await get().fetchSessions(spaceId)
    }
  },

  createSpace: async (name: string, workDir: string) => {
    set({ isLoading: true, error: null })
    try {
      const newSpace = await safeInvoke<Space>('space:create', { name, workDir })
      set(state => {
        const nextSpaces = [newSpace, ...state.spaces.filter(s => s.id !== newSpace.id)]
        return {
          spaces: nextSpaces,
          currentSpaceId: newSpace.id,
          currentSessionId: null,
          isLoading: false,
          sessionsBySpaceId: { ...state.sessionsBySpaceId, [newSpace.id]: [] }
        }
      })
      await get().ensureDefaultSession(newSpace.id)
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  updateSpace: async (spaceId: string, updates: { name?: string; workDir?: string }) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await safeInvoke<Space>('space:update', spaceId, updates)
      set(state => ({
        spaces: state.spaces.map(s => (s.id === spaceId ? updated : s)),
        isLoading: false
      }))
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  createSession: async (spaceId: string, title?: string) => {
    set({ isLoading: true, error: null })
    try {
      const newSession = await safeInvoke<Session>('session:create', { spaceId, title })
      set(state => {
        const existing = state.sessionsBySpaceId[spaceId] ?? []
        return {
          sessionsBySpaceId: { ...state.sessionsBySpaceId, [spaceId]: [newSession, ...existing] },
          currentSpaceId: spaceId,
          currentSessionId: newSession.id,
          isLoading: false
        }
      })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  ensureDefaultSession: async (spaceId: string) => {
    const { currentSpaceId } = get()
    if (currentSpaceId !== spaceId) return

    if (!(spaceId in get().sessionsBySpaceId)) {
      await get().fetchSessions(spaceId)
    }

    const sessions = get().sessionsBySpaceId[spaceId] ?? []
    if (sessions.length > 0) {
      if (!get().currentSessionId) {
        set({ currentSessionId: sessions[0].id })
      }
      return
    }

    set({ isLoading: true, error: null })
    try {
      const session = await safeInvoke<Session>('session:get-or-create-default', { spaceId })
      set(state => ({
        sessionsBySpaceId: {
          ...state.sessionsBySpaceId,
          [spaceId]: [session, ...(state.sessionsBySpaceId[spaceId] ?? [])]
        },
        currentSessionId: session.id,
        isLoading: false
      }))
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  bumpSessionActivity: (spaceId: string, sessionId: string) => {
    set(state => {
      const list = state.sessionsBySpaceId[spaceId]
      if (!list || list.length === 0) return state

      const idx = list.findIndex(s => s.id === sessionId)
      if (idx < 0) return state

      const now = new Date()
      const updated = { ...list[idx], updatedAt: now } as Session
      const next = [updated, ...list.slice(0, idx), ...list.slice(idx + 1)]
      return { sessionsBySpaceId: { ...state.sessionsBySpaceId, [spaceId]: next } }
    })
  }
}))

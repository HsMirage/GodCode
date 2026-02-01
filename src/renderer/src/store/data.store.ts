import { create } from 'zustand'
import type { Space, Session } from '../types/domain'

interface DataState {
  spaces: Space[]
  sessions: Session[]
  currentSpaceId: string | null
  currentSessionId: string | null

  isLoading: boolean
  error: string | null

  fetchSpaces: () => Promise<void>
  fetchSessions: (spaceId: string) => Promise<void>
  setCurrentSpace: (spaceId: string) => void
  setCurrentSession: (sessionId: string) => void
  createSpace: (name: string, workDir: string) => Promise<void>
  createSession: (spaceId: string, title?: string) => Promise<void>
}

export const useDataStore = create<DataState>((set, get) => ({
  spaces: [],
  sessions: [],
  currentSpaceId: null,
  currentSessionId: null,
  isLoading: false,
  error: null,

  fetchSpaces: async () => {
    set({ isLoading: true, error: null })
    try {
      const spaces = await (window as any).codeall.invoke('space:list')
      set({ spaces, isLoading: false })

      const { currentSpaceId } = get()
      if (!currentSpaceId && spaces.length > 0) {
        set({ currentSpaceId: spaces[0].id })
        get().fetchSessions(spaces[0].id)
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  fetchSessions: async (spaceId: string) => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await (window as any).codeall.invoke('session:list', spaceId)
      set({ sessions, isLoading: false })

      const { currentSessionId } = get()
      if (!currentSessionId && sessions.length > 0) {
        set({ currentSessionId: sessions[0].id })
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  setCurrentSpace: (spaceId: string) => {
    set({ currentSpaceId: spaceId })
    get().fetchSessions(spaceId)
  },

  setCurrentSession: (sessionId: string) => {
    set({ currentSessionId: sessionId })
  },

  createSpace: async (name: string, workDir: string) => {
    set({ isLoading: true, error: null })
    try {
      const newSpace = await (window as any).codeall.invoke('space:create', { name, workDir })
      set(state => ({
        spaces: [...state.spaces, newSpace],
        currentSpaceId: newSpace.id,
        isLoading: false
      }))
      set({ sessions: [] })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  createSession: async (spaceId: string, title?: string) => {
    set({ isLoading: true, error: null })
    try {
      const newSession = await (window as any).codeall.invoke('session:create', { spaceId, title })
      set(state => ({
        sessions: [newSession, ...state.sessions],
        currentSessionId: newSession.id,
        isLoading: false
      }))
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  }
}))

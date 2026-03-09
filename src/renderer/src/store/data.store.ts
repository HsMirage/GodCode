import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeInvoke, sessionApi } from '../api'
import type { Space, Session } from '../types/domain'

interface DataState {
  spaces: Space[]
  sessionsBySpaceId: Record<string, Session[]>
  currentSpaceId: string | null
  currentSessionId: string | null
  /**
   * Persist per-space last selected session.
   * Keeps chat disabled until user explicitly selects/creates a session.
   */
  selectedSessionIdBySpaceId: Record<string, string | null>

  isLoading: boolean
  error: string | null

  fetchSpaces: () => Promise<void>
  fetchSessions: (spaceId: string) => Promise<void>
  setCurrentSpace: (spaceId: string) => void
  setCurrentSession: (sessionId: string) => void
  selectSession: (spaceId: string, sessionId: string) => Promise<void>
  createSpace: (name: string, workDir: string) => Promise<Space | null>
  updateSpace: (spaceId: string, updates: { name?: string; workDir?: string }) => Promise<void>
  deleteSpace: (spaceId: string) => Promise<void>
  createSession: (spaceId: string, title?: string) => Promise<void>
  updateSessionTitle: (spaceId: string, sessionId: string, title: string) => Promise<void>
  deleteSession: (spaceId: string, sessionId: string) => Promise<void>
  bumpSessionActivity: (spaceId: string, sessionId: string) => void
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      spaces: [],
      sessionsBySpaceId: {},
      currentSpaceId: null,
      currentSessionId: null,
      selectedSessionIdBySpaceId: {},
      isLoading: false,
      error: null,

      fetchSpaces: async () => {
        set({ isLoading: true, error: null })
        try {
          const spaces = await safeInvoke<Space[]>('space:list')

          // Defensive: avoid wiping a non-empty UI state if backend temporarily returns empty.
          // This is especially helpful in dev when DB may be starting up.
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info('[DataStore] fetchSpaces', {
              incoming: spaces.length,
              existing: get().spaces.length
            })
          }

          set({ spaces, isLoading: false })

          const { currentSpaceId, currentSessionId, selectedSessionIdBySpaceId } = get()
          const currentStillValid =
            !!currentSpaceId && spaces.some(space => space.id === currentSpaceId)

          const nextSpaceId = currentStillValid ? currentSpaceId : (spaces[0]?.id ?? null)

          // Migration: older versions only persisted currentSessionId. Treat it as the last selection
          // for the current space when no per-space mapping exists yet.
          if (
            nextSpaceId &&
            selectedSessionIdBySpaceId[nextSpaceId] === undefined &&
            currentSpaceId === nextSpaceId &&
            currentSessionId
          ) {
            set(state => ({
              selectedSessionIdBySpaceId: {
                ...state.selectedSessionIdBySpaceId,
                [nextSpaceId]: currentSessionId
              }
            }))
          }

          const mapped = nextSpaceId ? (get().selectedSessionIdBySpaceId[nextSpaceId] ?? null) : null
          const nextSessionId = mapped

          if (nextSpaceId !== currentSpaceId || nextSessionId !== get().currentSessionId) {
            set({ currentSpaceId: nextSpaceId, currentSessionId: nextSessionId })
          }

          if (nextSpaceId) {
            await get().fetchSessions(nextSpaceId)
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

          const { currentSpaceId, currentSessionId, selectedSessionIdBySpaceId } = get()
          if (currentSpaceId !== spaceId) return

          const desired = selectedSessionIdBySpaceId[spaceId] ?? currentSessionId
          const stillValid = !!desired && sessions.some(s => s.id === desired)

          if (stillValid) {
            if (desired !== currentSessionId) set({ currentSessionId: desired })
            return
          }

          // Do NOT auto-select another session. Keep chat disabled until user selects one.
          set(state => ({
            currentSessionId: null,
            selectedSessionIdBySpaceId: { ...state.selectedSessionIdBySpaceId, [spaceId]: null }
          }))
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      setCurrentSpace: (spaceId: string) => {
        const nextSessionId = get().selectedSessionIdBySpaceId[spaceId] ?? null
        set({ currentSpaceId: spaceId, currentSessionId: nextSessionId })
        void get().fetchSessions(spaceId)
      },

      setCurrentSession: (sessionId: string) => {
        set({ currentSessionId: sessionId })
      },

      selectSession: async (spaceId: string, sessionId: string) => {
        set(state => ({
          currentSpaceId: spaceId,
          currentSessionId: sessionId,
          selectedSessionIdBySpaceId: { ...state.selectedSessionIdBySpaceId, [spaceId]: sessionId }
        }))

        const sessions = get().sessionsBySpaceId[spaceId]
        if (!sessions) {
          await get().fetchSessions(spaceId)
        }
      },

      createSpace: async (name: string, workDir: string) => {
        set({ isLoading: true, error: null })
        try {
          const newSpace = await safeInvoke<Space>('space:create', { name, workDir })
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info('[DataStore] createSpace ok', { id: (newSpace as any)?.id, name })
          }

          // UX: selecting a folder should immediately create the space and a default chat.
          // If session creation fails, we still keep the space and let the user create a chat manually.
          let defaultSession: Session | null = null
          try {
            defaultSession = await safeInvoke<Session>('session:create', {
              spaceId: newSpace.id,
              title: '新对话 1'
            })
          } catch (err) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn('[DataStore] default session create failed', err)
            }
          }

          set(state => {
            const nextSpaces = [newSpace, ...state.spaces.filter(s => s.id !== newSpace.id)]
            const nextSessions = defaultSession ? [defaultSession] : []
            const nextSessionId = defaultSession?.id ?? null
            return {
              spaces: nextSpaces,
              currentSpaceId: newSpace.id,
              currentSessionId: nextSessionId,
              isLoading: false,
              sessionsBySpaceId: { ...state.sessionsBySpaceId, [newSpace.id]: nextSessions },
              selectedSessionIdBySpaceId: {
                ...state.selectedSessionIdBySpaceId,
                [newSpace.id]: nextSessionId
              }
            }
          })

          return newSpace
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
          return null
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

      deleteSpace: async (spaceId: string) => {
        set({ isLoading: true, error: null })
        try {
          if (!window.codeall) throw new Error('Preload API not available')
          const result = (await window.codeall.invoke('space:delete', spaceId)) as
            | { success: boolean; error?: string }
            | boolean

          const ok =
            typeof result === 'boolean' ? result : !!(result && typeof result === 'object' && result.success)
          if (!ok) {
            const msg = typeof result === 'object' ? result.error : undefined
            throw new Error(msg || 'Failed to delete space')
          }

          set(state => {
            const nextSpaces = state.spaces.filter(s => s.id !== spaceId)
            const nextSessionsBySpaceId = { ...state.sessionsBySpaceId }
            delete nextSessionsBySpaceId[spaceId]

            const nextSelected = { ...state.selectedSessionIdBySpaceId }
            delete nextSelected[spaceId]

            const deletingCurrent = state.currentSpaceId === spaceId
            const nextSpaceId = deletingCurrent ? (nextSpaces[0]?.id ?? null) : state.currentSpaceId
            const nextSessionId = nextSpaceId ? (nextSelected[nextSpaceId] ?? null) : null

            return {
              spaces: nextSpaces,
              sessionsBySpaceId: nextSessionsBySpaceId,
              selectedSessionIdBySpaceId: nextSelected,
              currentSpaceId: nextSpaceId,
              currentSessionId: deletingCurrent ? nextSessionId : state.currentSessionId,
              isLoading: false
            }
          })
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
              selectedSessionIdBySpaceId: { ...state.selectedSessionIdBySpaceId, [spaceId]: newSession.id },
              isLoading: false
            }
          })
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      updateSessionTitle: async (spaceId: string, sessionId: string, title: string) => {
        set({ isLoading: true, error: null })
        try {
          const updated = await sessionApi.update(sessionId, { title })

          set(state => {
            const list = state.sessionsBySpaceId[spaceId] ?? []
            const nextList = list.map(s => (s.id === sessionId ? updated : s))
            return {
              sessionsBySpaceId: { ...state.sessionsBySpaceId, [spaceId]: nextList },
              isLoading: false
            }
          })
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      deleteSession: async (spaceId: string, sessionId: string) => {
        set({ isLoading: true, error: null })
        try {
          if (!window.codeall) throw new Error('Preload API not available')
          await window.codeall.invoke('session:delete', sessionId)

          set(state => {
            const list = state.sessionsBySpaceId[spaceId] ?? []
            const nextList = list.filter(s => s.id !== sessionId)

            const nextSelected = { ...state.selectedSessionIdBySpaceId }
            const isCurrent = state.currentSessionId === sessionId
            if (isCurrent) nextSelected[spaceId] = null

            return {
              sessionsBySpaceId: { ...state.sessionsBySpaceId, [spaceId]: nextList },
              currentSessionId: isCurrent ? null : state.currentSessionId,
              selectedSessionIdBySpaceId: nextSelected,
              isLoading: false
            }
          })
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
    }),
    {
      name: 'codeall:data-store',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        spaces: state.spaces,
        currentSpaceId: state.currentSpaceId,
        currentSessionId: state.currentSessionId,
        selectedSessionIdBySpaceId: state.selectedSessionIdBySpaceId
      })
    }
  )
)

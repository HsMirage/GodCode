import { create } from 'zustand'
import type { Message, Session } from '@renderer/types/domain'

interface SessionState {
  currentSession: Session | null
  messages: Message[]
  setCurrentSession: (session: Session | null) => void
  addMessage: (message: Message) => void
  clearMessages: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  messages: [],
  setCurrentSession: (session) => set({ currentSession: session }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] })
}))

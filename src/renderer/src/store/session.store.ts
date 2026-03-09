import { create } from 'zustand'
import type { Session } from '@renderer/types/domain'
import type { Message } from '../components/chat/MessageCard'

interface SessionState {
  currentSession: Session | null
  messagesBySessionId: Record<string, Message[]>
  setCurrentSession: (session: Session | null) => void
  setMessages: (sessionId: string, messages: Message[]) => void
  addMessage: (sessionId: string, message: Message) => void
  clearMessages: (sessionId?: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  messagesBySessionId: {},

  setCurrentSession: (session) => set({ currentSession: session }),

  setMessages: (sessionId, messages) =>
    set((state) => ({
      messagesBySessionId: {
        ...state.messagesBySessionId,
        [sessionId]: messages
      }
    })),

  addMessage: (sessionId, message) =>
    set((state) => ({
      messagesBySessionId: {
        ...state.messagesBySessionId,
        [sessionId]: [...(state.messagesBySessionId[sessionId] ?? []), message]
      }
    })),

  clearMessages: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { messagesBySessionId: {} }
      }

      if (!(sessionId in state.messagesBySessionId)) {
        return state
      }

      const nextMessages = { ...state.messagesBySessionId }
      delete nextMessages[sessionId]

      return { messagesBySessionId: nextMessages }
    })
}))

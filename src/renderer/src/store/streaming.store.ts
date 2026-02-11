import { create } from 'zustand'

/**
 * Tool call information during streaming
 */
export interface StreamingToolCall {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  arguments?: Record<string, unknown>
  result?: unknown
  startedAt?: number
  completedAt?: number
}

/**
 * Streaming state for a specific session
 */
export interface SessionStreamState {
  /** Whether currently streaming */
  isStreaming: boolean
  /** Accumulated content */
  content: string
  /** Current event type */
  eventType: 'content' | 'tool_start' | 'tool_end' | 'error' | 'done' | null
  /** Active tool calls */
  toolCalls: StreamingToolCall[]
  /** Error information if any */
  error: { message: string; code?: string } | null
  /** Usage statistics */
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
}

interface StreamingState {
  /** Map of sessionId -> streaming state */
  sessions: Map<string, SessionStreamState>

  /** Start streaming for a session */
  startStreaming: (sessionId: string) => void

  /** Append content chunk */
  appendContent: (sessionId: string, content: string) => void

  /** Handle tool start event */
  toolStart: (sessionId: string, toolCall: { id: string; name: string }) => void

  /** Handle tool end event */
  toolEnd: (
    sessionId: string,
    toolCall: { id: string; name: string; arguments?: Record<string, unknown>; result?: unknown }
  ) => void

  /** Handle error event */
  setError: (sessionId: string, error: { message: string; code?: string }) => void

  /** Handle stream completion */
  completeStreaming: (sessionId: string) => void

  /** Set usage statistics */
  setUsage: (
    sessionId: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ) => void

  /** Reset streaming state for a session */
  resetStreaming: (sessionId: string) => void

  /** Get streaming state for a session */
  getSessionState: (sessionId: string) => SessionStreamState | undefined
}

const createDefaultSessionState = (): SessionStreamState => ({
  isStreaming: false,
  content: '',
  eventType: null,
  toolCalls: [],
  error: null,
  usage: null
})

export const useStreamingStore = create<StreamingState>((set, get) => ({
  sessions: new Map(),

  startStreaming: (sessionId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      newSessions.set(sessionId, {
        ...createDefaultSessionState(),
        isStreaming: true
      })
      return { sessions: newSessions }
    })
  },

  appendContent: (sessionId: string, content: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const current = newSessions.get(sessionId) || createDefaultSessionState()
      newSessions.set(sessionId, {
        ...current,
        content: current.content + content,
        eventType: 'content'
      })
      return { sessions: newSessions }
    })
  },

  toolStart: (sessionId: string, toolCall: { id: string; name: string }) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const current = newSessions.get(sessionId) || createDefaultSessionState()
      const newToolCalls = [
        ...current.toolCalls,
        {
          id: toolCall.id,
          name: toolCall.name,
          status: 'running' as const,
          startedAt: Date.now()
        }
      ]
      newSessions.set(sessionId, {
        ...current,
        eventType: 'tool_start',
        toolCalls: newToolCalls
      })
      return { sessions: newSessions }
    })
  },

  toolEnd: (
    sessionId: string,
    toolCall: { id: string; name: string; arguments?: Record<string, unknown>; result?: unknown }
  ) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const current = newSessions.get(sessionId) || createDefaultSessionState()
      const newToolCalls = current.toolCalls.map((tc) =>
        tc.id === toolCall.id
          ? {
              ...tc,
              status: 'completed' as const,
              arguments: toolCall.arguments,
              result: toolCall.result,
              completedAt: Date.now()
            }
          : tc
      )
      newSessions.set(sessionId, {
        ...current,
        eventType: 'tool_end',
        toolCalls: newToolCalls
      })
      return { sessions: newSessions }
    })
  },

  setError: (sessionId: string, error: { message: string; code?: string }) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const current = newSessions.get(sessionId) || createDefaultSessionState()
      newSessions.set(sessionId, {
        ...current,
        eventType: 'error',
        error,
        isStreaming: false
      })
      return { sessions: newSessions }
    })
  },

  completeStreaming: (sessionId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const current = newSessions.get(sessionId) || createDefaultSessionState()
      newSessions.set(sessionId, {
        ...current,
        eventType: 'done',
        isStreaming: false
      })
      return { sessions: newSessions }
    })
  },

  setUsage: (
    sessionId: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const current = newSessions.get(sessionId) || createDefaultSessionState()
      newSessions.set(sessionId, {
        ...current,
        usage
      })
      return { sessions: newSessions }
    })
  },

  resetStreaming: (sessionId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      newSessions.delete(sessionId)
      return { sessions: newSessions }
    })
  },

  getSessionState: (sessionId: string) => {
    return get().sessions.get(sessionId)
  }
}))

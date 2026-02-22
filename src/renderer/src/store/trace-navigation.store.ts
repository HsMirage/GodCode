import { create } from 'zustand'

export type TraceNavigationSource = 'workflow-node' | 'agent-log' | 'artifact' | 'run-log'
export type TraceNavigationView = 'workflow' | 'agent'

export interface TraceNavigationTarget {
  source: TraceNavigationSource
  taskId?: string
  runId?: string
  artifactId?: string
  agentId?: string
  preferredView?: TraceNavigationView
  requestedAt: number
}

interface TraceNavigationState {
  target: TraceNavigationTarget | null
  requestNavigate: (target: Omit<TraceNavigationTarget, 'requestedAt'>) => void
  clearNavigate: () => void
}

export const useTraceNavigationStore = create<TraceNavigationState>((set, get) => ({
  target: null,
  requestNavigate: target => {
    const previous = get().target?.requestedAt ?? 0
    const now = Date.now()
    const requestedAt = now > previous ? now : previous + 1

    set({
      target: {
        ...target,
        requestedAt
      }
    })
  },
  clearNavigate: () => set({ target: null })
}))

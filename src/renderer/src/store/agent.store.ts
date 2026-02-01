import { create } from 'zustand'

export interface Agent {
  id: string
  name: string
  role: string
  status: 'idle' | 'working' | 'error' | 'completed'
  currentTask?: string
  tasksCompleted: number
  tokensUsed: number
  model?: string
}

export interface WorkLogEntry {
  id: string
  agentId: string
  type: 'thinking' | 'action' | 'result' | 'error' | 'tool_call' | 'tool_result' | 'streaming'
  message: string
  timestamp: Date
  metadata?: Record<string, any>
}

interface AgentState {
  agents: Agent[]
  selectedAgentId: string | null
  workLogs: Record<string, WorkLogEntry[]>

  // Actions
  setAgents: (agents: Agent[]) => void
  selectAgent: (id: string | null) => void
  addWorkLog: (agentId: string, entry: Omit<WorkLogEntry, 'id' | 'timestamp'>) => void
  updateAgentStatus: (agentId: string, status: Agent['status'], currentTask?: string) => void

  // Async actions (to be called by components)
  fetchAgents: () => Promise<void>
}

// Mock initial agents for development/demo
const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'Sisyphus-Junior-Visual',
    role: 'Visual Engineer',
    status: 'working',
    currentTask: 'Implement Phase 6.4 UI',
    tasksCompleted: 12,
    tokensUsed: 45000,
    model: 'claude-3-5-sonnet'
  },
  {
    id: 'agent-2',
    name: 'Architect-Prime',
    role: 'System Architect',
    status: 'idle',
    tasksCompleted: 45,
    tokensUsed: 120000,
    model: 'gpt-4-turbo'
  },
  {
    id: 'agent-3',
    name: 'Librarian-Bot',
    role: 'Researcher',
    status: 'idle',
    tasksCompleted: 8,
    tokensUsed: 15000,
    model: 'gemini-pro'
  }
]

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  workLogs: {},

  setAgents: agents => set({ agents }),

  selectAgent: id => set({ selectedAgentId: id }),

  addWorkLog: (agentId, entry) =>
    set(state => {
      const newEntry: WorkLogEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date()
      }

      const agentLogs = state.workLogs[agentId] || []

      return {
        workLogs: {
          ...state.workLogs,
          [agentId]: [...agentLogs, newEntry]
        }
      }
    }),

  updateAgentStatus: (agentId, status, currentTask) =>
    set(state => ({
      agents: state.agents.map(a =>
        a.id === agentId
          ? { ...a, status, currentTask: currentTask !== undefined ? currentTask : a.currentTask }
          : a
      )
    })),

  fetchAgents: async () => {
    // TODO: Replace with actual IPC call
    // const agents = await window.codeall.invoke('agent:list')
    // set({ agents })

    // For now, use mock data if empty
    if (get().agents.length === 0) {
      set({ agents: MOCK_AGENTS })
    }
  }
}))

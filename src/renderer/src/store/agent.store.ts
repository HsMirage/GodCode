import { create } from 'zustand'
import { AGENT_DEFINITIONS } from '@shared/agent-definitions'
import type { Task } from '../types/domain'

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
  fetchAgents: (sessionId?: string | null) => Promise<void>
}

const taskStatusLogDedupe = new Set<string>()

function createBaseAgents(): Agent[] {
  return AGENT_DEFINITIONS.map(def => ({
    id: def.code,
    name: def.name,
    role: def.description,
    status: 'idle' as const,
    currentTask: undefined,
    tasksCompleted: 0,
    tokensUsed: 0,
    model: undefined
  }))
}

function toAgentCode(task: Task): string | undefined {
  if (task.assignedAgent?.trim()) {
    return task.assignedAgent
  }

  const metadataAgent = task.metadata?.subagent_type
  if (typeof metadataAgent === 'string' && metadataAgent.trim()) {
    return metadataAgent
  }

  return undefined
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: createBaseAgents(),
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

  fetchAgents: async (sessionId?: string | null) => {
    const baseAgents = createBaseAgents()

    if (!window.codeall || !sessionId) {
      set(state => ({
        agents: baseAgents,
        selectedAgentId:
          state.selectedAgentId && baseAgents.some(agent => agent.id === state.selectedAgentId)
            ? state.selectedAgentId
            : baseAgents[0]?.id ?? null
      }))
      return
    }

    const tasks = (await window.codeall.invoke('task:list', sessionId)) as Task[]
    const tasksByAgent = new Map<string, Task[]>()

    for (const task of tasks) {
      const agentCode = toAgentCode(task)
      if (!agentCode) continue
      const current = tasksByAgent.get(agentCode) || []
      current.push(task)
      tasksByAgent.set(agentCode, current)
    }

    const nextAgents = baseAgents.map(agent => {
      const agentTasks = (tasksByAgent.get(agent.id) || []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      const running = agentTasks.filter(task => task.status === 'running')
      const failed = agentTasks.filter(task => task.status === 'failed')
      const completed = agentTasks.filter(task => task.status === 'completed')
      const latest = agentTasks[0]

      const status: Agent['status'] =
        running.length > 0 ? 'working' : failed.length > 0 ? 'error' : completed.length > 0 ? 'completed' : 'idle'

      return {
        ...agent,
        status,
        currentTask: running[0]?.input || latest?.input,
        tasksCompleted: completed.length,
        model: latest?.assignedModel
      }
    })

    const nextWorkLogs = { ...get().workLogs }
    for (const task of tasks) {
      const agentCode = toAgentCode(task)
      if (!agentCode) continue
      const logKey = `${agentCode}:${task.id}:${task.status}`
      if (taskStatusLogDedupe.has(logKey)) continue

      taskStatusLogDedupe.add(logKey)
      const message =
        task.status === 'running'
          ? `开始执行: ${task.input}`
          : task.status === 'completed'
            ? `完成任务: ${task.input}`
            : task.status === 'failed'
              ? `任务失败: ${task.input}`
              : `任务状态更新: ${task.input}`
      const type: WorkLogEntry['type'] =
        task.status === 'running'
          ? 'action'
          : task.status === 'completed'
            ? 'result'
            : task.status === 'failed'
              ? 'error'
              : 'thinking'

      const currentLogs = nextWorkLogs[agentCode] || []
      currentLogs.push({
        id: crypto.randomUUID(),
        agentId: agentCode,
        type,
        message,
        timestamp: new Date(task.completedAt || task.startedAt || task.createdAt),
        metadata: {
          taskId: task.id,
          status: task.status
        }
      })
      nextWorkLogs[agentCode] = currentLogs
    }

    set(state => {
      const activeAgent = nextAgents.find(agent => agent.status === 'working')
      const fallbackAgent = nextAgents.find(agent => agent.tasksCompleted > 0) || nextAgents[0]
      const selectedAgentId =
        state.selectedAgentId && nextAgents.some(agent => agent.id === state.selectedAgentId)
          ? state.selectedAgentId
          : (activeAgent?.id ?? fallbackAgent?.id ?? null)

      return {
        agents: nextAgents,
        workLogs: nextWorkLogs,
        selectedAgentId
      }
    })
  }
}))

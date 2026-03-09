import { create } from 'zustand'
import { AGENT_DEFINITIONS, CATEGORY_DEFINITIONS } from '@shared/agent-definitions'
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

export const AGENT_STORE_DEDUPE_MAX_SIZE = 1000
const AGENT_STORE_DEDUPE_TRIM_SIZE = AGENT_STORE_DEDUPE_MAX_SIZE / 2

const taskStatusLogDedupe = new Set<string>()
const orchestratorCheckpointLogDedupe = new Set<string>()

function trimDedupeEntries(entries: Set<string>) {
  if (entries.size <= AGENT_STORE_DEDUPE_MAX_SIZE) {
    return
  }

  const entriesToRemove = entries.size - AGENT_STORE_DEDUPE_TRIM_SIZE
  let removedCount = 0

  for (const entry of entries) {
    entries.delete(entry)
    removedCount += 1

    if (removedCount >= entriesToRemove) {
      break
    }
  }
}

function registerDedupeEntry(entries: Set<string>, key: string) {
  if (entries.has(key)) {
    return false
  }

  entries.add(key)
  trimDedupeEntries(entries)
  return true
}

export function resetAgentStoreDedupeState() {
  taskStatusLogDedupe.clear()
  orchestratorCheckpointLogDedupe.clear()
}

export function getAgentStoreDedupeState() {
  return {
    maxSize: AGENT_STORE_DEDUPE_MAX_SIZE,
    trimSize: AGENT_STORE_DEDUPE_TRIM_SIZE,
    taskStatusSize: taskStatusLogDedupe.size,
    orchestratorCheckpointSize: orchestratorCheckpointLogDedupe.size
  }
}

interface OrchestratorCheckpointMeta {
  timestamp?: string
  phase?: string
  status?: string
  reason?: string
  persistedTaskId?: string
}

function readOrchestratorCheckpoints(task: Task): OrchestratorCheckpointMeta[] {
  const raw = task.metadata?.orchestratorCheckpoints
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
      phase: typeof item.phase === 'string' ? item.phase : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
      persistedTaskId: typeof item.persistedTaskId === 'string' ? item.persistedTaskId : undefined
    }))
}

function createBaseAgents(): Agent[] {
  const coreAgents: Agent[] = AGENT_DEFINITIONS.map(def => ({
    id: def.code,
    name: def.name,
    role: def.description,
    status: 'idle' as const,
    currentTask: undefined,
    tasksCompleted: 0,
    tokensUsed: 0,
    model: undefined
  }))

  const categoryAgents: Agent[] = CATEGORY_DEFINITIONS.map(def => ({
    id: def.code,
    name: def.name,
    role: `类别执行通道 · ${def.description}`,
    status: 'idle' as const,
    currentTask: undefined,
    tasksCompleted: 0,
    tokensUsed: 0,
    model: undefined
  }))

  return [...coreAgents, ...categoryAgents]
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
      const running = agentTasks.filter(
        task => task.status === 'running' || task.status === 'pending_approval'
      )
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
      if (!registerDedupeEntry(taskStatusLogDedupe, logKey)) continue
      const message =
        task.status === 'running' || task.status === 'pending_approval'
          ? `开始执行: ${task.input}`
          : task.status === 'completed'
            ? `完成任务: ${task.input}`
            : task.status === 'failed'
              ? `任务失败: ${task.input}`
              : `任务状态更新: ${task.input}`
      const type: WorkLogEntry['type'] =
        task.status === 'running' || task.status === 'pending_approval'
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

    for (const task of tasks) {
      const checkpoints = readOrchestratorCheckpoints(task)
      if (checkpoints.length === 0) continue

      const orchestratorAgentValue = task.metadata?.orchestratorAgent
      const orchestratorAgent =
        typeof orchestratorAgentValue === 'string' && orchestratorAgentValue.trim()
          ? orchestratorAgentValue.trim()
          : 'haotian'

      for (const [index, checkpoint] of checkpoints.entries()) {
        const stableId = checkpoint.persistedTaskId || checkpoint.timestamp || `${task.id}-${index}`
        const phase = checkpoint.phase || 'unknown'
        const status = checkpoint.status || 'unknown'
        const logKey = `${orchestratorAgent}:checkpoint:${task.id}:${stableId}:${phase}:${status}`
        if (!registerDedupeEntry(orchestratorCheckpointLogDedupe, logKey)) continue

        const message =
          status === 'halt'
            ? `主编排检查点 [${phase}] 阻断流程: ${checkpoint.reason || '未提供原因'}`
            : status === 'fallback'
              ? `主编排检查点 [${phase}] 回退到 DAG 调度`
              : `主编排检查点 [${phase}] 允许继续`

        const type: WorkLogEntry['type'] =
          status === 'halt' ? 'error' : status === 'fallback' ? 'thinking' : 'result'
        const logTimestamp = checkpoint.timestamp ? new Date(checkpoint.timestamp) : new Date(task.createdAt)

        const currentLogs = nextWorkLogs[orchestratorAgent] || []
        currentLogs.push({
          id: crypto.randomUUID(),
          agentId: orchestratorAgent,
          type,
          message,
          timestamp: logTimestamp,
          metadata: {
            workflowTaskId: task.id,
            checkpointPhase: phase,
            checkpointStatus: status,
            persistedTaskId: checkpoint.persistedTaskId
          }
        })
        nextWorkLogs[orchestratorAgent] = currentLogs
      }
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

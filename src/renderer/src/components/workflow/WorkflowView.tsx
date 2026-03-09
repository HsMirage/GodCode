import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Task } from '@renderer/types/domain'
import { useTraceNavigationStore } from '../../store/trace-navigation.store'
import { TaskNode, type TaskNodeData } from './TaskNode'
import { EdgeWithLabel } from './EdgeWithLabel'

const nodeTypes = {
  task: TaskNode
}

const edgeTypes = {
  default: EdgeWithLabel
}

interface WorkflowViewProps {
  sessionId: string
}

interface CheckpointTimelineItem {
  key: string
  phase: string
  status: string
  timestamp?: string
  reason?: string
}

interface WorkflowRuntimeLookup {
  byTaskId: Record<string, { runId?: string; agentId?: string }>
  byRunId: Record<string, { taskId: string; agentId?: string }>
}

interface WorkflowNodeSelectionSnapshot {
  modelSource?: string
  modelSelectionReason?: string
  modelSelectionSummary?: string
  fallbackReason?: string
  fallbackAttemptSummary?: Array<{ summary?: string }>
  fallbackTrail?: string[]
}

type WorkflowLoadState = 'idle' | 'loading' | 'ready' | 'error'

export function WorkflowView({ sessionId }: WorkflowViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TaskNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loadState, setLoadState] = useState<WorkflowLoadState>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checkpoints, setCheckpoints] = useState<CheckpointTimelineItem[]>([])
  const [runtimeLookup, setRuntimeLookup] = useState<WorkflowRuntimeLookup>({
    byTaskId: {},
    byRunId: {}
  })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const runtimeLookupRef = useRef<WorkflowRuntimeLookup>({ byTaskId: {}, byRunId: {} })
  const selectedTaskIdRef = useRef<string | null>(null)
  const latestRequestIdRef = useRef(0)
  const navigationTarget = useTraceNavigationStore(state => state.target)
  const requestNavigate = useTraceNavigationStore(state => state.requestNavigate)
  const navigationTargetRef = useRef(navigationTarget)

  const handleTaskSelect = useCallback(
    (task: Task) => {
      setSelectedTaskId(task.id)
      selectedTaskIdRef.current = task.id
      const runtime = runtimeLookupRef.current.byTaskId[task.id]
      requestNavigate({
        source: 'workflow-node',
        taskId: task.id,
        runId: runtime?.runId,
        agentId: runtime?.agentId || task.assignedAgent || undefined,
        preferredView: 'agent'
      })
    },
    [requestNavigate]
  )

  const convertTasksToFlow = useCallback(
    (tasks: Task[], highlightedTaskId: string | null) => {
      const flowNodes: Node<TaskNodeData>[] = []
      const flowEdges: Edge[] = []
      const taskMap = new Map<string, Task>()
      const logicalTaskMap = new Map<string, string>()

      tasks.forEach(task => {
        taskMap.set(task.id, task)
        const logicalTaskId = task.metadata?.logicalTaskId
        if (typeof logicalTaskId === 'string' && logicalTaskId.trim()) {
          logicalTaskMap.set(logicalTaskId, task.id)
        }
      })

      const resolveDependencyId = (depId: string): string | null => {
        if (taskMap.has(depId)) return depId
        if (logicalTaskMap.has(depId)) return logicalTaskMap.get(depId) || null
        return null
      }

      const taskLevels = new Map<string, number>()
      const calculateLevel = (task: Task, visited = new Set<string>()): number => {
        if (taskLevels.has(task.id)) return taskLevels.get(task.id)!
        if (visited.has(task.id)) return 0

        visited.add(task.id)
        const rawDependencies = [
          ...((task.metadata?.dependencies as string[]) || []).filter(Boolean),
          ...((task.metadata?.logicalDependencies as string[]) || []).filter(Boolean)
        ]
        const dependencies = rawDependencies
          .map(depId => resolveDependencyId(depId))
          .filter((depId): depId is string => Boolean(depId))
        const maxDepLevel = dependencies.reduce((max, depId) => {
          const depTask = taskMap.get(depId)
          return depTask ? Math.max(max, calculateLevel(depTask, visited)) : max
        }, 0)

        const level = maxDepLevel + 1
        taskLevels.set(task.id, level)
        return level
      }

      tasks.forEach(task => calculateLevel(task))

      const levelGroups = new Map<number, Task[]>()
      tasks.forEach(task => {
        const level = taskLevels.get(task.id) || 0
        if (!levelGroups.has(level)) {
          levelGroups.set(level, [])
        }
        levelGroups.get(level)!.push(task)
      })

      tasks.forEach((task, _index) => {
        const level = taskLevels.get(task.id) || 0
        const levelTasks = levelGroups.get(level) || []
        const positionInLevel = levelTasks.indexOf(task)

        const duration =
          task.startedAt && task.completedAt
            ? (new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000
            : undefined

        flowNodes.push({
          id: task.id,
          type: 'task',
          position: {
            x: positionInLevel * 320 + 50,
            y: level * 200 + 50
          },
          data: {
            task,
            duration,
            highlighted: highlightedTaskId === task.id,
            onSelectTask: handleTaskSelect
          }
        })

        const rawDependencies = [
          ...((task.metadata?.dependencies as string[]) || []).filter(Boolean),
          ...((task.metadata?.logicalDependencies as string[]) || []).filter(Boolean)
        ]
        const dependencies = rawDependencies
          .map(depId => resolveDependencyId(depId))
          .filter((depId): depId is string => Boolean(depId))
        dependencies.forEach(depId => {
          if (taskMap.has(depId)) {
            flowEdges.push({
              id: `${depId}-${task.id}`,
              source: depId,
              target: task.id,
              type: 'default'
            })
          }
        })
      })

      return { nodes: flowNodes, edges: flowEdges }
    },
    [handleTaskSelect]
  )

  const reloadTasks = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!window.godcode) return

      const requestId = ++latestRequestIdRef.current
      if (options?.showLoading) {
        setLoadState('loading')
        setLoadError(null)
      }

      try {
        const tasks = (await window.godcode.invoke('task:list', sessionId)) as Task[]
        if (requestId !== latestRequestIdRef.current) {
          return
        }

        let nextRuntimeLookup: WorkflowRuntimeLookup = { byTaskId: {}, byRunId: {} }
        const workflowTask = tasks.find(task => task.type === 'workflow')
        if (workflowTask) {
          const snapshot = (await window.godcode.invoke(
            'workflow-observability:get',
            workflowTask.id
          )) as {
            workflowId?: string
            continuationSnapshot?: { status?: string }
            assignments?: Array<{
              persistedTaskId?: string
              runId?: string
              assignedAgent?: string
              modelSource?: string
              modelSelectionReason?: string
              modelSelectionSummary?: string
              fallbackReason?: string
              fallbackAttemptSummary?: Array<{ summary?: string }>
              fallbackTrail?: string[]
            }>
          } | null

          const snapshotWorkflowId =
            typeof snapshot?.workflowId === 'string' && snapshot.workflowId.trim().length > 0
              ? snapshot.workflowId
              : undefined
          const safeSnapshot =
            snapshotWorkflowId && snapshotWorkflowId !== workflowTask.id ? null : snapshot

          if (requestId !== latestRequestIdRef.current) {
            return
          }

          const byTaskId: Record<string, { runId?: string; agentId?: string }> = {}
          const byRunId: Record<string, { taskId: string; agentId?: string }> = {}
          const selectionByTaskId: Record<string, WorkflowNodeSelectionSnapshot> = {}

          const assignments = Array.isArray(safeSnapshot?.assignments)
            ? safeSnapshot.assignments
            : []
          for (const assignment of assignments) {
            const taskId =
              typeof assignment?.persistedTaskId === 'string' &&
              assignment.persistedTaskId.trim().length > 0
                ? assignment.persistedTaskId
                : null
            if (!taskId) continue

            const runId =
              typeof assignment.runId === 'string' && assignment.runId.trim().length > 0
                ? assignment.runId
                : undefined
            const agentId =
              typeof assignment.assignedAgent === 'string' &&
              assignment.assignedAgent.trim().length > 0
                ? assignment.assignedAgent
                : undefined

            byTaskId[taskId] = { runId, agentId }
            if (runId) {
              byRunId[runId] = { taskId, agentId }
            }

            selectionByTaskId[taskId] = {
              modelSource:
                typeof assignment?.modelSource === 'string' ? assignment.modelSource : undefined,
              modelSelectionReason:
                typeof assignment?.modelSelectionReason === 'string'
                  ? assignment.modelSelectionReason
                  : undefined,
              modelSelectionSummary:
                typeof assignment?.modelSelectionSummary === 'string'
                  ? assignment.modelSelectionSummary
                  : undefined,
              fallbackReason:
                typeof assignment?.fallbackReason === 'string'
                  ? assignment.fallbackReason
                  : undefined,
              fallbackAttemptSummary: Array.isArray(assignment?.fallbackAttemptSummary)
                ? assignment.fallbackAttemptSummary
                : undefined,
              fallbackTrail: Array.isArray(assignment?.fallbackTrail)
                ? assignment.fallbackTrail
                : undefined
            }
          }

          nextRuntimeLookup = { byTaskId, byRunId }
          runtimeLookupRef.current = nextRuntimeLookup
          setRuntimeLookup(nextRuntimeLookup)

          const enrichedTasks = tasks.map(task => {
            const selection = selectionByTaskId[task.id]
            if (!selection) {
              return task
            }

            return {
              ...task,
              metadata: {
                ...(task.metadata || {}),
                workflowSelectionSnapshot: selection
              }
            }
          })

          const currentNavigationTarget = navigationTargetRef.current
          const highlightedTaskId =
            selectedTaskIdRef.current ||
            currentNavigationTarget?.taskId ||
            (currentNavigationTarget?.runId
              ? nextRuntimeLookup.byRunId[currentNavigationTarget.runId]?.taskId
              : undefined) ||
            null

          const checkpointTimeline = tasks
            .filter(task => task.type === 'workflow')
            .flatMap(task => {
              const raw = task.metadata?.orchestratorCheckpoints
              if (!Array.isArray(raw)) {
                return []
              }
              return raw
                .filter(
                  (item): item is Record<string, unknown> =>
                    Boolean(item) && typeof item === 'object'
                )
                .map((item, index) => ({
                  key: `${task.id}-${String(item.persistedTaskId || item.timestamp || index)}`,
                  phase: typeof item.phase === 'string' ? item.phase : 'unknown',
                  status: typeof item.status === 'string' ? item.status : 'unknown',
                  timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
                  reason: typeof item.reason === 'string' ? item.reason : undefined
                }))
            })
            .sort(
              (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
            )

          const { nodes: flowNodes, edges: flowEdges } = convertTasksToFlow(
            enrichedTasks,
            highlightedTaskId
          )

          if (requestId !== latestRequestIdRef.current) {
            return
          }

          setNodes(flowNodes)
          setEdges(flowEdges)
          setCheckpoints(checkpointTimeline)
          setLoadState('ready')
          setLoadError(null)
          return
        }

        runtimeLookupRef.current = nextRuntimeLookup
        setRuntimeLookup(nextRuntimeLookup)

        const checkpointTimeline = tasks
          .filter(task => task.type === 'workflow')
          .flatMap(task => {
            const raw = task.metadata?.orchestratorCheckpoints
            if (!Array.isArray(raw)) {
              return []
            }
            return raw
              .filter(
                (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
              )
              .map((item, index) => ({
                key: `${task.id}-${String(item.persistedTaskId || item.timestamp || index)}`,
                phase: typeof item.phase === 'string' ? item.phase : 'unknown',
                status: typeof item.status === 'string' ? item.status : 'unknown',
                timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
                reason: typeof item.reason === 'string' ? item.reason : undefined
              }))
          })
          .sort(
            (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
          )

        const currentNavigationTarget = navigationTargetRef.current
        const highlightedTaskId =
          selectedTaskIdRef.current ||
          currentNavigationTarget?.taskId ||
          (currentNavigationTarget?.runId
            ? nextRuntimeLookup.byRunId[currentNavigationTarget.runId]?.taskId
            : undefined) ||
          null

        const { nodes: flowNodes, edges: flowEdges } = convertTasksToFlow(tasks, highlightedTaskId)

        if (requestId !== latestRequestIdRef.current) {
          return
        }

        setNodes(flowNodes)
        setEdges(flowEdges)
        setCheckpoints(checkpointTimeline)
        setLoadState('ready')
        setLoadError(null)
      } catch (error) {
        if (requestId !== latestRequestIdRef.current) {
          return
        }
        console.error('Failed to reload workflow tasks:', error)
        setLoadState('error')
        setLoadError(error instanceof Error ? error.message : '加载工作流失败')
      }
    },
    [sessionId, convertTasksToFlow, setNodes, setEdges]
  )

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId
  }, [selectedTaskId])

  useEffect(() => {
    navigationTargetRef.current = navigationTarget
  }, [navigationTarget])

  useEffect(() => {
    if (!window.godcode) {
      console.warn('[WorkflowView] window.godcode not available')
      setLoadState('ready')
      setLoadError(null)
      return
    }

    void reloadTasks({ showLoading: true })
  }, [reloadTasks])

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.godcode) {
      return
    }

    const handleStatusChange = (event: { taskId: string; status: Task['status'] }) => {
      setNodes(nds => {
        const nodeExists = nds.some(n => n.id === event.taskId)

        if (!nodeExists) {
          // New task detected - re-fetch all tasks to get the complete graph
          void reloadTasks({ showLoading: false })
          return nds
        }

        return nds.map(node => {
          if (node.id === event.taskId) {
            const task = node.data.task
            return {
              ...node,
              data: {
                ...node.data,
                task: {
                  ...task,
                  status: event.status
                }
              }
            }
          }
          return node
        })
      })
    }

    const removeListener = window.godcode.on('task:status-changed', handleStatusChange)
    return () => {
      removeListener()
    }
  }, [setNodes, reloadTasks])

  useEffect(() => {
    const targetTaskId = navigationTarget?.taskId
    if (!targetTaskId) {
      return
    }
    setSelectedTaskId(targetTaskId)
  }, [navigationTarget?.taskId])

  useEffect(() => {
    const targetRunId = navigationTarget?.runId
    if (!targetRunId) {
      return
    }

    const mapped = runtimeLookup.byRunId[targetRunId]
    if (!mapped?.taskId) {
      return
    }

    setSelectedTaskId(mapped.taskId)
  }, [navigationTarget?.runId, runtimeLookup.byRunId])

  if (loadState === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-rose-300">加载工作流失败</p>
          {loadError && <p className="mt-2 text-xs text-slate-400">{loadError}</p>}
          <button
            type="button"
            onClick={() => {
              void reloadTasks({ showLoading: true })
            }}
            className="mt-3 rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">当前会话暂无工作流任务</p>
          <p className="mt-2 text-sm text-slate-500">使用 Workforce 模式创建任务后将显示流程图</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full rounded-2xl border border-slate-800/70 bg-slate-950/70 backdrop-blur">
      {loadState === 'loading' && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
          正在加载新工作流…
        </div>
      )}
      {checkpoints.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-md rounded-xl border border-slate-700/70 bg-slate-900/90 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur">
          <p className="font-medium text-slate-100">Orchestrator Checkpoints</p>
          <div className="mt-2 space-y-1 text-slate-300">
            {checkpoints.slice(-6).map(item => (
              <p key={item.key}>
                [{item.phase}] {item.status}
                {item.reason ? ` - ${item.reason}` : ''}
              </p>
            ))}
          </div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background className="bg-slate-950" gap={16} size={1} color="#1e293b" />
        <Controls className="rounded-lg border border-slate-800/70 bg-slate-900/90 backdrop-blur [&_button]:border-slate-700 [&_button]:bg-slate-800/50 [&_button]:text-slate-300 [&_button:hover]:bg-slate-700/50" />
        <MiniMap
          className="rounded-lg border border-slate-800/70 bg-slate-900/90 backdrop-blur"
          nodeColor={node => {
            const task = (node.data as TaskNodeData).task
            const colors = {
              pending: '#475569',
              running: '#0ea5e9',
              pending_approval: '#8b5cf6',
              completed: '#10b981',
              failed: '#f43f5e',
              cancelled: '#f59e0b'
            }
            return colors[task.status]
          }}
        />
      </ReactFlow>
    </div>
  )
}

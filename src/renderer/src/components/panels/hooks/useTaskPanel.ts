import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '@renderer/types/domain'
import { buildTaskReadinessDashboardView } from '@shared/task-readiness-dashboard'
import { artifactApi, workflowApi } from '../../../api'
import { useToolApprovals } from '../../../hooks/useToolApprovals'
import { useTaskPanelDetail } from '../../../hooks/useTaskPanelDetail'
import { useTaskPanelNavigation } from '../../../hooks/useTaskPanelNavigation'
import { canvasLifecycle } from '../../../services/canvas-lifecycle'
import { useAgentStore } from '../../../store/agent.store'
import { useDataStore } from '../../../store/data.store'
import {
  buildLiveTaskReadinessDashboardSnapshot,
  mergeTaskReadinessDashboardHistory,
  persistTaskReadinessDashboardHistory,
  readTaskReadinessDashboardHistory
} from '../task-readiness-dashboard-history'
import {
  buildWorkflowStuckDiagnosticSummary,
  buildTaskDiagnosticsFromObservability,
  type TaskDiagnosticSummary
} from '../task-panel-diagnostics'
import {
  createRafEventBuffer,
  createThrottledOutputFetcher,
  createThrottledTaskReloader
} from '../task-panel-performance'
import {
  DEFAULT_SESSION_DIAGNOSTIC_SUMMARY,
  type BackgroundTaskInfo,
  type BackgroundTaskOutputMeta,
  type BackgroundTaskOutputState,
  type BackgroundOutputChunk,
  type TabType,
  type TaskBindingSnapshot,
  type TaskFilterStatus,
  type TaskSortMode,
  type WorkflowObservabilityTaskPanelSnapshot
} from '../task-panel-shared'
import { resolveTaskBindingSnapshot } from '../task-panel-shared'

interface DiffViewerState {
  artifactId: string
  filePath: string
}

function mapBackgroundTask(task: BackgroundTaskInfo): BackgroundTaskInfo {
  const metadataInput =
    typeof task.metadata?.input === 'string' ? String(task.metadata.input) : undefined
  const metadataDescription =
    typeof task.metadata?.description === 'string' ? String(task.metadata.description) : undefined

  return {
    ...task,
    input: metadataInput || metadataDescription || task.description || task.command
  }
}

export function useTaskPanel() {
  const { currentSessionId } = useDataStore()
  const { workLogs, fetchAgents } = useAgentStore()
  const { requests: toolApprovalRequests } = useToolApprovals(currentSessionId)

  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('tasks')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskFilterStatus>('all')
  const [taskSortMode, setTaskSortMode] = useState<TaskSortMode>('newest')
  const [completedTaskLimit, setCompletedTaskLimit] = useState(20)
  const [diffViewerState, setDiffViewerState] = useState<DiffViewerState | null>(null)
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskInfo[]>([])
  const [backgroundLoading, setBackgroundLoading] = useState(true)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const [outputByTaskId, setOutputByTaskId] = useState<Record<string, BackgroundTaskOutputState>>(
    {}
  )
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
  const [bindingSnapshots, setBindingSnapshots] = useState<Record<string, TaskBindingSnapshot>>({})
  const [workflowObservability, setWorkflowObservability] =
    useState<WorkflowObservabilityTaskPanelSnapshot | null>(null)
  const [taskDiagnosticsByTaskId, setTaskDiagnosticsByTaskId] = useState<
    Record<string, TaskDiagnosticSummary>
  >({})
  const [sessionDiagnosticSummary, setSessionDiagnosticSummary] = useState(
    DEFAULT_SESSION_DIAGNOSTIC_SUMMARY
  )
  const [taskReadinessHistory, setTaskReadinessHistory] = useState(() =>
    readTaskReadinessDashboardHistory()
  )

  const outputByTaskIdRef = useRef<Record<string, BackgroundTaskOutputState>>({})
  const latestBackgroundTasksRef = useRef<BackgroundTaskInfo[]>([])
  const { highlightedTaskId, handleTaskLinkage } = useTaskPanelNavigation()

  const {
    taskDetailState,
    setTaskDetailState,
    taskDetailTab,
    setTaskDetailTab,
    diagnosticCopyState,
    resetDiagnosticCopyState,
    taskDetailDiagnostic,
    openTaskDetail,
    openTaskOutput,
    copyDiagnosticPackage
  } = useTaskPanelDetail({
    workLogs,
    taskDiagnosticsByTaskId
  })

  const loadTasks = useCallback(async () => {
    if (!currentSessionId) {
      return
    }

    try {
      const taskList = (await workflowApi.taskList(currentSessionId)) as Task[]
      const ordered = [...taskList].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setTasks(ordered)
      setTaskError(null)

      const workflowTask = ordered.find(task => task.type === 'workflow')
      if (workflowTask?.id) {
        try {
          const observability = (await workflowApi.observabilityGet(
            workflowTask.id
          )) as WorkflowObservabilityTaskPanelSnapshot
          setWorkflowObservability(observability)

          const nextSnapshots: Record<string, TaskBindingSnapshot> = {}
          for (const assignment of observability.assignments || []) {
            if (!assignment.persistedTaskId) continue
            nextSnapshots[assignment.persistedTaskId] = {
              modelSource: assignment.modelSource,
              modelSelectionSource: assignment.modelSource,
              modelSelectionReason: assignment.modelSelectionReason,
              modelSelectionSummary: assignment.modelSelectionSummary,
              fallbackReason: assignment.fallbackReason,
              fallbackAttemptSummary: assignment.fallbackAttemptSummary,
              fallbackTrail: assignment.fallbackTrail,
              concurrencyKey: assignment.concurrencyKey,
              workflowId: assignment.workflowId
            }
          }

          setBindingSnapshots(nextSnapshots)

          const diagnostics = buildTaskDiagnosticsFromObservability(ordered, observability)
          setTaskDiagnosticsByTaskId(diagnostics.byTaskId)
          setSessionDiagnosticSummary(diagnostics.summary)
        } catch (error) {
          console.error('Failed to load workflow observability snapshots:', error)
          setWorkflowObservability(null)
          setBindingSnapshots({})
          const diagnostics = buildTaskDiagnosticsFromObservability(ordered, null)
          setTaskDiagnosticsByTaskId(diagnostics.byTaskId)
          setSessionDiagnosticSummary(diagnostics.summary)
        }
      } else {
        setWorkflowObservability(null)
        setBindingSnapshots({})
        const diagnostics = buildTaskDiagnosticsFromObservability(ordered, null)
        setTaskDiagnosticsByTaskId(diagnostics.byTaskId)
        setSessionDiagnosticSummary(diagnostics.summary)
      }
    } catch (error) {
      console.error('Failed to load tasks:', error)
      setTaskError(error instanceof Error ? error.message : String(error))
      setTasks([])
      setBindingSnapshots({})
      setTaskDiagnosticsByTaskId({})
      setSessionDiagnosticSummary(DEFAULT_SESSION_DIAGNOSTIC_SUMMARY)
    } finally {
      setLoading(false)
    }
  }, [currentSessionId])

  const loadBackgroundTasks = useCallback(async () => {
    if (!currentSessionId) {
      return
    }

    try {
      const taskResult = (await workflowApi.backgroundTaskList({
        sessionId: currentSessionId
      })) as {
        success: boolean
        data?: BackgroundTaskInfo[]
        error?: string
      }

      if (!taskResult.success) {
        throw new Error(taskResult.error || 'Failed to load background tasks')
      }

      const ordered = [...(taskResult.data || [])]
        .map(mapBackgroundTask)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setBackgroundTasks(ordered)
      setBackgroundError(null)

      const runningIds = new Set(
        ordered
          .filter(task => task.status === 'running' || task.status === 'pending')
          .map(task => task.id)
      )
      const currentKeys = Object.keys(outputByTaskIdRef.current)
      const missingRunningIds = Array.from(runningIds).filter(id => !currentKeys.includes(id))
      if (missingRunningIds.length > 0) {
        setExpandedTaskIds(prev => {
          const next = { ...prev }
          for (const id of missingRunningIds) {
            next[id] = true
          }
          return next
        })
      }
    } catch (error) {
      console.error('Failed to load background tasks:', error)
      setBackgroundError(error instanceof Error ? error.message : String(error))
      setBackgroundTasks([])
    } finally {
      setBackgroundLoading(false)
    }
  }, [currentSessionId])

  const fetchBackgroundOutput = useCallback(async (taskId: string) => {
    const current = outputByTaskIdRef.current[taskId]
    const afterIndex = current?.nextIndex ?? 0

    try {
      const result = (await workflowApi.backgroundTaskGetOutput({
        taskId,
        afterIndex
      })) as {
        success: boolean
        data?: {
          chunks: BackgroundOutputChunk[]
          nextIndex: number
          outputMeta: BackgroundTaskOutputMeta
        }
        error?: string
      }

      if (!result.success || !result.data) {
        return
      }

      const hasChunkDelta = !(
        result.data.chunks.length === 0 && result.data.nextIndex === afterIndex
      )
      const shouldUpdateMeta = Boolean(result.data.outputMeta)
      if (!hasChunkDelta && !shouldUpdateMeta) {
        return
      }

      setOutputByTaskId(prev => {
        const existing = prev[taskId] || { chunks: [], nextIndex: 0, outputMeta: null }
        const nextChunks = existing.chunks.concat(result.data?.chunks || [])
        const cap = 600
        const next = {
          ...prev,
          [taskId]: {
            chunks:
              nextChunks.length > cap ? nextChunks.slice(nextChunks.length - cap) : nextChunks,
            nextIndex: result.data?.nextIndex ?? existing.nextIndex,
            outputMeta: result.data?.outputMeta ?? existing.outputMeta
          }
        }
        outputByTaskIdRef.current = next
        return next
      })
    } catch (error) {
      console.error('Failed to fetch background output:', error)
    }
  }, [])

  const throttledReloadTasks = useMemo(
    () => createThrottledTaskReloader(() => void loadTasks(), 180),
    [loadTasks]
  )

  const batchedTaskStatusEvent = useMemo(
    () =>
      createRafEventBuffer(() => {
        throttledReloadTasks()
      }),
    [throttledReloadTasks]
  )

  const scheduleBackgroundOutputFetch = useMemo(
    () => createThrottledOutputFetcher((taskId: string) => void fetchBackgroundOutput(taskId)),
    [fetchBackgroundOutput]
  )

  const refreshTasks = useCallback(() => {
    setLoading(true)
    void loadTasks()
  }, [loadTasks])

  const refreshBackgroundTasks = useCallback(() => {
    setBackgroundLoading(true)
    void loadBackgroundTasks()
  }, [loadBackgroundTasks])

  const reloadActiveTab = useCallback(() => {
    if (activeTab === 'tasks') {
      refreshTasks()
      return
    }

    if (activeTab === 'background') {
      refreshBackgroundTasks()
    }
  }, [activeTab, refreshBackgroundTasks, refreshTasks])

  const handleCancelBackgroundTask = useCallback(async (taskId: string) => {
    try {
      await workflowApi.backgroundTaskCancel({ taskId })
    } catch (error) {
      console.error('Failed to cancel background task:', error)
    }
  }, [])

  const toggleTaskExpanded = useCallback((taskId: string) => {
    setExpandedTaskIds(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }))
  }, [])

  const resetTaskFilters = useCallback(() => {
    setTaskSearch('')
    setTaskStatusFilter('all')
    setTaskSortMode('newest')
    setCompletedTaskLimit(20)
  }, [])

  useEffect(() => {
    if (currentSessionId) {
      setLoading(true)
      setBackgroundLoading(true)
      setTaskError(null)
      setBackgroundError(null)
      void loadTasks()
      void loadBackgroundTasks()
      void fetchAgents(currentSessionId)
      return
    }

    setTasks([])
    setTaskError(null)
    setBackgroundTasks([])
    setBackgroundError(null)
    setBindingSnapshots({})
    setWorkflowObservability(null)
    setTaskDiagnosticsByTaskId({})
    setSessionDiagnosticSummary(DEFAULT_SESSION_DIAGNOSTIC_SUMMARY)
    setTaskDetailState(null)
    setLoading(false)
    setBackgroundLoading(false)
    setOutputByTaskId({})
    outputByTaskIdRef.current = {}
    setExpandedTaskIds({})
  }, [currentSessionId, fetchAgents, loadBackgroundTasks, loadTasks, setTaskDetailState])

  useEffect(() => {
    const removeListener = workflowApi.onTaskStatusChanged(() => {
      batchedTaskStatusEvent.schedule()
      if (currentSessionId) {
        void fetchAgents(currentSessionId)
      }
    })

    return () => {
      removeListener()
    }
  }, [batchedTaskStatusEvent, currentSessionId, fetchAgents])

  useEffect(() => {
    const onStarted = workflowApi.onBackgroundTaskStarted(payload => {
      const task = payload.task as BackgroundTaskInfo
      if (task.metadata?.sessionId !== currentSessionId) {
        return
      }

      const normalized = mapBackgroundTask(task)
      setBackgroundTasks(prev => {
        const exists = prev.some(item => item.id === normalized.id)
        const next = exists
          ? prev.map(item => (item.id === normalized.id ? normalized : item))
          : [normalized, ...prev]
        return next.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      })
      setExpandedTaskIds(prev => ({ ...prev, [normalized.id]: true }))
    })

    const onOutput = workflowApi.onBackgroundTaskOutput(payload => {
      const taskId = payload.taskId as string
      const stream = payload.stream as 'stdout' | 'stderr'
      const data = payload.data as string
      const timestamp = payload.timestamp as string

      const backgroundTask = latestBackgroundTasksRef.current.find(item => item.id === taskId)
      if (!backgroundTask || backgroundTask.metadata?.sessionId !== currentSessionId) {
        return
      }

      setOutputByTaskId(prev => {
        const existing = prev[taskId] || { chunks: [], nextIndex: 0, outputMeta: null }
        const nextChunks = existing.chunks.concat([{ stream, data, timestamp }])
        const cap = 600
        const next = {
          ...prev,
          [taskId]: {
            chunks:
              nextChunks.length > cap ? nextChunks.slice(nextChunks.length - cap) : nextChunks,
            nextIndex: existing.nextIndex,
            outputMeta: existing.outputMeta
          }
        }
        outputByTaskIdRef.current = next
        return next
      })
    })

    const onCompleted = workflowApi.onBackgroundTaskCompleted(payload => {
      const task = payload.task as BackgroundTaskInfo
      const normalized = mapBackgroundTask(task)
      setBackgroundTasks(prev => prev.map(item => (item.id === normalized.id ? normalized : item)))
      scheduleBackgroundOutputFetch(normalized.id)
    })

    const onCancelled = workflowApi.onBackgroundTaskCancelled(payload => {
      const task = payload.task as BackgroundTaskInfo
      const normalized = mapBackgroundTask(task)
      setBackgroundTasks(prev => prev.map(item => (item.id === normalized.id ? normalized : item)))
      scheduleBackgroundOutputFetch(normalized.id)
    })

    return () => {
      onStarted()
      onOutput()
      onCompleted()
      onCancelled()
    }
  }, [currentSessionId, scheduleBackgroundOutputFetch])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadBackgroundTasks()
    }, 1800)

    return () => window.clearInterval(timer)
  }, [loadBackgroundTasks])

  useEffect(() => {
    latestBackgroundTasksRef.current = backgroundTasks
    if (backgroundTasks.length === 0) {
      return
    }

    for (const task of backgroundTasks) {
      if (task.status === 'running' || task.status === 'pending') {
        scheduleBackgroundOutputFetch(task.id)
      }
    }

    const timer = window.setInterval(() => {
      for (const task of latestBackgroundTasksRef.current) {
        if (task.status === 'running' || task.status === 'pending') {
          scheduleBackgroundOutputFetch(task.id)
        }
      }
    }, 1600)

    return () => window.clearInterval(timer)
  }, [backgroundTasks, scheduleBackgroundOutputFetch])

  useEffect(() => {
    if (!highlightedTaskId) {
      return
    }

    setActiveTab('tasks')
  }, [highlightedTaskId])

  const normalizedTaskSearch = taskSearch.trim().toLowerCase()

  const sortedTasks = useMemo(() => {
    const clone = [...tasks]
    clone.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return taskSortMode === 'newest' ? bTime - aTime : aTime - bTime
    })
    return clone
  }, [taskSortMode, tasks])

  const filteredTasks = useMemo(() => {
    return sortedTasks.filter(task => {
      if (taskStatusFilter !== 'all') {
        if (task.status !== taskStatusFilter) {
          return false
        }
      }

      if (!normalizedTaskSearch) {
        return true
      }

      const haystack =
        `${task.input || ''} ${task.output || ''} ${task.assignedAgent || ''} ${task.assignedModel || ''}`.toLowerCase()
      return haystack.includes(normalizedTaskSearch)
    })
  }, [normalizedTaskSearch, sortedTasks, taskStatusFilter])

  const runningTasks = useMemo(
    () => filteredTasks.filter(task => task.status === 'running'),
    [filteredTasks]
  )
  const pendingTasks = useMemo(
    () => filteredTasks.filter(task => task.status === 'pending' || task.status === 'pending_approval'),
    [filteredTasks]
  )
  const completedTasks = useMemo(
    () => filteredTasks.filter(task => ['completed', 'failed', 'cancelled'].includes(task.status)),
    [filteredTasks]
  )
  const hasTaskFilters =
    Boolean(normalizedTaskSearch) || taskStatusFilter !== 'all' || taskSortMode !== 'newest'

  const stuckDiagnosticSummary = useMemo(
    () =>
      buildWorkflowStuckDiagnosticSummary({
        tasks,
        observability: workflowObservability,
        diagnosticsByTaskId: taskDiagnosticsByTaskId,
        approvals: toolApprovalRequests
      }),
    [taskDiagnosticsByTaskId, tasks, toolApprovalRequests, workflowObservability]
  )

  const currentTaskReadinessSnapshot = useMemo(
    () =>
      buildLiveTaskReadinessDashboardSnapshot({
        tasks,
        workflowObservability,
        taskDiagnosticsByTaskId,
        approvals: toolApprovalRequests
      }),
    [taskDiagnosticsByTaskId, tasks, toolApprovalRequests, workflowObservability]
  )

  useEffect(() => {
    setTaskReadinessHistory(readTaskReadinessDashboardHistory())
  }, [currentSessionId])

  useEffect(() => {
    if (!currentTaskReadinessSnapshot) {
      return
    }

    const nextHistory = mergeTaskReadinessDashboardHistory(
      readTaskReadinessDashboardHistory(),
      currentTaskReadinessSnapshot
    )
    setTaskReadinessHistory(persistTaskReadinessDashboardHistory(nextHistory))
  }, [currentTaskReadinessSnapshot])

  const taskReadinessDashboard = useMemo(
    () =>
      buildTaskReadinessDashboardView(
        mergeTaskReadinessDashboardHistory(taskReadinessHistory, currentTaskReadinessSnapshot)
      ),
    [currentTaskReadinessSnapshot, taskReadinessHistory]
  )

  const taskDetailBindingSnapshot = useMemo(() => {
    if (!taskDetailState) {
      return undefined
    }

    return resolveTaskBindingSnapshot(
      taskDetailState.task,
      bindingSnapshots[taskDetailState.task.id]
    )
  }, [bindingSnapshots, taskDetailState])

  const backgroundRunning = useMemo(
    () => backgroundTasks.filter(task => task.status === 'running' || task.status === 'pending'),
    [backgroundTasks]
  )

  const backgroundFinished = useMemo(
    () => backgroundTasks.filter(task => task.status !== 'running' && task.status !== 'pending'),
    [backgroundTasks]
  )

  const handleViewDiff = useCallback((artifactId: string, filePath: string) => {
    setDiffViewerState({ artifactId, filePath })
  }, [])

  const closeDiffViewer = useCallback(() => {
    setDiffViewerState(null)
  }, [])

  const handleOpenArtifactInCanvas = useCallback(
    async (artifactId: string, filePath: string) => {
      if (!currentSessionId) {
        return
      }

      try {
        const artifact = await artifactApi.get(artifactId)
        if (artifact && typeof artifact === 'object' && 'id' in artifact) {
          await canvasLifecycle.openFile(filePath)
        }
      } catch (error) {
        console.error('Failed to open artifact in canvas:', error)
      }
    },
    [currentSessionId]
  )

  const closeTaskDetail = useCallback(() => {
    resetDiagnosticCopyState()
    setTaskDetailState(null)
  }, [resetDiagnosticCopyState, setTaskDetailState])

  return {
    currentSessionId,
    activeTab,
    setActiveTab,
    loading,
    taskError,
    tasks,
    filteredTasks,
    runningTasks,
    pendingTasks,
    completedTasks,
    taskSearch,
    setTaskSearch,
    taskStatusFilter,
    setTaskStatusFilter,
    taskSortMode,
    setTaskSortMode,
    completedTaskLimit,
    setCompletedTaskLimit,
    hasTaskFilters,
    resetTaskFilters,
    backgroundTasks,
    backgroundLoading,
    backgroundError,
    backgroundRunning,
    backgroundFinished,
    outputByTaskId,
    expandedTaskIds,
    bindingSnapshots,
    taskDiagnosticsByTaskId,
    sessionDiagnosticSummary,
    stuckDiagnosticSummary,
    taskReadinessDashboard,
    highlightedTaskId,
    handleTaskLinkage,
    taskDetailState,
    taskDetailTab,
    setTaskDetailTab,
    diagnosticCopyState,
    taskDetailDiagnostic,
    taskDetailBindingSnapshot,
    openTaskDetail,
    openTaskOutput,
    copyDiagnosticPackage,
    closeTaskDetail,
    diffViewerState,
    handleViewDiff,
    closeDiffViewer,
    handleOpenArtifactInCanvas,
    reloadActiveTab,
    refreshTasks,
    refreshBackgroundTasks,
    handleCancelBackgroundTask,
    toggleTaskExpanded
  }
}

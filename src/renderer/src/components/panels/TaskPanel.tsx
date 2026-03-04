/**
 * TaskPanel - 后台任务面板
 * 显示当前会话的任务列表、执行状态和文件产物
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertCircle,
  ListTodo,
  FileCode,
  Terminal,
  Ban,
  ChevronDown,
  ChevronRight,
  Link2,
  Eye,
  Brain,
  Stethoscope
} from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useDataStore } from '../../store/data.store'
import { useTraceNavigationStore } from '../../store/trace-navigation.store'
import { useAgentStore } from '../../store/agent.store'
import type { WorkLogEntry } from '../../store/agent.store'
import { canvasLifecycle } from '../../services/canvas-lifecycle'
import { ArtifactList } from '../artifact/ArtifactList'
import { DiffViewer } from '../artifact/DiffViewer'
import type { Task } from '@/types/domain'
import {
  createRafEventBuffer,
  createThrottledOutputFetcher,
  createThrottledTaskReloader
} from './task-panel-performance'
import { sanitizeDisplayOutput } from '../../utils/output-sanitizer'
import {
  buildTaskDiagnosticsFromObservability,
  classifyRunLogDiagnostics,
  getDiagnosticCategoryLabel,
  mergeTaskDiagnostics,
  type SessionDiagnosticSummary,
  type TaskDiagnosticSummary,
  type WorkflowObservabilityForDiagnostics
} from './task-panel-diagnostics'

interface BackgroundTaskInfo {
  id: string
  pid: number | null
  command: string
  input?: string
  description?: string
  cwd: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
  exitCode: number | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  metadata: Record<string, unknown> | null
}

interface BackgroundOutputChunk {
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: string
}

interface BackgroundTaskOutputMeta {
  total: number
  stdout: number
  stderr: number
  truncated: boolean
}

interface BackgroundTaskOutputState {
  chunks: BackgroundOutputChunk[]
  nextIndex: number
  outputMeta: BackgroundTaskOutputMeta | null
}

interface BackgroundTaskStats {
  total: number
  running: number
  completed: number
  error: number
  cancelled: number
}

type TabType = 'tasks' | 'background' | 'artifacts'
type TaskFilterStatus = 'all' | 'running' | 'pending' | 'completed' | 'failed' | 'cancelled'
type TaskSortMode = 'newest' | 'oldest'
type TaskDetailTab = 'thinking' | 'run' | 'diagnostic'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function extractTaskThinkingLogs(
  task: Task,
  logsByAgent: Record<string, WorkLogEntry[]>
): WorkLogEntry[] {
  const allLogs = Object.values(logsByAgent).flat()
  return allLogs
    .filter(log => {
      const taskId = typeof log.metadata?.taskId === 'string' ? String(log.metadata.taskId) : undefined
      const workflowTaskId =
        typeof log.metadata?.workflowTaskId === 'string' ? String(log.metadata.workflowTaskId) : undefined
      const persistedTaskId =
        typeof log.metadata?.persistedTaskId === 'string' ? String(log.metadata.persistedTaskId) : undefined
      return taskId === task.id || workflowTaskId === task.id || persistedTaskId === task.id
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-slate-400',
    bg: 'bg-slate-500/20',
    label: '等待中'
  },
  running: {
    icon: Loader2,
    color: 'text-sky-400',
    bg: 'bg-sky-500/20',
    label: '运行中'
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
    label: '已完成'
  },
  failed: {
    icon: XCircle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/20',
    label: '失败'
  },
  cancelled: {
    icon: AlertCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    label: '已取消'
  }
}

const diagnosticBadgeConfig = {
  config: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  permission: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  tool: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  model: 'border-rose-500/30 bg-rose-500/10 text-rose-300'
}

const diagnosticCategories = ['config', 'permission', 'tool', 'model'] as const

const diagnosticSourceLabels: Record<TaskDiagnosticSummary['source'], string> = {
  'recovery-terminal': '恢复终端诊断',
  'recovery-history': '恢复历史记录',
  'run-log': 'Run 日志',
  'task-output': '任务输出'
}

interface TaskBindingSnapshot {
  modelSource?: string
  fallbackTrail?: string[]
  concurrencyKey?: string
  workflowId?: string
}

interface WorkflowObservabilityTaskPanelSnapshot extends WorkflowObservabilityForDiagnostics {
  assignments?: Array<{
    taskId?: string
    persistedTaskId?: string
    modelSource?: string
    fallbackTrail?: string[]
    concurrencyKey?: string
    workflowId?: string
  }>
}

interface RunLogEntryLike {
  timestamp?: string | Date
  level?: string
  message?: string
  data?: Record<string, unknown>
}

interface TaskDetailState {
  task: Task
  thinkingLogs: WorkLogEntry[]
  runLogs: RunLogEntryLike[]
  loading: boolean
  error?: string
  diagnostic?: TaskDiagnosticSummary
}

interface TaskCardProps {
  task: Task
  onLinkClick?: (task: Task) => void
  onDetailClick?: (task: Task, defaultTab?: TaskDetailTab) => void
  onOpenOutput?: (task: Task) => void
  bindingSnapshot?: TaskBindingSnapshot
  diagnostic?: TaskDiagnosticSummary
}

function TaskCard({ task, onLinkClick, onDetailClick, onOpenOutput, bindingSnapshot, diagnostic }: TaskCardProps) {
  const config = statusConfig[task.status]
  const Icon = config.icon
  const isRunning = task.status === 'running'

  const displayOutput = task.output ? sanitizeDisplayOutput(task.output) : ''

  return (
    <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 hover:border-[var(--border-secondary)] transition-colors">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-lg ${config.bg}`}>
          <Icon className={`w-4 h-4 ${config.color} ${isRunning ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-primary)] line-clamp-2">{task.input}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-xs ${config.color}`}>{config.label}</span>
            {task.assignedAgent && (
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                {task.assignedAgent}
              </span>
            )}
            {task.assignedModel && (
              <span className="text-xs text-[var(--text-muted)] font-mono">{task.assignedModel}</span>
            )}
            {bindingSnapshot?.modelSource && (
              <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                来源: {bindingSnapshot.modelSource}
              </span>
            )}
            {bindingSnapshot?.concurrencyKey && (
              <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono">
                并发键: {bindingSnapshot.concurrencyKey}
              </span>
            )}
            {diagnostic && onDetailClick && (
              <button
                type="button"
                onClick={() => onDetailClick(task, 'diagnostic')}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${diagnosticBadgeConfig[diagnostic.category]} hover:opacity-90`}
                title={diagnostic.reason}
              >
                <Stethoscope className="w-3 h-3" />
                {diagnostic.label}
              </button>
            )}
            {onLinkClick && (
              <button
                type="button"
                onClick={() => onLinkClick(task)}
                className="inline-flex items-center gap-1 text-[11px] rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-300 hover:bg-sky-500/20"
              >
                <Link2 className="w-3 h-3" />
                关联追踪
              </button>
            )}
            {onDetailClick && (
              <button
                type="button"
                onClick={() => onDetailClick(task)}
                className="inline-flex items-center gap-1 text-[11px] rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-violet-300 hover:bg-violet-500/20"
              >
                <Eye className="w-3 h-3" />
                详情
              </button>
            )}
            {onOpenOutput && task.output && (
              <button
                type="button"
                onClick={() => onOpenOutput(task)}
                className="inline-flex items-center gap-1 text-[11px] rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 hover:bg-emerald-500/20"
              >
                <Terminal className="w-3 h-3" />
                输出
              </button>
            )}
          </div>
        </div>
      </div>
      {bindingSnapshot?.fallbackTrail && bindingSnapshot.fallbackTrail.length > 0 && (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
          <p className="text-[11px] text-amber-300">
            回退链路: {bindingSnapshot.fallbackTrail.join(' → ')}
          </p>
        </div>
      )}
      {bindingSnapshot?.workflowId && (
        <div className="mt-2 rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1">
          <p className="text-[11px] text-[var(--text-muted)] font-mono">Workflow: {bindingSnapshot.workflowId}</p>
        </div>
      )}
      {displayOutput && task.status === 'completed' && (
        <div className="mt-2 pt-2 border-t ui-border">
          <p className="text-xs text-[var(--text-secondary)] line-clamp-3">{displayOutput}</p>
        </div>
      )}
      {displayOutput && task.status === 'failed' && (
        <div className="mt-2 pt-2 border-t border-rose-800/30">
          <p className="text-xs text-rose-400 line-clamp-2">{displayOutput}</p>
        </div>
      )}
    </div>
  )
}

export function TaskPanel() {
  const { closeTaskPanel, openTaskPanel } = useUIStore()
  const { currentSessionId } = useDataStore()
  const { workLogs, fetchAgents } = useAgentStore()
  const navigationTarget = useTraceNavigationStore(state => state.target)
  const clearNavigate = useTraceNavigationStore(state => state.clearNavigate)
  const requestNavigate = useTraceNavigationStore(state => state.requestNavigate)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('tasks')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskFilterStatus>('all')
  const [taskSortMode, setTaskSortMode] = useState<TaskSortMode>('newest')
  const [completedTaskLimit, setCompletedTaskLimit] = useState(20)
  const [diffViewerState, setDiffViewerState] = useState<{
    artifactId: string
    filePath: string
  } | null>(null)
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskInfo[]>([])
  const [backgroundLoading, setBackgroundLoading] = useState(true)
  const [backgroundStats, setBackgroundStats] = useState<BackgroundTaskStats | null>(null)
  const [outputByTaskId, setOutputByTaskId] = useState<Record<string, BackgroundTaskOutputState>>({})
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
  const [bindingSnapshots, setBindingSnapshots] = useState<Record<string, TaskBindingSnapshot>>({})
  const [taskDiagnosticsByTaskId, setTaskDiagnosticsByTaskId] = useState<Record<string, TaskDiagnosticSummary>>({})
  const [sessionDiagnosticSummary, setSessionDiagnosticSummary] = useState<SessionDiagnosticSummary>({
    total: 0,
    config: 0,
    permission: 0,
    tool: 0,
    model: 0
  })
  const [taskDetailState, setTaskDetailState] = useState<TaskDetailState | null>(null)
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>('thinking')
  const outputByTaskIdRef = useRef<Record<string, BackgroundTaskOutputState>>({})
  const latestBackgroundTasksRef = useRef<BackgroundTaskInfo[]>([])

  const loadTasks = useCallback(async () => {
    if (!window.codeall || !currentSessionId) return

    try {
      const taskList = (await window.codeall.invoke('task:list', currentSessionId)) as Task[]
      const ordered = taskList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setTasks(ordered)

      const workflowTask = ordered.find(task => task.type === 'workflow')
      if (workflowTask?.id) {
        try {
          const observability = (await window.codeall.invoke(
            'workflow-observability:get',
            workflowTask.id
          )) as WorkflowObservabilityTaskPanelSnapshot

          const nextSnapshots: Record<string, TaskBindingSnapshot> = {}
          for (const assignment of observability.assignments || []) {
            if (!assignment.persistedTaskId) continue
            nextSnapshots[assignment.persistedTaskId] = {
              modelSource: assignment.modelSource,
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
          setBindingSnapshots({})
          const diagnostics = buildTaskDiagnosticsFromObservability(ordered, null)
          setTaskDiagnosticsByTaskId(diagnostics.byTaskId)
          setSessionDiagnosticSummary(diagnostics.summary)
        }
      } else {
        setBindingSnapshots({})
        const diagnostics = buildTaskDiagnosticsFromObservability(ordered, null)
        setTaskDiagnosticsByTaskId(diagnostics.byTaskId)
        setSessionDiagnosticSummary(diagnostics.summary)
      }
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [currentSessionId])

  const mapBackgroundTask = useCallback((task: BackgroundTaskInfo): BackgroundTaskInfo => {
    const metadataInput = typeof task.metadata?.input === 'string' ? String(task.metadata.input) : undefined
    const metadataDescription =
      typeof task.metadata?.description === 'string' ? String(task.metadata.description) : undefined

    return {
      ...task,
      input: metadataInput || metadataDescription || task.description || task.command
    }
  }, [])

  const loadBackgroundTasks = useCallback(async () => {
    if (!window.codeall || !currentSessionId) return

    try {
      const [taskResult, statsResult] = await Promise.all([
        window.codeall.invoke('background-task:list', {
          sessionId: currentSessionId
        }) as Promise<{
          success: boolean
          data?: BackgroundTaskInfo[]
          error?: string
        }>,
        window.codeall.invoke('background-task:stats') as Promise<{
          success: boolean
          data?: BackgroundTaskStats
          error?: string
        }>
      ])

      if (!taskResult.success) {
        throw new Error(taskResult.error || 'Failed to load background tasks')
      }

      const ordered = [...(taskResult.data || [])]
        .map(mapBackgroundTask)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setBackgroundTasks(ordered)

      if (statsResult.success && statsResult.data) {
        setBackgroundStats(statsResult.data)
      }

      const runningIds = new Set(
        ordered.filter(task => task.status === 'running' || task.status === 'pending').map(task => task.id)
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
    } finally {
      setBackgroundLoading(false)
    }
  }, [currentSessionId, mapBackgroundTask])

  const fetchBackgroundOutput = useCallback(async (taskId: string) => {
    if (!window.codeall) return

    const current = outputByTaskIdRef.current[taskId]
    const afterIndex = current?.nextIndex ?? 0

    try {
      const result = (await window.codeall.invoke('background-task:get-output', {
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

      const hasChunkDelta = !(result.data.chunks.length === 0 && result.data.nextIndex === afterIndex)
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
            chunks: nextChunks.length > cap ? nextChunks.slice(nextChunks.length - cap) : nextChunks,
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

  const handleCancelBackgroundTask = useCallback(async (taskId: string) => {
    if (!window.codeall) return

    try {
      await window.codeall.invoke('background-task:cancel', { taskId })
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

  useEffect(() => {
    if (currentSessionId) {
      setLoading(true)
      setBackgroundLoading(true)
      loadTasks()
      loadBackgroundTasks()
      void fetchAgents(currentSessionId)
    } else {
      setTasks([])
      setBackgroundTasks([])
      setBindingSnapshots({})
      setTaskDiagnosticsByTaskId({})
      setSessionDiagnosticSummary({
        total: 0,
        config: 0,
        permission: 0,
        tool: 0,
        model: 0
      })
      setTaskDetailState(null)
      setBackgroundStats(null)
      setLoading(false)
      setBackgroundLoading(false)
      setOutputByTaskId({})
      outputByTaskIdRef.current = {}
      setExpandedTaskIds({})
    }
  }, [currentSessionId, loadTasks, loadBackgroundTasks, fetchAgents])

  // 监听任务更新事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('task:status-changed', () => {
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
    if (!window.codeall) return

    const onStarted = window.codeall.on('background-task:started', payload => {
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
        return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      })

      setExpandedTaskIds(prev => ({ ...prev, [normalized.id]: true }))
    })

    const onOutput = window.codeall.on('background-task:output', payload => {
      const taskId = payload.taskId as string
      const stream = payload.stream as 'stdout' | 'stderr'
      const data = payload.data as string
      const timestamp = payload.timestamp as string

      const bgTask = latestBackgroundTasksRef.current.find(item => item.id === taskId)
      if (bgTask) {
        if (bgTask.metadata?.sessionId !== currentSessionId) {
          return
        }
      } else {
        return
      }

      setOutputByTaskId(prev => {
        const existing = prev[taskId] || { chunks: [], nextIndex: 0, outputMeta: null }
        const nextChunks = existing.chunks.concat([{ stream, data, timestamp }])
        const cap = 600
        const next = {
          ...prev,
          [taskId]: {
            chunks: nextChunks.length > cap ? nextChunks.slice(nextChunks.length - cap) : nextChunks,
            nextIndex: existing.nextIndex,
            outputMeta: existing.outputMeta
          }
        }
        outputByTaskIdRef.current = next
        return next
      })
    })

    const onCompleted = window.codeall.on('background-task:completed', payload => {
      const task = payload.task as BackgroundTaskInfo
      const normalized = mapBackgroundTask(task)
      setBackgroundTasks(prev => prev.map(item => (item.id === normalized.id ? normalized : item)))
      scheduleBackgroundOutputFetch(normalized.id)
    })

    const onCancelled = window.codeall.on('background-task:cancelled', payload => {
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
  }, [currentSessionId, mapBackgroundTask, scheduleBackgroundOutputFetch])

  useEffect(() => {
    if (!window.codeall) return

    const timer = setInterval(() => {
      void loadBackgroundTasks()
    }, 1800)

    return () => clearInterval(timer)
  }, [loadBackgroundTasks])

  useEffect(() => {
    latestBackgroundTasksRef.current = backgroundTasks
    if (!window.codeall || backgroundTasks.length === 0) return

    for (const task of backgroundTasks) {
      if (task.status === 'running' || task.status === 'pending') {
        scheduleBackgroundOutputFetch(task.id)
      }
    }

    const timer = setInterval(() => {
      for (const task of latestBackgroundTasksRef.current) {
        if (task.status === 'running' || task.status === 'pending') {
          scheduleBackgroundOutputFetch(task.id)
        }
      }
    }, 1600)

    return () => clearInterval(timer)
  }, [backgroundTasks, scheduleBackgroundOutputFetch])

  const normalizedTaskSearch = taskSearch.trim().toLowerCase()
  const sortedTasks = useMemo(() => {
    const clone = [...tasks]
    clone.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return taskSortMode === 'newest' ? bTime - aTime : aTime - bTime
    })
    return clone
  }, [tasks, taskSortMode])

  const filteredTasks = useMemo(() => {
    return sortedTasks.filter(task => {
      if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) {
        return false
      }

      if (!normalizedTaskSearch) {
        return true
      }

      const haystack = `${task.input || ''} ${task.output || ''} ${task.assignedAgent || ''} ${task.assignedModel || ''}`.toLowerCase()
      return haystack.includes(normalizedTaskSearch)
    })
  }, [sortedTasks, taskStatusFilter, normalizedTaskSearch])

  const runningTasks = filteredTasks.filter(t => t.status === 'running')
  const pendingTasks = filteredTasks.filter(t => t.status === 'pending')
  const completedTasks = filteredTasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))
  const hasTaskFilters = Boolean(normalizedTaskSearch) || taskStatusFilter !== 'all' || taskSortMode !== 'newest'

  const highlightedTaskId = navigationTarget?.taskId || null
  const workflowSnapshotSummary = useMemo(() => {
    const entries = Object.values(bindingSnapshots)
    if (entries.length === 0) {
      return null
    }

    const modelSources = Array.from(new Set(entries.map(item => item.modelSource).filter(Boolean)))
    const withFallback = entries.filter(item => (item.fallbackTrail || []).length > 0).length
    const withConcurrency = entries.filter(item => Boolean(item.concurrencyKey)).length

    return {
      total: entries.length,
      modelSources,
      withFallback,
      withConcurrency
    }
  }, [bindingSnapshots])

  const taskDetailDiagnostic = useMemo(() => {
    if (!taskDetailState) {
      return undefined
    }
    return mergeTaskDiagnostics(taskDetailState.diagnostic, taskDiagnosticsByTaskId[taskDetailState.task.id])
  }, [taskDetailState, taskDiagnosticsByTaskId])

  const backgroundRunning = backgroundTasks.filter(
    task => task.status === 'running' || task.status === 'pending'
  )
  const backgroundFinished = backgroundTasks.filter(
    task => task.status !== 'running' && task.status !== 'pending'
  )

  const effectiveBackgroundStats: BackgroundTaskStats = backgroundStats || {
    total: backgroundTasks.length,
    running: backgroundRunning.length,
    completed: backgroundTasks.filter(task => task.status === 'completed').length,
    error: backgroundTasks.filter(
      task => task.status === 'error' || task.status === 'interrupt' || task.status === 'timeout'
    ).length,
    cancelled: backgroundTasks.filter(task => task.status === 'cancelled').length
  }

  const handleViewDiff = (artifactId: string, filePath: string) => {
    setDiffViewerState({ artifactId, filePath })
  }

  const closeDiffViewer = () => {
    setDiffViewerState(null)
  }

  const handleTaskLinkage = useCallback(
    (task: Task) => {
      if (!task.id) {
        return
      }

      const metadata = (task.metadata || {}) as Record<string, unknown>
      const runId = typeof metadata.runId === 'string' ? metadata.runId : undefined
      const agentId = task.assignedAgent || undefined

      requestNavigate({
        source: 'workflow-node',
        taskId: task.id,
        runId,
        agentId,
        preferredView: 'agent'
      })
    },
    [requestNavigate]
  )

  const handleOpenTaskDetail = useCallback(
    async (task: Task, defaultTab: TaskDetailTab = 'thinking') => {
      const thinkingLogs = extractTaskThinkingLogs(task, workLogs)
      const baseDiagnostic = taskDiagnosticsByTaskId[task.id]
      setTaskDetailTab(defaultTab)
      setTaskDetailState({
        task,
        thinkingLogs,
        runLogs: [],
        loading: true,
        diagnostic: baseDiagnostic
      })

      try {
        const metadata = (task.metadata || {}) as Record<string, unknown>
        let runId = typeof metadata.runId === 'string' ? metadata.runId : undefined

        if (!runId && window.codeall) {
          const runs = await window.codeall.invoke('agent-run:list', task.id)
          if (Array.isArray(runs) && runs.length > 0) {
            const latest = runs[0] as { id?: string }
            if (latest?.id) {
              runId = String(latest.id)
            }
          }
        }

        if (!runId || !window.codeall) {
          setTaskDetailState(prev => {
            if (!prev) return prev
            return {
              ...prev,
              runLogs: [],
              loading: false,
              diagnostic: baseDiagnostic
            }
          })
          return
        }

        const runLogs = (await window.codeall.invoke('agent-run:get-logs', runId)) as RunLogEntryLike[]
        const safeRunLogs = Array.isArray(runLogs) ? runLogs : []
        const runDiagnostic = classifyRunLogDiagnostics(safeRunLogs)
        const mergedDiagnostic = mergeTaskDiagnostics(baseDiagnostic, runDiagnostic)

        setTaskDetailState(prev => {
          if (!prev) return prev
          return {
            ...prev,
            runLogs: safeRunLogs,
            loading: false,
            diagnostic: mergedDiagnostic
          }
        })
      } catch (error) {
        setTaskDetailState(prev => {
          if (!prev) return prev
          return {
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            diagnostic: baseDiagnostic
          }
        })
      }
    },
    [workLogs, taskDiagnosticsByTaskId]
  )

  const handleOpenTaskOutput = useCallback(
    (task: Task) => {
      void handleOpenTaskDetail(task, 'run')
    },
    [handleOpenTaskDetail]
  )

  const handleOpenArtifactInCanvas = useCallback(async (artifactId: string, filePath: string) => {
    if (!window.codeall || !currentSessionId) return

    try {
      const artifact = await window.codeall.invoke('artifact:get', artifactId)
      if (artifact && typeof artifact === 'object' && 'id' in artifact) {
        await canvasLifecycle.openFile(filePath)
      }
    } catch (error) {
      console.error('Failed to open artifact in canvas:', error)
    }
  }, [currentSessionId])

  useEffect(() => {
    if (!navigationTarget?.taskId) {
      return
    }

    openTaskPanel()
    setActiveTab('tasks')

    const clearTimer = setTimeout(() => {
      clearNavigate()
    }, 1600)

    return () => clearTimeout(clearTimer)
  }, [navigationTarget, openTaskPanel, clearNavigate])

  return (
    <div className="h-full flex flex-col ui-bg-panel border-l ui-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b ui-border">
        <div className="flex items-center gap-2">
          {/* Tab Buttons */}
          <div className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'tasks'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              任务
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('background')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'background'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              终端
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('artifacts')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'artifacts'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              产物
            </button>
          </div>
          {activeTab === 'tasks' && runningTasks.length > 0 && (
            <span className="text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">
              {runningTasks.length} 运行中
            </span>
          )}
          {activeTab === 'background' && backgroundRunning.length > 0 && (
            <span className="text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">
              {backgroundRunning.length} 运行中
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(activeTab === 'tasks' || activeTab === 'background') && (
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'tasks') {
                  loadTasks()
                } else {
                  setBackgroundLoading(true)
                  void loadBackgroundTasks()
                }
              }}
              disabled={activeTab === 'tasks' ? loading : backgroundLoading}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw
                className={`w-4 h-4 ${(activeTab === 'tasks' ? loading : backgroundLoading) ? 'animate-spin' : ''}`}
              />
            </button>
          )}
          <button
            type="button"
            onClick={closeTaskPanel}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'tasks' && workflowSnapshotSummary && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2">
            <p className="text-xs text-slate-200 font-medium">运行绑定快照</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded bg-slate-800 px-2 py-0.5">任务数: {workflowSnapshotSummary.total}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">
                来源: {workflowSnapshotSummary.modelSources.length > 0 ? workflowSnapshotSummary.modelSources.join(', ') : '未知'}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5">回退次数: {workflowSnapshotSummary.withFallback}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">并发键数量: {workflowSnapshotSummary.withConcurrency}</span>
            </div>
          </div>
        )}
        {activeTab === 'tasks' && sessionDiagnosticSummary.total > 0 && (
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
            <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">失败诊断概览</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                总计: {sessionDiagnosticSummary.total}
              </span>
              {diagnosticCategories.map(category => (
                <span
                  key={category}
                  className={`rounded border px-2 py-1 ${diagnosticBadgeConfig[category]}`}
                >
                  {getDiagnosticCategoryLabel(category)}: {sessionDiagnosticSummary[category]}
                </span>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'background' && (
          <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2">
            <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">诊断统计</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">总数: {effectiveBackgroundStats.total}</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">运行中: {effectiveBackgroundStats.running}</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">完成: {effectiveBackgroundStats.completed}</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">失败: {effectiveBackgroundStats.error}</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1">取消: {effectiveBackgroundStats.cancelled}</span>
            </div>
          </div>
        )}
        {activeTab === 'tasks' ? (
          // Tasks Tab
          loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">暂无任务</div>
          ) : (
            <>
              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-2.5 space-y-2">
                <input
                  type="text"
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  placeholder="搜索任务输入/输出/代理/模型"
                  className="w-full rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-sky-500/50"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={taskStatusFilter}
                    onChange={e => setTaskStatusFilter(e.target.value as TaskFilterStatus)}
                    className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="all">全部状态</option>
                    <option value="running">运行中</option>
                    <option value="pending">等待中</option>
                    <option value="completed">已完成</option>
                    <option value="failed">失败</option>
                    <option value="cancelled">已取消</option>
                  </select>
                  <select
                    value={taskSortMode}
                    onChange={e => setTaskSortMode(e.target.value as TaskSortMode)}
                    className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="newest">最新优先</option>
                    <option value="oldest">最早优先</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskSearch('')
                      setTaskStatusFilter('all')
                      setTaskSortMode('newest')
                      setCompletedTaskLimit(20)
                    }}
                    disabled={!hasTaskFilters && completedTaskLimit === 20}
                    className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
                  >
                    重置筛选
                  </button>
                </div>
              </div>

              {filteredTasks.length === 0 && (
                <div className="text-center py-3 text-[var(--text-muted)] text-xs">当前筛选条件下无任务</div>
              )}

              {filteredTasks.length > 0 && (
                <>
                  {/* Running Tasks */}
                  {runningTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                        运行中 ({runningTasks.length})
                      </h3>
                      {runningTasks.map(task => (
                        <div key={task.id} className="space-y-1">
                          <TaskCard
                            task={task}
                            onLinkClick={handleTaskLinkage}
                            onDetailClick={handleOpenTaskDetail}
                            onOpenOutput={handleOpenTaskOutput}
                            bindingSnapshot={bindingSnapshots[task.id]}
                            diagnostic={taskDiagnosticsByTaskId[task.id]}
                          />
                          {highlightedTaskId === task.id && (
                            <div className="text-[11px] text-sky-300 flex items-center gap-1 px-1">
                              <Link2 className="w-3 h-3" />
                              已定位关联任务
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending Tasks */}
                  {pendingTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                        等待中 ({pendingTasks.length})
                      </h3>
                      {pendingTasks.map(task => (
                        <div key={task.id} className="space-y-1">
                          <TaskCard
                            task={task}
                            onLinkClick={handleTaskLinkage}
                            onDetailClick={handleOpenTaskDetail}
                            onOpenOutput={handleOpenTaskOutput}
                            bindingSnapshot={bindingSnapshots[task.id]}
                            diagnostic={taskDiagnosticsByTaskId[task.id]}
                          />
                          {highlightedTaskId === task.id && (
                            <div className="text-[11px] text-sky-300 flex items-center gap-1 px-1">
                              <Link2 className="w-3 h-3" />
                              已定位关联任务
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Completed Tasks */}
                  {completedTasks.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                        已完成 ({completedTasks.length})
                      </h3>
                      {completedTasks.slice(0, completedTaskLimit).map(task => (
                        <div key={task.id} className="space-y-1">
                          <TaskCard
                            task={task}
                            onLinkClick={handleTaskLinkage}
                            onDetailClick={handleOpenTaskDetail}
                            onOpenOutput={handleOpenTaskOutput}
                            bindingSnapshot={bindingSnapshots[task.id]}
                            diagnostic={taskDiagnosticsByTaskId[task.id]}
                          />
                          {highlightedTaskId === task.id && (
                            <div className="text-[11px] text-sky-300 flex items-center gap-1 px-1">
                              <Link2 className="w-3 h-3" />
                              已定位关联任务
                            </div>
                          )}
                        </div>
                      ))}
                      {completedTasks.length > completedTaskLimit && (
                        <div className="space-y-2">
                          <p className="text-xs text-[var(--text-muted)] text-center">
                            还有 {completedTasks.length - completedTaskLimit} 个已完成任务
                          </p>
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => setCompletedTaskLimit(limit => limit + 20)}
                              className="rounded-md border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              加载更多
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )
        ) : activeTab === 'background' ? (
          backgroundLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
            </div>
          ) : backgroundTasks.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">No background terminal tasks</div>
          ) : (
            <div className="space-y-2">
              {backgroundRunning.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                    运行中 ({backgroundRunning.length})
                  </h3>
                  {backgroundRunning.map(task => {
                    const outputState = outputByTaskId[task.id]
                    const output = outputState?.chunks || []
                    const outputMeta = outputState?.outputMeta
                    const expanded = expandedTaskIds[task.id] ?? false
                    return (
                      <div
                        key={task.id}
                        className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]"
                      >
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleTaskExpanded(task.id)}
                            className="flex items-center gap-2 text-left min-w-0 flex-1"
                          >
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                            )}
                            <Terminal className="w-4 h-4 text-sky-400 flex-shrink-0" />
                            <span className="text-xs text-[var(--text-primary)] truncate font-mono">
                              {task.input || task.description || task.command}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleCancelBackgroundTask(task.id)
                            }}
                            className="px-2 py-1 rounded text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                          >
                            <Ban className="w-3.5 h-3.5 inline mr-1" />
                            取消
                          </button>
                        </div>
                        {expanded && (
                          <div className="border-t ui-border px-3 py-2">
                            <div className="text-[11px] text-[var(--text-muted)] mb-2 font-mono break-all">
                              {task.input || task.command}
                            </div>
                            {outputMeta && (
                              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                                  总输出: {formatBytes(outputMeta.total)}
                                </span>
                                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                                  stdout: {formatBytes(outputMeta.stdout)}
                                </span>
                                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                                  stderr: {formatBytes(outputMeta.stderr)}
                                </span>
                                {outputMeta.truncated && (
                                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                                    输出已截断
                                  </span>
                                )}
                              </div>
                            )}
                            <pre className="text-[11px] leading-5 bg-[var(--bg-tertiary)] rounded p-2 overflow-x-auto max-h-56 overflow-y-auto text-[var(--text-primary)] whitespace-pre-wrap">
                              {output.length === 0
                                ? '等待输出...'
                                : output.map(chunk => chunk.data).join('')}
                            </pre>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {backgroundFinished.length > 0 && (
                <div className="space-y-2 pt-1">
                  <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                    已完成 ({backgroundFinished.length})
                  </h3>
                  {backgroundFinished.slice(0, 20).map(task => {
                    const outputState = outputByTaskId[task.id]
                    const output = outputState?.chunks || []
                    const outputMeta = outputState?.outputMeta
                    const expanded = expandedTaskIds[task.id] ?? false
                    const failed = task.status === 'error' || task.status === 'interrupt' || task.status === 'timeout'
                    return (
                      <div
                        key={task.id}
                        className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]"
                      >
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleTaskExpanded(task.id)}
                            className="flex items-center gap-2 text-left min-w-0 flex-1"
                          >
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                            )}
                            {failed ? (
                              <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            ) : task.status === 'cancelled' ? (
                              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            )}
                            <span className="text-xs text-[var(--text-primary)] truncate font-mono">
                              {task.input || task.description || task.command}
                            </span>
                          </button>
                          <span className="text-[10px] text-[var(--text-muted)] uppercase">
                            {task.status}
                          </span>
                        </div>
                        {expanded && (
                          <div className="border-t ui-border px-3 py-2">
                            <div className="text-[11px] text-[var(--text-muted)] mb-2 font-mono break-all">
                              {task.input || task.command}
                            </div>
                            {outputMeta && (
                              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                                  总输出: {formatBytes(outputMeta.total)}
                                </span>
                                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                                  stdout: {formatBytes(outputMeta.stdout)}
                                </span>
                                <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">
                                  stderr: {formatBytes(outputMeta.stderr)}
                                </span>
                                {outputMeta.truncated && (
                                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                                    输出已截断
                                  </span>
                                )}
                              </div>
                            )}
                            <pre className="text-[11px] leading-5 bg-[var(--bg-tertiary)] rounded p-2 overflow-x-auto max-h-56 overflow-y-auto text-[var(--text-primary)] whitespace-pre-wrap">
                              {output.length === 0
                                ? '无输出'
                                : output.map(chunk => chunk.data).join('')}
                            </pre>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        ) : (
          // Artifacts Tab
          <ArtifactList
            sessionId={currentSessionId}
            onViewDiff={handleViewDiff}
            onOpenFile={handleOpenArtifactInCanvas}
          />
        )}
      </div>

      {/* Task Detail Modal */}
      {taskDetailState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-4xl max-h-[86vh] overflow-hidden rounded-xl border border-[var(--border-primary)] ui-bg-panel shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b ui-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">任务详情</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 break-all">{taskDetailState.task.input}</p>
              </div>
              <button
                type="button"
                onClick={() => setTaskDetailState(null)}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                title="关闭详情"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(86vh-64px)] p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <span className="text-[var(--text-muted)]">任务ID：</span>
                  <span className="font-mono text-[var(--text-primary)] break-all">{taskDetailState.task.id}</span>
                </div>
                <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <span className="text-[var(--text-muted)]">状态：</span>
                  <span className="text-[var(--text-primary)]">{taskDetailState.task.status}</span>
                </div>
                <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <span className="text-[var(--text-muted)]">开始时间：</span>
                  <span className="text-[var(--text-primary)]">{formatDateTime(taskDetailState.task.startedAt)}</span>
                </div>
                <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <span className="text-[var(--text-muted)]">完成时间：</span>
                  <span className="text-[var(--text-primary)]">{formatDateTime(taskDetailState.task.completedAt)}</span>
                </div>
                <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <span className="text-[var(--text-muted)]">Agent：</span>
                  <span className="text-[var(--text-primary)]">{taskDetailState.task.assignedAgent || '—'}</span>
                </div>
                <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1.5">
                  <span className="text-[var(--text-muted)]">Model：</span>
                  <span className="text-[var(--text-primary)] font-mono">{taskDetailState.task.assignedModel || '—'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden">
                <div className="flex items-center gap-2 p-2 border-b ui-border bg-[var(--bg-secondary)]">
                  <button
                    type="button"
                    onClick={() => setTaskDetailTab('thinking')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                      taskDetailTab === 'thinking'
                        ? 'bg-violet-500/15 text-violet-300'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    思考过程 ({taskDetailState.thinkingLogs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskDetailTab('run')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                      taskDetailTab === 'run'
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Run 日志 ({taskDetailState.runLogs.length})
                    {taskDetailState.loading && <Loader2 className="w-3 h-3 animate-spin" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskDetailTab('diagnostic')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                      taskDetailTab === 'diagnostic'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <Stethoscope className="w-3.5 h-3.5" />
                    诊断
                  </button>
                </div>

                <div className="p-3">
                  {taskDetailTab === 'thinking' ? (
                    taskDetailState.thinkingLogs.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">暂无关联思考日志</p>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {taskDetailState.thinkingLogs.map(log => (
                          <div
                            key={log.id}
                            className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5"
                          >
                            <div className="text-[10px] text-[var(--text-muted)]">
                              {formatDateTime(log.timestamp)} · {log.agentId} · {log.type}
                            </div>
                            <div className="text-xs text-[var(--text-primary)] mt-1 whitespace-pre-wrap break-words">
                              {log.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : taskDetailTab === 'diagnostic' ? (
                    taskDetailDiagnostic ? (
                      <div className="space-y-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${diagnosticBadgeConfig[taskDetailDiagnostic.category]}`}
                          >
                            <Stethoscope className="w-3 h-3" />
                            {taskDetailDiagnostic.label}
                          </span>
                          <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                            来源: {diagnosticSourceLabels[taskDetailDiagnostic.source]}
                          </span>
                          <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                            置信分: {taskDetailDiagnostic.score}
                          </span>
                          {taskDetailDiagnostic.updatedAt && (
                            <span className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[var(--text-secondary)]">
                              更新时间: {formatDateTime(taskDetailDiagnostic.updatedAt)}
                            </span>
                          )}
                        </div>
                        <div className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-2">
                          <p className="text-[11px] text-[var(--text-muted)]">失败原因</p>
                          <p className="mt-1 text-[var(--text-primary)] whitespace-pre-wrap break-words">
                            {taskDetailDiagnostic.reason}
                          </p>
                        </div>
                        {taskDetailDiagnostic.evidence.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[11px] text-[var(--text-muted)]">诊断证据</p>
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                              {taskDetailDiagnostic.evidence.map((item, index) => (
                                <pre
                                  key={`${taskDetailState.task.id}-diagnostic-${index}`}
                                  className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-words"
                                >
                                  {item}
                                </pre>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">暂无可用诊断信息</p>
                    )
                  ) : taskDetailState.loading ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在加载日志...
                    </div>
                  ) : taskDetailState.error ? (
                    <p className="text-xs text-rose-400">加载失败：{taskDetailState.error}</p>
                  ) : taskDetailState.runLogs.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">暂无 run 日志</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {taskDetailState.runLogs.map((log, index) => (
                        <div
                          key={`${String(log.timestamp || '')}-${index}`}
                          className="rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1.5"
                        >
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {formatDateTime(log.timestamp)} · {(log.level || 'info').toUpperCase()}
                          </div>
                          <div className="text-xs text-[var(--text-primary)] mt-1 whitespace-pre-wrap break-words">
                            {log.message || '无消息'}
                          </div>
                          {log.data && (
                            <pre className="mt-1 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                              {safeStringify(log.data)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {taskDetailState.task.output && (
                <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
                  <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">任务输出</h4>
                  <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto bg-[var(--bg-tertiary)] rounded p-2">
                    {sanitizeDisplayOutput(taskDetailState.task.output)}
                  </pre>
                </div>
              )}

              {taskDetailState.task.metadata && (
                <details className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3">
                  <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">查看 metadata</summary>
                  <pre className="mt-2 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto bg-[var(--bg-tertiary)] rounded p-2">
                    {safeStringify(taskDetailState.task.metadata)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Diff Viewer Modal */}
      {diffViewerState && (
        <DiffViewer
          artifactId={diffViewerState.artifactId}
          filePath={diffViewerState.filePath}
          onClose={closeDiffViewer}
        />
      )}
    </div>
  )
}

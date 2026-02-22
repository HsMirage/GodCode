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
  Link2
} from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useDataStore } from '../../store/data.store'
import { useTraceNavigationStore } from '../../store/trace-navigation.store'
import { ArtifactList } from '../artifact/ArtifactList'
import { DiffViewer } from '../artifact/DiffViewer'
import type { Task } from '@/types/domain'
import {
  createRafEventBuffer,
  createThrottledOutputFetcher,
  createThrottledTaskReloader
} from './task-panel-performance'

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

interface BackgroundTaskOutputState {
  chunks: BackgroundOutputChunk[]
  nextIndex: number
}

type TabType = 'tasks' | 'background' | 'artifacts'

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

interface TaskBindingSnapshot {
  modelSource?: string
  fallbackTrail?: string[]
  concurrencyKey?: string
  workflowId?: string
}

interface TaskCardProps {
  task: Task
  onLinkClick?: (task: Task) => void
  bindingSnapshot?: TaskBindingSnapshot
}

function TaskCard({ task, onLinkClick, bindingSnapshot }: TaskCardProps) {
  const config = statusConfig[task.status]
  const Icon = config.icon
  const isRunning = task.status === 'running'

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
                Source: {bindingSnapshot.modelSource}
              </span>
            )}
            {bindingSnapshot?.concurrencyKey && (
              <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono">
                Concurrency: {bindingSnapshot.concurrencyKey}
              </span>
            )}
            {onLinkClick && (
              <button
                type="button"
                onClick={() => onLinkClick(task)}
                className="inline-flex items-center gap-1 text-[11px] rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-300 hover:bg-sky-500/20"
              >
                <Link2 className="w-3 h-3" />
                Linked trace
              </button>
            )}
          </div>
        </div>
      </div>
      {bindingSnapshot?.fallbackTrail && bindingSnapshot.fallbackTrail.length > 0 && (
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
          <p className="text-[11px] text-amber-300">
            Fallback trail: {bindingSnapshot.fallbackTrail.join(' → ')}
          </p>
        </div>
      )}
      {bindingSnapshot?.workflowId && (
        <div className="mt-2 rounded border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-2 py-1">
          <p className="text-[11px] text-[var(--text-muted)] font-mono">Workflow: {bindingSnapshot.workflowId}</p>
        </div>
      )}
      {task.output && task.status === 'completed' && (
        <div className="mt-2 pt-2 border-t ui-border">
          <p className="text-xs text-[var(--text-secondary)] line-clamp-3">{task.output}</p>
        </div>
      )}
      {task.output && task.status === 'failed' && (
        <div className="mt-2 pt-2 border-t border-rose-800/30">
          <p className="text-xs text-rose-400 line-clamp-2">{task.output}</p>
        </div>
      )}
    </div>
  )
}

export function TaskPanel() {
  const { closeTaskPanel, openTaskPanel } = useUIStore()
  const { currentSessionId } = useDataStore()
  const navigationTarget = useTraceNavigationStore(state => state.target)
  const clearNavigate = useTraceNavigationStore(state => state.clearNavigate)
  const requestNavigate = useTraceNavigationStore(state => state.requestNavigate)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('tasks')
  const [diffViewerState, setDiffViewerState] = useState<{
    artifactId: string
    filePath: string
  } | null>(null)
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskInfo[]>([])
  const [backgroundLoading, setBackgroundLoading] = useState(true)
  const [outputByTaskId, setOutputByTaskId] = useState<Record<string, BackgroundTaskOutputState>>({})
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
  const [bindingSnapshots, setBindingSnapshots] = useState<Record<string, TaskBindingSnapshot>>({})
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
          )) as {
            assignments?: Array<{
              persistedTaskId?: string
              modelSource?: string
              fallbackTrail?: string[]
              concurrencyKey?: string
              workflowId?: string
            }>
          }

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
        } catch (error) {
          console.error('Failed to load workflow observability snapshots:', error)
        }
      } else {
        setBindingSnapshots({})
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
      const result = (await window.codeall.invoke('background-task:list', {
        sessionId: currentSessionId
      })) as {
        success: boolean
        data?: BackgroundTaskInfo[]
        error?: string
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to load background tasks')
      }

      const ordered = [...(result.data || [])]
        .map(mapBackgroundTask)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setBackgroundTasks(ordered)

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
        data?: { chunks: BackgroundOutputChunk[]; nextIndex: number }
        error?: string
      }

      if (!result.success || !result.data) {
        return
      }

      if (result.data.chunks.length === 0 && result.data.nextIndex === afterIndex) {
        return
      }

      setOutputByTaskId(prev => {
        const existing = prev[taskId] || { chunks: [], nextIndex: 0 }
        const nextChunks = existing.chunks.concat(result.data?.chunks || [])
        const cap = 600
        const next = {
          ...prev,
          [taskId]: {
            chunks: nextChunks.length > cap ? nextChunks.slice(nextChunks.length - cap) : nextChunks,
            nextIndex: result.data?.nextIndex ?? existing.nextIndex
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
    } else {
      setTasks([])
      setBackgroundTasks([])
      setBindingSnapshots({})
      setLoading(false)
      setBackgroundLoading(false)
      setOutputByTaskId({})
      outputByTaskIdRef.current = {}
      setExpandedTaskIds({})
    }
  }, [currentSessionId, loadTasks, loadBackgroundTasks])

  // 监听任务更新事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('task:status-changed', () => {
      batchedTaskStatusEvent.schedule()
    })

    return () => {
      removeListener()
    }
  }, [batchedTaskStatusEvent])

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
        const existing = prev[taskId] || { chunks: [], nextIndex: 0 }
        const nextChunks = existing.chunks.concat([{ stream, data, timestamp }])
        const cap = 600
        const next = {
          ...prev,
          [taskId]: {
            chunks: nextChunks.length > cap ? nextChunks.slice(nextChunks.length - cap) : nextChunks,
            nextIndex: existing.nextIndex
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

  const runningTasks = tasks.filter(t => t.status === 'running')
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))

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

  const backgroundRunning = backgroundTasks.filter(
    task => task.status === 'running' || task.status === 'pending'
  )
  const backgroundFinished = backgroundTasks.filter(
    task => task.status !== 'running' && task.status !== 'pending'
  )

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
              Terminal
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
              {backgroundRunning.length} running
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
            <p className="text-xs text-slate-200 font-medium">Run binding snapshot</p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-300">
              <span className="rounded bg-slate-800 px-2 py-0.5">Tasks: {workflowSnapshotSummary.total}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">
                Source: {workflowSnapshotSummary.modelSources.length > 0 ? workflowSnapshotSummary.modelSources.join(', ') : 'unknown'}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5">Fallback: {workflowSnapshotSummary.withFallback}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5">Concurrency keys: {workflowSnapshotSummary.withConcurrency}</span>
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
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">暂无后台任务</div>
          ) : (
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
                        bindingSnapshot={bindingSnapshots[task.id]}
                      />
                      {highlightedTaskId === task.id && (
                        <div className="text-[11px] text-sky-300 flex items-center gap-1 px-1">
                          <Link2 className="w-3 h-3" />
                          Linked task focused
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
                        bindingSnapshot={bindingSnapshots[task.id]}
                      />
                      {highlightedTaskId === task.id && (
                        <div className="text-[11px] text-sky-300 flex items-center gap-1 px-1">
                          <Link2 className="w-3 h-3" />
                          Linked task focused
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
                  {completedTasks.slice(0, 10).map(task => (
                    <div key={task.id} className="space-y-1">
                      <TaskCard
                        task={task}
                        onLinkClick={handleTaskLinkage}
                        bindingSnapshot={bindingSnapshots[task.id]}
                      />
                      {highlightedTaskId === task.id && (
                        <div className="text-[11px] text-sky-300 flex items-center gap-1 px-1">
                          <Link2 className="w-3 h-3" />
                          Linked task focused
                        </div>
                      )}
                    </div>
                  ))}
                  {completedTasks.length > 10 && (
                    <p className="text-xs text-[var(--text-muted)] text-center py-2">
                      还有 {completedTasks.length - 10} 个已完成任务
                    </p>
                  )}
                </div>
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
                    Running ({backgroundRunning.length})
                  </h3>
                  {backgroundRunning.map(task => {
                    const output = outputByTaskId[task.id]?.chunks || []
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
                            Cancel
                          </button>
                        </div>
                        {expanded && (
                          <div className="border-t ui-border px-3 py-2">
                            <div className="text-[11px] text-[var(--text-muted)] mb-2 font-mono break-all">
                              {task.input || task.command}
                            </div>
                            <pre className="text-[11px] leading-5 bg-[var(--bg-tertiary)] rounded p-2 overflow-x-auto max-h-56 overflow-y-auto text-[var(--text-primary)] whitespace-pre-wrap">
                              {output.length === 0
                                ? 'Waiting for output...'
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
                    Finished ({backgroundFinished.length})
                  </h3>
                  {backgroundFinished.slice(0, 20).map(task => {
                    const output = outputByTaskId[task.id]?.chunks || []
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
                            <pre className="text-[11px] leading-5 bg-[var(--bg-tertiary)] rounded p-2 overflow-x-auto max-h-56 overflow-y-auto text-[var(--text-primary)] whitespace-pre-wrap">
                              {output.length === 0
                                ? 'No output'
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
          <ArtifactList sessionId={currentSessionId} onViewDiff={handleViewDiff} />
        )}
      </div>

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

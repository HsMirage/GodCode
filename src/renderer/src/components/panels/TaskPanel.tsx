/**
 * TaskPanel - 后台任务面板
 * 显示当前会话的任务列表、执行状态和文件产物
 */

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertCircle,
  ListTodo,
  FileCode
} from 'lucide-react'
import { useUIStore } from '../../store/ui.store'
import { useDataStore } from '../../store/data.store'
import { ArtifactList } from '../artifact/ArtifactList'
import { DiffViewer } from '../artifact/DiffViewer'
import type { Task } from '@/types/domain'

type TabType = 'tasks' | 'artifacts'

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

interface TaskCardProps {
  task: Task
}

function TaskCard({ task }: TaskCardProps) {
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
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs ${config.color}`}>{config.label}</span>
            {task.assignedAgent && (
              <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                {task.assignedAgent}
              </span>
            )}
            {task.assignedModel && (
              <span className="text-xs text-[var(--text-muted)] font-mono">{task.assignedModel}</span>
            )}
          </div>
        </div>
      </div>
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
  const { closeTaskPanel } = useUIStore()
  const { currentSessionId } = useDataStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('tasks')
  const [diffViewerState, setDiffViewerState] = useState<{
    artifactId: string
    filePath: string
  } | null>(null)

  const loadTasks = useCallback(async () => {
    if (!window.codeall || !currentSessionId) return

    try {
      const taskList = (await window.codeall.invoke('task:list', currentSessionId)) as Task[]
      setTasks(
        taskList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      )
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [currentSessionId])

  useEffect(() => {
    if (currentSessionId) {
      setLoading(true)
      loadTasks()
    } else {
      setTasks([])
      setLoading(false)
    }
  }, [currentSessionId, loadTasks])

  // 监听任务更新事件
  useEffect(() => {
    if (!window.codeall) return

    const removeListener = window.codeall.on('task:status-changed', () => {
      loadTasks()
    })

    return () => {
      removeListener()
    }
  }, [loadTasks])

  const runningTasks = tasks.filter(t => t.status === 'running')
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))

  const handleViewDiff = (artifactId: string, filePath: string) => {
    setDiffViewerState({ artifactId, filePath })
  }

  const closeDiffViewer = () => {
    setDiffViewerState(null)
  }

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
        </div>
        <div className="flex items-center gap-1">
          {activeTab === 'tasks' && (
            <button
              type="button"
              onClick={loadTasks}
              disabled={loading}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                    <TaskCard key={task.id} task={task} />
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
                    <TaskCard key={task.id} task={task} />
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
                    <TaskCard key={task.id} task={task} />
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

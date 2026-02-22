import * as React from 'react'
import { useEffect, useState } from 'react'
import { Play, RotateCw, History, CheckCircle2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
}

interface ContinuationStatus {
  shouldContinue: boolean
  incompleteTodos: TodoItem[]
  continuationPrompt?: string
}

interface ResumeHistoryItem {
  timestamp: string
  taskCount: number
  status: 'completed' | 'aborted'
}

interface SessionRecoveryRecord {
  sessionId: string
  status: 'active' | 'interrupted' | 'recovering' | 'recovered'
  checkpoint: {
    inProgressTasks?: string[]
    pendingTasks?: string[]
    completedTasks?: string[]
    checkpointAt?: string | Date
  }
}

async function loadResumeHistory(sessionId: string): Promise<ResumeHistoryItem[]> {
  if (!window.codeall || !sessionId) return []

  try {
    const recoverable = (await window.codeall.invoke(
      'session-recovery:list'
    )) as SessionRecoveryRecord[]

    return recoverable
      .filter(item => item.sessionId === sessionId)
      .map(item => {
        const checkpointAt = item.checkpoint?.checkpointAt
        const timestamp =
          checkpointAt instanceof Date
            ? checkpointAt.toISOString()
            : typeof checkpointAt === 'string'
              ? checkpointAt
              : new Date().toISOString()

        const completedCount = Array.isArray(item.checkpoint?.completedTasks)
          ? item.checkpoint.completedTasks.length
          : 0

        return {
          timestamp,
          taskCount: completedCount,
          status: item.status === 'active' || item.status === 'recovered' ? 'completed' : 'aborted'
        }
      })
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
      .slice(0, 5)
  } catch (error) {
    console.error('Failed to load resume history:', error)
    return []
  }
}

interface SessionResumeIndicatorProps {
  sessionId: string
}

export function SessionResumeIndicator({ sessionId }: SessionResumeIndicatorProps) {
  const [status, setStatus] = useState<ContinuationStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const [history, setHistory] = useState<ResumeHistoryItem[]>([])

  useEffect(() => {
    let mounted = true

    const checkStatus = async () => {
      if (!sessionId || !window.codeall) return
      try {
        const result = await window.codeall.invoke('task-continuation:get-status', sessionId)
        if (mounted) {
          setStatus(result as ContinuationStatus)
        }
      } catch (error) {
        console.error('Failed to get continuation status:', error)
      }
    }

    const load = async () => {
      await checkStatus()
      const loadedHistory = await loadResumeHistory(sessionId)
      if (mounted) {
        setHistory(loadedHistory)
      }
    }

    void load()
    const interval = setInterval(() => {
      void load()
    }, 30000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [sessionId])

  const handleResume = async () => {
    if (!sessionId || !status?.shouldContinue || !window.codeall) return

    setIsLoading(true)
    try {
      if (status.continuationPrompt) {
        await window.codeall.invoke('message:send', {
          sessionId,
          content: status.continuationPrompt
        })
      }
    } catch (error) {
      console.error('Failed to resume session:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!status || (!status.shouldContinue && status.incompleteTodos.length === 0)) {
    return null
  }

  const totalTasks = 10
  const completedTasks = totalTasks - status.incompleteTodos.length
  const progressPercent = Math.round((completedTasks / totalTasks) * 100)

  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-sm transition-all duration-300">
      <div className="max-w-4xl mx-auto p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-amber-500/20 rounded-full text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-amber-200">
                  {status.incompleteTodos.length} items pending
                </span>
                <span className="text-xs text-amber-500/80">•</span>
                <span className="text-xs text-amber-400/80">Session interrupted</span>
              </div>

              <div className="w-full max-w-xs h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              title="View Resume History"
            >
              <History className="w-4 h-4" />
            </button>

            <button
              onClick={handleResume}
              disabled={isLoading}
              className={clsx(
                'flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all shadow-lg shadow-amber-900/20',
                'bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/50',
                isLoading && 'opacity-75 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {isLoading ? 'Resuming...' : 'Resume Session'}
            </button>
          </div>
        </div>

        <div
          className={clsx(
            'grid transition-[grid-template-rows] duration-300 ease-in-out',
            isExpanded
              ? 'grid-rows-[1fr] mt-3 pt-3 border-t border-amber-500/10'
              : 'grid-rows-[0fr]'
          )}
        >
          <div className="overflow-hidden">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Recent Activity
            </h4>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs p-2 rounded bg-slate-800/30"
                >
                  <div className="flex items-center gap-2 text-slate-300">
                    <CheckCircle2
                      className={clsx(
                        'w-3 h-3',
                        item.status === 'completed' ? 'text-emerald-500' : 'text-slate-500'
                      )}
                    />
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{item.taskCount} tasks</span>
                    <span
                      className={clsx(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                        item.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

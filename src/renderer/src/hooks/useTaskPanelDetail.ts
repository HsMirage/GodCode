import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '@renderer/types/domain'
import { workflowApi } from '../api'
import type { WorkLogEntry } from '../store/agent.store'
import {
  buildDiagnosticPackageText,
  extractTaskThinkingLogs,
  type TaskDetailState,
  type TaskDetailTab
} from '../components/panels/task-panel-detail'
import {
  classifyRunLogDiagnostics,
  mergeTaskDiagnostics,
  type TaskDiagnosticSummary
} from '../components/panels/task-panel-diagnostics'

interface UseTaskPanelDetailOptions {
  workLogs: Record<string, WorkLogEntry[]>
  taskDiagnosticsByTaskId: Record<string, TaskDiagnosticSummary>
}

export function useTaskPanelDetail({
  workLogs,
  taskDiagnosticsByTaskId
}: UseTaskPanelDetailOptions) {
  const [taskDetailState, setTaskDetailState] = useState<TaskDetailState | null>(null)
  const [taskDetailTab, setTaskDetailTab] = useState<TaskDetailTab>('thinking')
  const [diagnosticCopyState, setDiagnosticCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const diagnosticCopyTimerRef = useRef<number | null>(null)

  const resetDiagnosticCopyState = useCallback(() => {
    setDiagnosticCopyState('idle')
  }, [])

  const taskDetailDiagnostic = useMemo(() => {
    if (!taskDetailState) {
      return undefined
    }

    return mergeTaskDiagnostics(taskDetailState.diagnostic, taskDiagnosticsByTaskId[taskDetailState.task.id])
  }, [taskDetailState, taskDiagnosticsByTaskId])

  const openTaskDetail = useCallback(
    async (task: Task, defaultTab: TaskDetailTab = 'thinking') => {
      setDiagnosticCopyState('idle')
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

        if (!runId) {
          const runs = await workflowApi.agentRunList(task.id)
          if (Array.isArray(runs) && runs.length > 0) {
            const latest = runs[0] as { id?: string }
            if (latest?.id) {
              runId = String(latest.id)
            }
          }
        }

        if (!runId) {
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

        const runLogs = await workflowApi.agentRunGetLogs(runId)
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
    [taskDiagnosticsByTaskId, workLogs]
  )

  const openTaskOutput = useCallback(
    (task: Task) => {
      void openTaskDetail(task, 'run')
    },
    [openTaskDetail]
  )

  const copyDiagnosticPackage = useCallback(async () => {
    if (!taskDetailState || !taskDetailDiagnostic) {
      return
    }

    const clipboardApi =
      (typeof window !== 'undefined' ? window.navigator?.clipboard : undefined) ||
      (typeof navigator !== 'undefined' ? navigator.clipboard : undefined)

    if (!clipboardApi?.writeText) {
      setDiagnosticCopyState('error')
      if (diagnosticCopyTimerRef.current !== null) {
        window.clearTimeout(diagnosticCopyTimerRef.current)
      }
      diagnosticCopyTimerRef.current = window.setTimeout(() => {
        setDiagnosticCopyState('idle')
        diagnosticCopyTimerRef.current = null
      }, 1800)
      return
    }

    try {
      const text = buildDiagnosticPackageText(
        taskDetailState.task,
        taskDetailDiagnostic,
        taskDetailState.runLogs || []
      )
      await clipboardApi.writeText(text)
      setDiagnosticCopyState('success')
    } catch (error) {
      console.error('Failed to copy diagnostic package:', error)
      setDiagnosticCopyState('error')
    }

    if (diagnosticCopyTimerRef.current !== null) {
      window.clearTimeout(diagnosticCopyTimerRef.current)
    }
    diagnosticCopyTimerRef.current = window.setTimeout(() => {
      setDiagnosticCopyState('idle')
      diagnosticCopyTimerRef.current = null
    }, 1800)
  }, [taskDetailDiagnostic, taskDetailState])

  useEffect(() => {
    return () => {
      if (diagnosticCopyTimerRef.current !== null) {
        window.clearTimeout(diagnosticCopyTimerRef.current)
      }
    }
  }, [])

  return {
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
  }
}

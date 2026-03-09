import { useCallback, useEffect } from 'react'
import type { Task } from '@renderer/types/domain'
import { useUIStore } from '../store/ui.store'
import { useTraceNavigationStore } from '../store/trace-navigation.store'

export function useTaskPanelNavigation() {
  const { openTaskPanel } = useUIStore()
  const navigationTarget = useTraceNavigationStore(state => state.target)
  const clearNavigate = useTraceNavigationStore(state => state.clearNavigate)
  const requestNavigate = useTraceNavigationStore(state => state.requestNavigate)

  const highlightedTaskId = navigationTarget?.taskId || null

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

    const clearTimer = window.setTimeout(() => {
      clearNavigate()
    }, 1600)

    return () => window.clearTimeout(clearTimer)
  }, [clearNavigate, navigationTarget, openTaskPanel])

  return {
    highlightedTaskId,
    navigationTarget,
    handleTaskLinkage
  }
}

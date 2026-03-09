import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ToolApprovalRequest } from '@shared/tool-approval-contract'
import { workflowApi } from '../api'

export function useToolApprovals(sessionId: string | null) {
  const [requests, setRequests] = useState<ToolApprovalRequest[]>([])
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!sessionId) {
        setRequests([])
        return
      }

      try {
        const result = await workflowApi.toolApprovalList({ sessionId })
        if (!cancelled) {
          setRequests(result.filter(item => item.status === 'pending_approval'))
        }
      } catch (error) {
        console.error('Failed to load tool approvals:', error)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) {
      return
    }

    return workflowApi.onToolApprovalUpdated(({ request }) => {
      if (request.sessionId !== sessionId) {
        return
      }

      setRequests(current => {
        const next = current.filter(item => item.id !== request.id)
        if (request.status === 'pending_approval') {
          next.push(request)
        }
        return next.sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
      })
    })
  }, [sessionId])

  const activeRequest = useMemo(() => requests[0] || null, [requests])

  const resolve = useCallback(async (requestId: string, decision: 'approved' | 'rejected') => {
    setResolvingId(requestId)
    try {
      await workflowApi.toolApprovalResolve({ requestId, decision })
    } finally {
      setResolvingId(current => (current === requestId ? null : current))
    }
  }, [])

  return {
    requests,
    activeRequest,
    resolvingId,
    approve: activeRequest ? () => resolve(activeRequest.id, 'approved') : undefined,
    reject: activeRequest ? () => resolve(activeRequest.id, 'rejected') : undefined
  }
}


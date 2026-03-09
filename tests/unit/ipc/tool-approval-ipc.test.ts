import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const { listRequests, resolveRequest } = vi.hoisted(() => ({
  listRequests: vi.fn(),
  resolveRequest: vi.fn()
}))

vi.mock('@/main/services/tools/tool-approval.service', () => ({
  toolApprovalService: {
    listRequests,
    resolveRequest
  }
}))

import { handleToolApprovalList, handleToolApprovalResolve } from '@/main/ipc/handlers/tool-approval'

describe('tool approval IPC handlers', () => {
  beforeEach(() => {
    listRequests.mockReset()
    resolveRequest.mockReset()
  })

  it('lists pending approvals', async () => {
    listRequests.mockResolvedValue([{ id: 'req-1', status: 'pending_approval' }])

    const result = await handleToolApprovalList({} as IpcMainInvokeEvent, { sessionId: 'session-1' })

    expect(listRequests).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(result).toEqual([{ id: 'req-1', status: 'pending_approval' }])
  })

  it('resolves a pending approval', async () => {
    resolveRequest.mockResolvedValue({
      success: true,
      request: {
        id: 'req-1',
        status: 'approved'
      }
    })

    const result = await handleToolApprovalResolve({} as IpcMainInvokeEvent, {
      requestId: 'req-1',
      decision: 'approved'
    })

    expect(resolveRequest).toHaveBeenCalledWith({ requestId: 'req-1', decision: 'approved' })
    expect(result).toEqual({
      success: true,
      request: {
        id: 'req-1',
        status: 'approved'
      }
    })
  })
})


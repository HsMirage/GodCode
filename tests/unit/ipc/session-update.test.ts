/**
 * session:update IPC contract test
 *
 * Verifies that the main handler and renderer helper both use
 * the single-object { id, ...updates } payload shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/main/services/database', () => {
  const mockUpdate = vi.fn()
  return {
    DatabaseService: {
      getInstance: () => ({
        getClient: () => ({
          session: { update: mockUpdate }
        }),
        __mockUpdate: mockUpdate
      })
    }
  }
})

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      })
    })
  }
}))

import { handleSessionUpdate } from '@/main/ipc/handlers/session'
import { DatabaseService } from '@/main/services/database'
import { sessionApi } from '@/renderer/src/api'
import type { IpcMainInvokeEvent } from 'electron'

describe('session:update IPC contract', () => {
  const fakeEvent = {} as IpcMainInvokeEvent
  let mockUpdate: ReturnType<typeof vi.fn>
  let invokeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const db = DatabaseService.getInstance() as any
    mockUpdate = db.__mockUpdate
    mockUpdate.mockReset()

    invokeMock = vi.fn()
    vi.stubGlobal('window', {
      codeall: {
        invoke: invokeMock,
        on: vi.fn()
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should accept { id, title } as a single data parameter', async () => {
    const fakeSession = { id: 'sess-1', title: 'Updated', spaceId: 'sp-1' }
    mockUpdate.mockResolvedValue(fakeSession)

    const result = await handleSessionUpdate(fakeEvent, { id: 'sess-1', title: 'Updated' })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { title: 'Updated' }
    })
    expect(result).toEqual(fakeSession)
  })

  it('should accept { id, title, status } for multi-field update', async () => {
    const fakeSession = { id: 'sess-2', title: 'Renamed', status: 'archived', spaceId: 'sp-1' }
    mockUpdate.mockResolvedValue(fakeSession)

    const result = await handleSessionUpdate(fakeEvent, {
      id: 'sess-2',
      title: 'Renamed',
      status: 'archived'
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sess-2' },
      data: { title: 'Renamed', status: 'archived' }
    })
    expect(result).toEqual(fakeSession)
  })

  it('should merge sessionId and updates in sessionApi.update', async () => {
    const fakeSession = { id: 'sess-9', title: 'Updated', status: 'active', spaceId: 'sp-9' }
    invokeMock.mockResolvedValue(fakeSession)

    const result = await sessionApi.update('sess-9', { title: 'Updated', status: 'active' })

    expect(invokeMock).toHaveBeenCalledWith('session:update', {
      id: 'sess-9',
      title: 'Updated',
      status: 'active'
    })
    expect(result).toEqual(fakeSession)
  })

  it('should throw if database update fails', async () => {
    mockUpdate.mockRejectedValue(new Error('DB error'))

    await expect(
      handleSessionUpdate(fakeEvent, { id: 'sess-3', title: 'Fail' })
    ).rejects.toThrow('DB error')
  })
})

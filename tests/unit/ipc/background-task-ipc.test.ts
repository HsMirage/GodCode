import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerBackgroundTaskHandlers } from '../../../src/main/ipc/handlers/background-task'

const mockGetAllTasks = vi.fn()
const mockGetTask = vi.fn()
const mockGetOutputChunks = vi.fn()
const mockCancelTask = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../../../src/main/services/tools/background', () => ({
  backgroundTaskManager: {
    getAllTasks: (...args: any[]) => mockGetAllTasks(...args),
    getTask: (...args: any[]) => mockGetTask(...args)
  },
  getOutputChunks: (...args: any[]) => mockGetOutputChunks(...args),
  cancelTask: (...args: any[]) => mockCancelTask(...args)
}))

describe('background task IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers background task handlers', () => {
    registerBackgroundTaskHandlers()

    const channels = (ipcMain.handle as any).mock.calls.map((call: any[]) => call[0])
    expect(channels).toContain('background-task:list')
    expect(channels).toContain('background-task:get-output')
    expect(channels).toContain('background-task:cancel')
  })

  it('lists background tasks filtered by sessionId', async () => {
    mockGetAllTasks.mockReturnValue([
      {
        id: 'task-1',
        command: 'npm run dev',
        cwd: '/workspace',
        status: 'running',
        pid: 123,
        exitCode: null,
        createdAt: new Date('2026-02-21T10:00:00.000Z'),
        startedAt: new Date('2026-02-21T10:00:01.000Z'),
        completedAt: null,
        metadata: { sessionId: 'session-a' }
      },
      {
        id: 'task-2',
        command: 'pnpm test',
        cwd: '/workspace',
        status: 'completed',
        pid: 321,
        exitCode: 0,
        createdAt: new Date('2026-02-21T09:00:00.000Z'),
        startedAt: new Date('2026-02-21T09:00:01.000Z'),
        completedAt: new Date('2026-02-21T09:00:10.000Z'),
        metadata: { sessionId: 'session-b' }
      }
    ])

    registerBackgroundTaskHandlers()
    const listHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'background-task:list'
    )?.[1]

    const result = await listHandler({}, { sessionId: 'session-a' })

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('task-1')
  })

  it('gets incremental output by index', async () => {
    mockGetTask.mockReturnValue({
      id: 'task-1',
      command: 'npm run dev',
      cwd: '/workspace',
      status: 'running',
      pid: 123,
      exitCode: null,
      createdAt: new Date('2026-02-21T10:00:00.000Z'),
      startedAt: new Date('2026-02-21T10:00:01.000Z'),
      completedAt: null,
      metadata: { sessionId: 'session-a' }
    })

    mockGetOutputChunks.mockReturnValue({
      chunks: [
        {
          stream: 'stdout',
          data: 'line-1\n',
          timestamp: new Date('2026-02-21T10:00:02.000Z')
        }
      ],
      nextIndex: 1
    })

    registerBackgroundTaskHandlers()
    const outputHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'background-task:get-output'
    )?.[1]

    const result = await outputHandler({}, { taskId: 'task-1', afterIndex: 0 })

    expect(result.success).toBe(true)
    expect(result.data?.nextIndex).toBe(1)
    expect(result.data?.chunks[0]).toEqual({
      stream: 'stdout',
      data: 'line-1\n',
      timestamp: '2026-02-21T10:00:02.000Z'
    })
  })

  it('cancels a running task', async () => {
    mockGetTask.mockReturnValue({
      id: 'task-1',
      status: 'running',
      command: 'npm run dev',
      cwd: '/workspace',
      pid: 123,
      exitCode: null,
      createdAt: new Date('2026-02-21T10:00:00.000Z'),
      startedAt: new Date('2026-02-21T10:00:01.000Z'),
      completedAt: null,
      metadata: { sessionId: 'session-a' }
    })
    mockCancelTask.mockResolvedValue(true)

    registerBackgroundTaskHandlers()
    const cancelHandler = (ipcMain.handle as any).mock.calls.find(
      (call: any[]) => call[0] === 'background-task:cancel'
    )?.[1]

    const result = await cancelHandler({}, { taskId: 'task-1' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ taskId: 'task-1', cancelled: true })
    expect(mockCancelTask).toHaveBeenCalledWith('task-1')
  })
})

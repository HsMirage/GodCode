import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const findManyMock = vi.fn()
const getClientMock = vi.fn()
const initMock = vi.fn(async () => {})
const reconnectMock = vi.fn(async () => {})

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      init: initMock,
      reconnect: reconnectMock,
      getClient: getClientMock
    }))
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => ({
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
      }))
    }))
  }
}))

import { handleTaskList } from '@/main/ipc/handlers/task'

describe('task IPC output sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClientMock.mockReturnValue({
      task: {
        findMany: findManyMock
      }
    })
  })

  it('sanitizes wrapper artifacts from task output in task:list response', async () => {
    const now = new Date('2026-02-23T00:00:00.000Z')
    findManyMock.mockResolvedValue([
      {
        id: 'task-1',
        sessionId: 'session-1',
        parentTaskId: null,
        type: 'subtask',
        status: 'completed',
        input: 'run validation',
        output: [
          'Running validation (typecheck/build)',
          'assistant to=functions.bash',
          '{"command":"npm run build","timeout":600000}',
          '完成：构建通过。'
        ].join('\n'),
        assignedModel: null,
        assignedAgent: null,
        createdAt: now,
        startedAt: now,
        completedAt: now,
        metadata: {}
      }
    ])

    const tasks = await handleTaskList({} as IpcMainInvokeEvent, 'session-1')

    expect(tasks).toHaveLength(1)
    expect(tasks[0].output).toContain('Running validation (typecheck/build)')
    expect(tasks[0].output).toContain('完成：构建通过。')
    expect(tasks[0].output).not.toContain('assistant to=functions.bash')
    expect(tasks[0].output).not.toContain('"command"')
  })

  it('reconnects and retries once when task:list loses database connectivity', async () => {
    const now = new Date('2026-03-09T00:00:00.000Z')
    findManyMock
      .mockRejectedValueOnce(
        Object.assign(new Error("Can't reach database server at `localhost:51285`"), {
          code: 'P1001'
        })
      )
      .mockResolvedValueOnce([
        {
          id: 'task-recovered',
          sessionId: 'session-1',
          parentTaskId: null,
          type: 'subtask',
          status: 'completed',
          input: 'retry list',
          output: 'ok',
          assignedModel: null,
          assignedAgent: null,
          createdAt: now,
          startedAt: now,
          completedAt: now,
          metadata: {}
        }
      ])

    const tasks = await handleTaskList({} as IpcMainInvokeEvent, 'session-1')

    expect(reconnectMock).toHaveBeenCalledTimes(1)
    expect(findManyMock).toHaveBeenCalledTimes(2)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('task-recovered')
  })
})

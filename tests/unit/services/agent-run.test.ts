import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentRunService } from '@/main/services/agent-run.service'

const mockSend = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        webContents: {
          send: mockSend
        }
      }
    ])
  }
}))

const mockRuns = new Map<string, any>()

const mockPrisma = {
  run: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      return mockRuns.get(where.id) ?? null
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const current = mockRuns.get(where.id)
      const updated = {
        ...current,
        ...data
      }
      mockRuns.set(where.id, updated)
      return updated
    })
  }
}

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => ({
      getClient: () => mockPrisma
    })
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    })
  }
}))

describe('AgentRunService', () => {
  let service: AgentRunService

  beforeEach(() => {
    vi.clearAllMocks()
    mockRuns.clear()
    mockRuns.set('run-1', {
      id: 'run-1',
      taskId: 'task-1',
      status: 'running',
      logs: [],
      tokenUsage: null,
      cost: null,
      completedAt: null
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(AgentRunService as any).instance = undefined
    service = AgentRunService.getInstance()
  })

  it('completes running run and emits update event once', async () => {
    const run = await service.completeRun('run-1', {
      success: true,
      tokenUsage: { prompt: 1, completion: 2, total: 3 }
    })

    expect(run.status).toBe('completed')
    expect(mockPrisma.run.update).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith('agent-run:update', { runId: 'run-1' })
  })

  it('skips duplicate completion for terminal runs', async () => {
    mockRuns.set('run-1', {
      id: 'run-1',
      taskId: 'task-1',
      status: 'completed',
      logs: [],
      tokenUsage: null,
      cost: null,
      completedAt: new Date()
    })

    const run = await service.completeRun('run-1', {
      success: true,
      tokenUsage: { prompt: 10, completion: 10, total: 20 }
    })

    expect(run.status).toBe('completed')
    expect(mockPrisma.run.update).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('throws when run does not exist', async () => {
    await expect(
      service.completeRun('missing-run', {
        success: false
      })
    ).rejects.toThrow('Run not found: missing-run')
  })
})


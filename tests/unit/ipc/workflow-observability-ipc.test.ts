import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleHookGovernanceGet,
  handleHookGovernanceSet
} from '../../../src/main/ipc/handlers/workflow-observability'

const mocks = vi.hoisted(() => ({
  getHookSystemStatus: vi.fn(),
  updateHookGovernance: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('../../../src/main/services/hooks', () => ({
  getHookSystemStatus: (...args: any[]) => mocks.getHookSystemStatus(...args),
  updateHookGovernance: (...args: any[]) => mocks.updateHookGovernance(...args)
}))

vi.mock('../../../src/main/services/workforce', () => ({
  WorkforceEngine: class {
    getWorkflowObservability = vi.fn()
  }
}))

describe('workflow observability hook governance handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns hook governance status from service', async () => {
    const status = { initialized: true, stats: {}, hooks: [], recentExecutions: [] }
    mocks.getHookSystemStatus.mockResolvedValueOnce(status)

    await expect(handleHookGovernanceGet({} as any)).resolves.toEqual(status)
    expect(mocks.getHookSystemStatus).toHaveBeenCalledTimes(1)
  })

  it('normalizes and forwards valid hook governance updates', async () => {
    const updateResult = { success: true, updated: ['hook-a'], skipped: [], status: {} }
    mocks.updateHookGovernance.mockResolvedValueOnce(updateResult)

    const payload = {
      hooks: [
        { id: ' hook-a ', enabled: true, priority: 5 },
        { id: 'hook-b', enabled: false },
        { id: 'hook-c', priority: 11 },
        { id: 'ignored-empty', extra: true },
        { id: '', enabled: true }
      ]
    }

    await expect(handleHookGovernanceSet({} as any, payload)).resolves.toEqual(updateResult)
    expect(mocks.updateHookGovernance).toHaveBeenCalledWith({
      hooks: [
        { id: 'hook-a', enabled: true, priority: 5 },
        { id: 'hook-b', enabled: false },
        { id: 'hook-c', priority: 11 }
      ]
    })
  })

  it('throws when hook governance input is invalid', async () => {
    await expect(handleHookGovernanceSet({} as any, null)).rejects.toThrow(
      'Invalid hook governance update input'
    )

    await expect(handleHookGovernanceSet({} as any, { hooks: [] })).rejects.toThrow(
      'No valid hook updates provided'
    )
  })
})

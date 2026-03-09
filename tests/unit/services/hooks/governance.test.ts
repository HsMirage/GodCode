import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpsert = vi.fn()
const mockFindUnique = vi.fn()
const mockInit = vi.fn().mockResolvedValue(undefined)

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: vi.fn(() => ({
      init: mockInit,
      getClient: () => ({
        systemSetting: {
          upsert: mockUpsert,
          findUnique: mockFindUnique
        }
      })
    }))
  }
}))

import {
  applyCachedHookGovernanceConfig,
  getHookSystemStatus,
  restorePersistedHookGovernance,
  updateHookGovernance
} from '@/main/services/hooks/governance'
import { hookManager } from '@/main/services/hooks/manager'
import type { HookConfig } from '@/main/services/hooks/types'

describe('hook governance service', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    hookManager.clear()
    mockUpsert.mockResolvedValue({})
    mockFindUnique.mockResolvedValue(null)
    await restorePersistedHookGovernance()
  })

  it('updates hook enablement, priority, and reliability strategy', async () => {
    const hook: HookConfig<'onToolStart'> = {
      id: 'governed-hook',
      name: 'Governed Hook',
      event: 'onToolStart',
      source: 'builtin',
      scope: 'tool',
      callback: async () => undefined
    }

    hookManager.register(hook)

    const result = await updateHookGovernance({
      hooks: [
        {
          id: 'governed-hook',
          enabled: false,
          priority: 3,
          strategy: {
            timeoutMs: 1500,
            failureThreshold: 2,
            cooldownMs: 9000
          }
        }
      ]
    })

    expect(result.success).toBe(true)
    expect(mockUpsert).toHaveBeenCalledTimes(1)

    const governedHook = result.status.hooks.find(item => item.id === 'governed-hook')
    expect(governedHook).toMatchObject({
      enabled: false,
      priority: 3,
      source: 'builtin',
      scope: 'tool',
      strategy: {
        timeoutMs: 1500,
        failureThreshold: 2,
        cooldownMs: 9000
      }
    })
  })

  it('restores persisted governance configuration for registered hooks', async () => {
    const hook: HookConfig<'onMessageCreate'> = {
      id: 'restore-hook',
      name: 'Restore Hook',
      event: 'onMessageCreate',
      callback: async () => undefined
    }

    hookManager.register(hook)
    mockFindUnique.mockResolvedValueOnce({
      value: JSON.stringify({
        version: 2,
        hooks: [
          {
            id: 'restore-hook',
            enabled: false,
            priority: 11,
            strategy: {
              timeoutMs: 1200,
              failureThreshold: 4,
              cooldownMs: 4000
            }
          }
        ]
      })
    })

    await restorePersistedHookGovernance()

    const restoredHook = getHookSystemStatus().hooks.find(item => item.id === 'restore-hook')
    expect(restoredHook).toMatchObject({
      enabled: false,
      priority: 11,
      strategy: {
        timeoutMs: 1200,
        failureThreshold: 4,
        cooldownMs: 4000
      }
    })
  })

  it('applies cached governance to hooks registered after restore', async () => {
    mockFindUnique.mockResolvedValueOnce({
      value: JSON.stringify({
        version: 2,
        hooks: [
          {
            id: 'late-hook',
            enabled: false,
            priority: 9,
            strategy: {
              timeoutMs: 800,
              failureThreshold: 2,
              cooldownMs: 2000
            }
          }
        ]
      })
    })

    await restorePersistedHookGovernance()

    const lateHook: HookConfig<'onToolEnd'> = {
      id: 'late-hook',
      name: 'Late Hook',
      event: 'onToolEnd',
      callback: async () => undefined
    }

    hookManager.register(lateHook)
    applyCachedHookGovernanceConfig()

    const restoredLateHook = getHookSystemStatus().hooks.find(item => item.id === 'late-hook')
    expect(restoredLateHook).toMatchObject({
      enabled: false,
      priority: 9,
      strategy: {
        timeoutMs: 800,
        failureThreshold: 2,
        cooldownMs: 2000
      }
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AGENT_STORE_DEDUPE_MAX_SIZE,
  getAgentStoreDedupeState,
  resetAgentStoreDedupeState,
  useAgentStore
} from '../../src/renderer/src/store/agent.store'

describe('Performance: renderer store memory guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAgentStoreDedupeState()
    useAgentStore.setState({ workLogs: {}, selectedAgentId: null })

    Object.defineProperty(window, 'codeall', {
      configurable: true,
      value: {
        invoke: vi.fn(async (channel: string, sessionId: string) => {
          if (channel !== 'task:list') {
            throw new Error(`Unexpected channel: ${channel}`)
          }

          expect(sessionId).toBe('session-memory')

          return Array.from({ length: 500 }, (_, index) => ({
            id: `task-${index}`,
            sessionId,
            type: 'subtask' as const,
            status: 'running' as const,
            input: `Task ${index}`,
            assignedAgent: 'haotian',
            createdAt: new Date(`2026-03-07T00:${String(index % 60).padStart(2, '0')}:00.000Z`),
            metadata: {
              orchestratorAgent: 'haotian',
              orchestratorCheckpoints: Array.from({ length: 3 }, (_unused, checkpointIndex) => ({
                timestamp: new Date(
                  2026,
                  2,
                  7,
                  0,
                  index % 60,
                  checkpointIndex
                ).toISOString(),
                phase: `phase-${index}-${checkpointIndex}`,
                status: checkpointIndex === 1 ? 'fallback' : 'continue',
                persistedTaskId: `persisted-${index}-${checkpointIndex}`
              }))
            }
          }))
        })
      }
    })
  })

  it('keeps dedupe sets within the configured cap during burst task updates', async () => {
    await useAgentStore.getState().fetchAgents('session-memory')

    const dedupeState = getAgentStoreDedupeState()

    expect(dedupeState.taskStatusSize).toBeLessThanOrEqual(AGENT_STORE_DEDUPE_MAX_SIZE)
    expect(dedupeState.taskStatusSize).toBe(500)
    expect(dedupeState.orchestratorCheckpointSize).toBeLessThanOrEqual(AGENT_STORE_DEDUPE_MAX_SIZE)
    expect(dedupeState.orchestratorCheckpointSize).toBeGreaterThanOrEqual(dedupeState.trimSize)
    expect(dedupeState.orchestratorCheckpointSize).toBeLessThan(1500)
  })
})

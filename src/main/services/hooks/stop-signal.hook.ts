import { logger } from '../../../shared/logger'
import { cancelAllTasks } from '../tools/background'
import type { HookConfig, HookContext, ToolExecutionInput } from './types'

let stopRequested = false
let listenersAttached = false
let cancelInFlight: Promise<void> | null = null

function requestStop(reason: string): void {
  stopRequested = true
  logger.warn('[stop-signal-hook] Stop requested', { reason })

  if (!cancelInFlight) {
    cancelInFlight = (async () => {
      try {
        await cancelAllTasks({ signal: 'SIGTERM' })
        logger.warn('[stop-signal-hook] Requested cancellation for running background tasks')
      } catch (error) {
        logger.error('[stop-signal-hook] Failed to cancel running background tasks', {
          error: error instanceof Error ? error.message : String(error)
        })
      } finally {
        cancelInFlight = null
      }
    })()
  }
}

function ensureSignalListeners(): void {
  if (listenersAttached) {
    return
  }

  listenersAttached = true
  process.on('SIGINT', () => requestStop('SIGINT'))
  process.on('SIGTERM', () => requestStop('SIGTERM'))
}

export function createStopSignalHook(): HookConfig<'onToolStart'> {
  ensureSignalListeners()

  return {
    id: 'stop-signal-hook',
    name: 'Stop Signal Hook',
    event: 'onToolStart',
    description:
      'Skips new tool calls after stop/abort signals and requests running task cancellation',
    priority: 1,
    callback: async (
      context: HookContext,
      input: ToolExecutionInput
    ): Promise<{ skip?: boolean }> => {
      if (!stopRequested) {
        return {}
      }

      logger.warn('[stop-signal-hook] Blocking tool call after stop request', {
        sessionId: context.sessionId,
        tool: input.tool,
        callId: input.callId
      })

      return { skip: true }
    }
  }
}

export function isStopSignalRequested(): boolean {
  return stopRequested
}

export function resetStopSignal(): void {
  stopRequested = false
}

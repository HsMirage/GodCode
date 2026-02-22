/**
 * IPC Channel Alignment Test
 *
 * Ensures that preload whitelist and IPC handler registrations are in sync.
 * This test acts as a CI guard against future mismatches.
 */

import { describe, it, expect } from 'vitest'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '@shared/ipc-channels'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('IPC Channel Alignment', () => {
  const preloadSource = readFileSync(resolve(process.cwd(), 'src/main/preload.ts'), 'utf-8')
  const mainIpcIndexSource = readFileSync(resolve(process.cwd(), 'src/main/ipc/index.ts'), 'utf-8')
  const auditLogHandlerSource = readFileSync(resolve(process.cwd(), 'src/main/ipc/handlers/audit-log.ts'), 'utf-8')
  const auditLogExportHandlerSource = readFileSync(
    resolve(process.cwd(), 'src/main/ipc/handlers/audit-log-export.ts'),
    'utf-8'
  )
  const sessionContinuityHandlerSource = readFileSync(
    resolve(process.cwd(), 'src/main/ipc/handlers/session-continuity.ts'),
    'utf-8'
  )

  const expectPreloadContains = (channel: string) => {
    expect(preloadSource).toContain(`'${channel}'`)
  }

  const expectMainIpcContains = (channel: string) => {
    const channelEntry = Object.entries(INVOKE_CHANNELS).find(([, value]) => value === channel)
    const channelKey = channelEntry?.[0]

    const hasLiteral = mainIpcIndexSource.includes(`'${channel}'`)
    const hasConstantRef = channelKey
      ? mainIpcIndexSource.includes(`INVOKE_CHANNELS.${channelKey}`)
      : false

    expect(hasLiteral || hasConstantRef).toBe(true)
  }

  describe('INVOKE_CHANNELS', () => {
    it('should have all invoke channels defined', () => {
      expect(Object.keys(INVOKE_CHANNELS).length).toBeGreaterThan(0)
    })

    it('should have unique channel values', () => {
      const values = Object.values(INVOKE_CHANNELS)
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })

    it('should follow naming convention (lowercase, optional colon)', () => {
      const values = Object.values(INVOKE_CHANNELS)
      for (const value of values) {
        // Allow simple channels like 'ping' or prefixed like 'space:create'
        expect(value).toMatch(/^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/)
      }
    })
  })

  describe('EVENT_CHANNELS', () => {
    it('should have all event channels defined', () => {
      expect(Object.keys(EVENT_CHANNELS).length).toBeGreaterThan(0)
    })

    it('should have unique channel values', () => {
      const values = Object.values(EVENT_CHANNELS)
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })

    it('should follow naming convention (lowercase, optional colon)', () => {
      const values = Object.values(EVENT_CHANNELS)
      for (const value of values) {
        // Allow simple channels like 'ping' or prefixed like 'browser:state-changed'
        expect(value).toMatch(/^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/)
      }
    })
  })

  describe('Channel Separation', () => {
    it('should not have overlapping values between INVOKE and EVENT channels', () => {
      const invokeValues = new Set(Object.values(INVOKE_CHANNELS) as string[])
      const eventValues = Object.values(EVENT_CHANNELS) as string[]

      for (const eventValue of eventValues) {
        expect(invokeValues.has(eventValue)).toBe(false)
      }
    })
  })

  describe('Contract Alignment with Main/Preload', () => {
    it('should keep selected invoke channels aligned across shared, main registration, and preload allowlist', () => {
      const channels = [
        INVOKE_CHANNELS.TASK_CONTINUATION_GET_STATUS,
        INVOKE_CHANNELS.TASK_CONTINUATION_ABORT,
        INVOKE_CHANNELS.TASK_CONTINUATION_SET_TODOS,
        INVOKE_CHANNELS.PROVIDER_CACHE_GET_STATS,
        INVOKE_CHANNELS.PROVIDER_CACHE_IS_CONNECTED,
        INVOKE_CHANNELS.PROVIDER_CACHE_GET_AVAILABLE_MODELS,
        INVOKE_CHANNELS.PROVIDER_CACHE_SET_STATUS,
        INVOKE_CHANNELS.WORKFLOW_OBSERVABILITY_GET
      ]

      for (const channel of channels) {
        expectPreloadContains(channel)
        expectMainIpcContains(channel)
      }

      const auditChannels = [
        INVOKE_CHANNELS.AUDIT_LOG_QUERY,
        INVOKE_CHANNELS.AUDIT_LOG_GET_BY_ENTITY,
        INVOKE_CHANNELS.AUDIT_LOG_GET_BY_SESSION,
        INVOKE_CHANNELS.AUDIT_LOG_GET_RECENT,
        INVOKE_CHANNELS.AUDIT_LOG_COUNT,
        INVOKE_CHANNELS.AUDIT_LOG_GET_FAILED,
        INVOKE_CHANNELS.AUDIT_LOG_EXPORT
      ]

      for (const channel of auditChannels) {
        expectPreloadContains(channel)
      }

      expect(mainIpcIndexSource).toContain('registerAuditLogHandlers()')
      expect(mainIpcIndexSource).toContain('registerAuditLogExportHandlers()')
      expect(auditLogHandlerSource).toContain(`'${INVOKE_CHANNELS.AUDIT_LOG_QUERY}'`)
      expect(auditLogHandlerSource).toContain(`'${INVOKE_CHANNELS.AUDIT_LOG_COUNT}'`)
      expect(auditLogExportHandlerSource).toContain(`'${INVOKE_CHANNELS.AUDIT_LOG_EXPORT}'`)

      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_STATE_GET')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_STATE_CHECKPOINT')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RECOVERY_PLAN')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RECOVERY_EXECUTE')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RECOVERABLE_LIST')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RESUME_PROMPT')
    })

    it('should keep selected event channels aligned across shared and preload allowlist', () => {
      const eventChannels = [
        EVENT_CHANNELS.MESSAGE_STREAM_ERROR,
        EVENT_CHANNELS.MESSAGE_STREAM_USAGE,
        EVENT_CHANNELS.BACKGROUND_TASK_STARTED,
        EVENT_CHANNELS.BACKGROUND_TASK_OUTPUT,
        EVENT_CHANNELS.BACKGROUND_TASK_COMPLETED,
        EVENT_CHANNELS.BACKGROUND_TASK_CANCELLED
      ]

      for (const channel of eventChannels) {
        expectPreloadContains(channel)
      }
    })
  })

  describe('Core Channels Presence', () => {
    it('should include core space operations', () => {
      expect(INVOKE_CHANNELS.SPACE_CREATE).toBe('space:create')
      expect(INVOKE_CHANNELS.SPACE_LIST).toBe('space:list')
      expect(INVOKE_CHANNELS.SPACE_GET).toBe('space:get')
    })

    it('should include core session operations', () => {
      expect(INVOKE_CHANNELS.SESSION_CREATE).toBe('session:create')
      expect(INVOKE_CHANNELS.SESSION_LIST).toBe('session:list')
      expect(INVOKE_CHANNELS.SESSION_UPDATE).toBe('session:update')
      expect(INVOKE_CHANNELS.SESSION_DELETE).toBe('session:delete')
    })

    it('should include core message operations', () => {
      expect(INVOKE_CHANNELS.MESSAGE_SEND).toBe('message:send')
      expect(INVOKE_CHANNELS.MESSAGE_LIST).toBe('message:list')
    })

    it('should include core task operations', () => {
      expect(INVOKE_CHANNELS.TASK_CREATE).toBe('task:create')
      expect(INVOKE_CHANNELS.TASK_GET).toBe('task:get')
      expect(INVOKE_CHANNELS.TASK_LIST).toBe('task:list')
      expect(INVOKE_CHANNELS.TASK_UPDATE).toBe('task:update')
    })
  })
})

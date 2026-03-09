/**
 * IPC Channel Alignment Test
 *
 * Ensures that the Single Source of Truth (ipc-channels.ts) is properly consumed
 * by both the production preload (src/preload/api.ts) and IPC handler registrations.
 * This test acts as a CI guard against future mismatches.
 */

import { describe, it, expect } from 'vitest'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '@shared/ipc-channels'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('IPC Channel Alignment', () => {
  const preloadApiSource = readFileSync(resolve(process.cwd(), 'src/preload/api.ts'), 'utf-8')
  const preloadIndexSource = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf-8')
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
  const updaterHandlerSource = readFileSync(
    resolve(process.cwd(), 'src/main/ipc/handlers/updater.ts'),
    'utf-8'
  )
  const browserHandlerSource = readFileSync(
    resolve(process.cwd(), 'src/main/ipc/handlers/browser.ts'),
    'utf-8'
  )

  const allInvokeChannels = new Set(Object.values(INVOKE_CHANNELS) as string[])
  const allEventChannels = new Set(Object.values(EVENT_CHANNELS) as string[])

  const expectInSSoT = (channel: string) => {
    expect(allInvokeChannels.has(channel) || allEventChannels.has(channel)).toBe(true)
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

  describe('Production Preload Structure', () => {
    it('should derive allowed channels from ipc-channels.ts SSoT', () => {
      expect(preloadApiSource).toContain("from '../shared/ipc-channels'")
      expect(preloadApiSource).toContain('INVOKE_CHANNELS')
      expect(preloadApiSource).toContain('EVENT_CHANNELS')
      expect(preloadApiSource).toContain('Object.values(INVOKE_CHANNELS)')
      expect(preloadApiSource).toContain('Object.values(EVENT_CHANNELS)')
    })

    it('should not have a hardcoded channel allowlist', () => {
      expect(preloadApiSource).not.toMatch(/ALLOWED_CHANNELS\s*=\s*\[/)
    })

    it('should expose API via contextBridge in index.ts', () => {
      expect(preloadIndexSource).toContain('createCodeAllAPI')
      expect(preloadIndexSource).toContain('contextBridge.exposeInMainWorld')
    })

    it('should not have a duplicate preload at src/main/preload.ts', () => {
      let exists = true
      try {
        readFileSync(resolve(process.cwd(), 'src/main/preload.ts'), 'utf-8')
      } catch {
        exists = false
      }
      expect(exists).toBe(false)
    })
  })

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
        expect(value).toMatch(/^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/)
      }
    })
  })

  describe('Channel Separation', () => {
    it('should not have overlapping values between INVOKE and EVENT channels', () => {
      const eventValues = Object.values(EVENT_CHANNELS) as string[]

      for (const eventValue of eventValues) {
        expect(allInvokeChannels.has(eventValue)).toBe(false)
      }
    })
  })

  describe('Contract Alignment with Main Handlers', () => {
    it('should keep selected invoke channels registered in main IPC index', () => {
      const channels = [
        INVOKE_CHANNELS.SKILL_COMMAND_ITEMS,
        INVOKE_CHANNELS.TASK_CONTINUATION_GET_STATUS,
        INVOKE_CHANNELS.TASK_CONTINUATION_ABORT,
        INVOKE_CHANNELS.TASK_CONTINUATION_SET_TODOS,
        INVOKE_CHANNELS.PROVIDER_CACHE_GET_STATS,
        INVOKE_CHANNELS.PROVIDER_CACHE_IS_CONNECTED,
        INVOKE_CHANNELS.PROVIDER_CACHE_GET_AVAILABLE_MODELS,
        INVOKE_CHANNELS.PROVIDER_CACHE_SET_STATUS,
        INVOKE_CHANNELS.WORKFLOW_OBSERVABILITY_GET,
        INVOKE_CHANNELS.HOOK_GOVERNANCE_GET,
        INVOKE_CHANNELS.HOOK_GOVERNANCE_SET
      ]

      for (const channel of channels) {
        expectInSSoT(channel)
        expectMainIpcContains(channel)
      }
    })

    it('should have audit log channels registered in dedicated handler files', () => {
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
        expectInSSoT(channel)
      }

      expect(mainIpcIndexSource).toContain('registerAuditLogHandlers()')
      expect(mainIpcIndexSource).toContain('registerAuditLogExportHandlers()')
      expect(auditLogHandlerSource).toContain(`'${INVOKE_CHANNELS.AUDIT_LOG_QUERY}'`)
      expect(auditLogHandlerSource).toContain(`'${INVOKE_CHANNELS.AUDIT_LOG_COUNT}'`)
      expect(auditLogExportHandlerSource).toContain(`'${INVOKE_CHANNELS.AUDIT_LOG_EXPORT}'`)
    })

    it('should have session continuity channels registered in dedicated handler file', () => {
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_STATE_GET')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_STATE_CHECKPOINT')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RECOVERY_PLAN')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RECOVERY_EXECUTE')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RECOVERABLE_LIST')
      expect(sessionContinuityHandlerSource).toContain('INVOKE_CHANNELS.SESSION_RESUME_PROMPT')
    })

    it('should have browser:list-tabs registered in browser handler', () => {
      expectInSSoT(INVOKE_CHANNELS.BROWSER_LIST_TABS)
      expect(browserHandlerSource).toContain(`'${INVOKE_CHANNELS.BROWSER_LIST_TABS}'`)
    })

    it('should have updater channels registered in dedicated handler file', () => {
      const updaterChannels = [
        INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES,
        INVOKE_CHANNELS.UPDATER_DOWNLOAD_UPDATE,
        INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL
      ]

      for (const channel of updaterChannels) {
        expectInSSoT(channel)
      }

      expect(mainIpcIndexSource).toContain('registerUpdaterHandlers(mainWindow)')
      expect(updaterHandlerSource).toContain('EVENT_CHANNELS.UPDATER_CHECKING_FOR_UPDATE')
      expect(updaterHandlerSource).toContain('EVENT_CHANNELS.UPDATER_UPDATE_AVAILABLE')
      expect(updaterHandlerSource).toContain('EVENT_CHANNELS.UPDATER_DOWNLOAD_PROGRESS')
      expect(updaterHandlerSource).toContain('EVENT_CHANNELS.UPDATER_UPDATE_DOWNLOADED')
    })

    it('should keep selected event channels in SSoT', () => {
      const eventChannels = [
        EVENT_CHANNELS.MESSAGE_STREAM_ERROR,
        EVENT_CHANNELS.MESSAGE_STREAM_USAGE,
        EVENT_CHANNELS.BACKGROUND_TASK_STARTED,
        EVENT_CHANNELS.BACKGROUND_TASK_OUTPUT,
        EVENT_CHANNELS.BACKGROUND_TASK_COMPLETED,
        EVENT_CHANNELS.BACKGROUND_TASK_CANCELLED,
        EVENT_CHANNELS.HOOK_AUDIT_APPENDED
      ]

      for (const channel of eventChannels) {
        expectInSSoT(channel)
      }
    })
  })

  describe('Browser Channels Presence', () => {
    it('should include browser:list-tabs in INVOKE_CHANNELS', () => {
      expect(INVOKE_CHANNELS.BROWSER_LIST_TABS).toBe('browser:list-tabs')
    })

    it('should include all browser invoke channels in SSoT', () => {
      const browserChannels = Object.entries(INVOKE_CHANNELS)
        .filter(([key]) => key.startsWith('BROWSER_'))
        .map(([, value]) => value)

      for (const channel of browserChannels) {
        expectInSSoT(channel)
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

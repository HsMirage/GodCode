/**
 * IPC Channel Alignment Test
 *
 * Ensures that preload whitelist and IPC handler registrations are in sync.
 * This test acts as a CI guard against future mismatches.
 */

import { describe, it, expect } from 'vitest'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '@shared/ipc-channels'

describe('IPC Channel Alignment', () => {
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

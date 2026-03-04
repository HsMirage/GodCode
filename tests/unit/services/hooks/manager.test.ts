import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HookManager } from '@/main/services/hooks/manager'
import type { HookConfig } from '@/main/services/hooks/types'

const mockAuditLogWrite = vi.fn()

vi.mock('@/main/services/audit-log.service', () => ({
  AuditLogService: {
    getInstance: vi.fn(() => ({
      log: mockAuditLogWrite
    }))
  }
}))

describe('HookManager execution audits', () => {
  let manager: HookManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditLogWrite.mockResolvedValue({})
    manager = HookManager.getInstance()
    manager.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should record strategy, execution, and result for successful onToolStart', async () => {
    const hook: HookConfig<'onToolStart'> = {
      id: 'audit-tool-start-success',
      name: 'Audit Tool Start Success',
      event: 'onToolStart',
      priority: 7,
      enabled: true,
      callback: async () => ({ modified: { tool: 'edited-tool' } })
    }

    manager.register(hook)

    await manager.emitToolStart(
      {
        sessionId: 'session-1',
        workspaceDir: '/tmp/workspace',
        userId: 'user-1'
      },
      {
        tool: 'original-tool',
        callId: 'call-1',
        params: { value: 1 }
      }
    )

    const audits = manager.getRecentExecutionAudits(10)
    expect(audits).toHaveLength(1)

    const [record] = audits
    expect(record.strategy).toMatchObject({
      hookId: 'audit-tool-start-success',
      hookName: 'Audit Tool Start Success',
      event: 'onToolStart',
      priority: 7,
      enabled: true
    })
    expect(record.execution).toMatchObject({
      sessionId: 'session-1',
      workspaceDir: '/tmp/workspace',
      userId: 'user-1',
      tool: 'edited-tool',
      callId: 'call-1'
    })
    expect(record.result.success).toBe(true)
    expect(record.result.duration).toBeGreaterThanOrEqual(0)
    expect(record.result.returnValuePreview).toContain('edited-tool')

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockAuditLogWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'hook:execution',
        entityType: 'hook',
        entityId: 'audit-tool-start-success',
        sessionId: 'session-1',
        success: true,
        metadata: expect.objectContaining({
          strategy: expect.objectContaining({ hookId: 'audit-tool-start-success' }),
          execution: expect.objectContaining({ sessionId: 'session-1' }),
          result: expect.objectContaining({ success: true })
        })
      })
    )
  })

  it('should record failure details when hook callback throws', async () => {
    const hook: HookConfig<'onToolEnd'> = {
      id: 'audit-tool-end-failure',
      name: 'Audit Tool End Failure',
      event: 'onToolEnd',
      callback: async () => {
        throw new Error('hook failed')
      }
    }

    manager.register(hook)

    await manager.emitToolEnd(
      {
        sessionId: 'session-2',
        workspaceDir: '/tmp/workspace-2'
      },
      {
        tool: 'bash',
        callId: 'call-2',
        params: {}
      },
      {
        title: 'ok',
        output: 'done',
        success: true
      }
    )

    const audits = manager.getRecentExecutionAudits(10)
    expect(audits).toHaveLength(1)

    const [record] = audits
    expect(record.strategy.hookId).toBe('audit-tool-end-failure')
    expect(record.execution).toMatchObject({
      sessionId: 'session-2',
      workspaceDir: '/tmp/workspace-2',
      tool: 'bash',
      callId: 'call-2'
    })
    expect(record.result.success).toBe(false)
    expect(record.result.status).toBe('error')
    expect(record.result.degraded).toBe(true)
    expect(record.result.error).toBe('hook failed')
    expect(record.result.duration).toBeGreaterThanOrEqual(0)
  })

  it('should emit execution-audit-appended event when audit is recorded', async () => {
    const hook: HookConfig<'onMessageCreate'> = {
      id: 'audit-event-emitter',
      name: 'Audit Event Emitter',
      event: 'onMessageCreate',
      callback: async () => undefined
    }

    const listener = vi.fn()
    const unsubscribe = manager.onExecutionAuditAppended(listener)

    manager.register(hook)
    await manager.emitMessageCreate(
      {
        sessionId: 'session-emitter',
        workspaceDir: '/tmp/workspace-emitter'
      },
      {
        id: 'msg-emitter',
        role: 'assistant',
        content: 'hello'
      }
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({
      strategy: expect.objectContaining({ hookId: 'audit-event-emitter' }),
      execution: expect.objectContaining({ sessionId: 'session-emitter' }),
      result: expect.objectContaining({ success: true })
    })

    unsubscribe()
  })


  it('should mark timeout as degraded and continue to next hook', async () => {
    vi.useFakeTimers()

    const timeoutHook: HookConfig<'onMessageCreate'> = {
      id: 'audit-timeout-hook',
      name: 'Audit Timeout Hook',
      event: 'onMessageCreate',
      callback: async () => {
        await new Promise(resolve => setTimeout(resolve, 2100))
      }
    }

    const fastHook: HookConfig<'onMessageCreate'> = {
      id: 'audit-after-timeout-hook',
      name: 'Audit After Timeout Hook',
      event: 'onMessageCreate',
      callback: async () => ({ inject: 'ok' })
    }

    manager.register(timeoutHook)
    manager.register(fastHook)

    const emitPromise = manager.emitMessageCreate(
      {
        sessionId: 'session-timeout',
        workspaceDir: '/tmp/workspace-timeout'
      },
      {
        id: 'msg-timeout',
        role: 'assistant',
        content: 'hello'
      }
    )

    await vi.advanceTimersByTimeAsync(2500)
    const result = await emitPromise

    expect(result.hookResults).toHaveLength(2)
    expect(result.hookResults[0]).toMatchObject({
      hookId: 'audit-timeout-hook',
      success: false,
      status: 'timeout',
      degraded: true
    })
    expect(result.hookResults[1]).toMatchObject({
      hookId: 'audit-after-timeout-hook',
      success: true,
      status: 'success',
      degraded: false
    })

    const audits = manager.getRecentExecutionAudits(10)
    const timeoutAudit = audits.find(item => item.strategy.hookId === 'audit-timeout-hook')
    expect(timeoutAudit?.result.status).toBe('timeout')
    expect(timeoutAudit?.result.degraded).toBe(true)
  })

  it('should open circuit after repeated failures and skip subsequent execution', async () => {
    const flakyHook: HookConfig<'onToolStart'> = {
      id: 'audit-circuit-hook',
      name: 'Audit Circuit Hook',
      event: 'onToolStart',
      callback: async () => {
        throw new Error('always fail')
      }
    }

    manager.register(flakyHook)

    const context = {
      sessionId: 'session-circuit',
      workspaceDir: '/tmp/workspace-circuit'
    }

    const input = {
      tool: 'bash',
      callId: 'call-circuit',
      params: {}
    }

    await manager.emitToolStart(context, input)
    await manager.emitToolStart(context, input)
    await manager.emitToolStart(context, input)

    const fourth = await manager.emitToolStart(context, input)
    const skipped = fourth.hookResults[0]

    expect(skipped).toMatchObject({
      hookId: 'audit-circuit-hook',
      success: false,
      status: 'circuit_open',
      degraded: true,
      duration: 0
    })
    expect(skipped.circuitOpenUntil).toBeDefined()

    const audits = manager.getRecentExecutionAudits(20)
    const circuitAudit = audits.find(item => item.result.status === 'circuit_open')
    expect(circuitAudit?.result.degraded).toBe(true)
    expect(circuitAudit?.result.circuitOpenUntil).toBeDefined()
  })

  it('should clear execution audits when manager is cleared', async () => {
    const hook: HookConfig<'onMessageCreate'> = {
      id: 'audit-message-create',
      name: 'Audit Message Create',
      event: 'onMessageCreate',
      callback: async () => undefined
    }

    manager.register(hook)

    await manager.emitMessageCreate(
      {
        sessionId: 'session-3',
        workspaceDir: '/tmp/workspace-3'
      },
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'hello'
      }
    )

    expect(manager.getRecentExecutionAudits(10)).toHaveLength(1)

    manager.clear()

    expect(manager.getRecentExecutionAudits(10)).toHaveLength(0)
  })
})

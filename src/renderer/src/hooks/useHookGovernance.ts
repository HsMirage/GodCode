import { useCallback, useEffect, useState } from 'react'
import { settingsApi } from '../api'
import type {
  HookGovernanceAuditRecord,
  HookGovernanceItem,
  HookGovernanceStatus
} from '@shared/hook-governance-contract'

export interface HookGovernanceDraftItem {
  enabled: boolean
  priority: number
  timeoutMs: number
  failureThreshold: number
  cooldownMs: number
}

function buildHookDraftItem(hook: HookGovernanceItem): HookGovernanceDraftItem {
  return {
    enabled: hook.enabled,
    priority: hook.priority,
    timeoutMs: hook.strategy.timeoutMs,
    failureThreshold: hook.strategy.failureThreshold,
    cooldownMs: hook.strategy.cooldownMs
  }
}

export function useHookGovernance() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [governance, setGovernance] = useState<HookGovernanceStatus | null>(null)
  const [draft, setDraft] = useState<Record<string, HookGovernanceDraftItem>>({})

  const hookGovernanceDirty =
    governance !== null &&
    governance.hooks.some(hook => {
      const d = draft[hook.id]
      if (!d) return false
      return (
        d.enabled !== hook.enabled ||
        d.priority !== hook.priority ||
        d.timeoutMs !== hook.strategy.timeoutMs ||
        d.failureThreshold !== hook.strategy.failureThreshold ||
        d.cooldownMs !== hook.strategy.cooldownMs
      )
    })

  const load = useCallback(async () => {
    if (!window.godcode) return

    try {
      setLoading(true)
      const result = (await settingsApi.hookGovernanceGet()) as HookGovernanceStatus
      setGovernance(result)
      setDraft(
        result.hooks.reduce<Record<string, HookGovernanceDraftItem>>((acc, hook) => {
          acc[hook.id] = buildHookDraftItem(hook)
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Failed to load hook governance:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async () => {
    if (!window.godcode || !governance) return

    try {
      setSaving(true)
      const hooks: Array<{
        id: string
        enabled?: boolean
        priority?: number
        strategy?: {
          timeoutMs?: number
          failureThreshold?: number
          cooldownMs?: number
        }
      }> = []

      for (const hook of governance.hooks) {
        const d = draft[hook.id]
        if (!d) continue
        const changes: (typeof hooks)[number] = { id: hook.id }
        if (d.enabled !== hook.enabled) changes.enabled = d.enabled
        if (d.priority !== hook.priority) changes.priority = d.priority
        if (
          d.timeoutMs !== hook.strategy.timeoutMs ||
          d.failureThreshold !== hook.strategy.failureThreshold ||
          d.cooldownMs !== hook.strategy.cooldownMs
        ) {
          changes.strategy = {
            timeoutMs: d.timeoutMs,
            failureThreshold: d.failureThreshold,
            cooldownMs: d.cooldownMs
          }
        }
        if (Object.keys(changes).length > 1) {
          hooks.push(changes)
        }
      }

      if (hooks.length === 0) return

      await settingsApi.hookGovernanceSet({ hooks })
      await load()
    } catch (error) {
      console.error('Failed to save hook governance:', error)
      throw error
    } finally {
      setSaving(false)
    }
  }, [governance, draft, load])

  const updateDraft = useCallback(
    (hookId: string, field: keyof HookGovernanceDraftItem, value: number | boolean) => {
      setDraft(prev => ({
        ...prev,
        [hookId]: { ...prev[hookId], [field]: value }
      }))
    },
    []
  )

  const resetDraft = useCallback(() => {
    if (!governance) {
      return
    }

    setDraft(
      governance.hooks.reduce<Record<string, HookGovernanceDraftItem>>((acc, hook) => {
        acc[hook.id] = buildHookDraftItem(hook)
        return acc
      }, {})
    )
  }, [governance])

  const appendRecentExecution = useCallback((record: HookGovernanceAuditRecord) => {
    setGovernance(prev => {
      if (!prev) return prev

      const normalizedTimestamp = new Date(record.timestamp)
      const resolvedTimestamp = Number.isNaN(normalizedTimestamp.getTime())
        ? record.timestamp
        : normalizedTimestamp

      const next = [record, ...prev.recentExecutions.filter(item => item.id !== record.id)].slice(
        0,
        50
      )

      return {
        ...prev,
        hooks: prev.hooks.map(hook => {
          if (hook.id !== record.strategy.hookId) return hook

          return {
            ...hook,
            runtime: {
              ...hook.runtime,
              lastStatus: record.result.status,
              lastDurationMs: record.result.duration,
              lastError: record.result.error,
              lastExecutedAt:
                record.result.status === 'circuit_open' ? hook.runtime.lastExecutedAt : resolvedTimestamp,
              circuitState: record.result.status === 'circuit_open' ? 'open' : hook.runtime.circuitState,
              circuitOpenUntil: record.result.circuitOpenUntil ?? hook.runtime.circuitOpenUntil
            },
            audit: {
              ...hook.audit,
              lastAuditAt: resolvedTimestamp,
              lastStatus: record.result.status,
              executionCount: hook.audit.executionCount + 1,
              errorCount:
                record.result.status !== 'success'
                  ? hook.audit.errorCount + 1
                  : hook.audit.errorCount
            }
          }
        }),
        recentExecutions: next
      }
    })
  }, [])

  useEffect(() => {
    if (!window.godcode) return
    const remove = settingsApi.onHookAuditAppended((data: { record: HookGovernanceAuditRecord }) => {
      if (data?.record) appendRecentExecution(data.record)
    })
    return remove
  }, [appendRecentExecution])

  return {
    governance,
    draft,
    loading,
    saving,
    hookGovernanceDirty,
    load,
    save,
    resetDraft,
    updateDraft,
    appendRecentExecution
  }
}

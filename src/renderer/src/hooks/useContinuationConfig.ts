import { useCallback, useState } from 'react'
import { workflowApi } from '../api'

export interface ContinuationConfigState {
  countdownSeconds: number
  idleDedupWindowMs: number
  abortWindowMs: number
}

const DEFAULT_CONFIG: ContinuationConfigState = {
  countdownSeconds: 2,
  idleDedupWindowMs: 500,
  abortWindowMs: 3000
}

function normalizeNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function normalizeConfig(
  value: Partial<ContinuationConfigState> | null | undefined,
  fallback: ContinuationConfigState
): ContinuationConfigState {
  const countdown = normalizeNonNegativeInt(
    value?.countdownSeconds ?? fallback.countdownSeconds,
    fallback.countdownSeconds
  )
  return {
    countdownSeconds: Math.max(1, countdown),
    idleDedupWindowMs: normalizeNonNegativeInt(
      value?.idleDedupWindowMs ?? fallback.idleDedupWindowMs,
      fallback.idleDedupWindowMs
    ),
    abortWindowMs: normalizeNonNegativeInt(
      value?.abortWindowMs ?? fallback.abortWindowMs,
      fallback.abortWindowMs
    )
  }
}

export function useContinuationConfig() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<ContinuationConfigState>(DEFAULT_CONFIG)
  const [draft, setDraft] = useState<ContinuationConfigState>(DEFAULT_CONFIG)

  const isDirty =
    draft.countdownSeconds !== config.countdownSeconds ||
    draft.idleDedupWindowMs !== config.idleDedupWindowMs ||
    draft.abortWindowMs !== config.abortWindowMs

  const load = useCallback(async () => {
    if (!window.godcode) return

    try {
      setLoading(true)
      const result = await workflowApi.continuationGetConfig()
      const parsed = result as { success: boolean; data?: Partial<ContinuationConfigState> }
      const normalized = normalizeConfig(parsed.success ? parsed.data : undefined, DEFAULT_CONFIG)
      setConfig(normalized)
      setDraft(normalized)
    } catch (error) {
      console.error('Failed to load continuation config:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async () => {
    if (!window.godcode) return

    try {
      setSaving(true)
      const payload = normalizeConfig(draft, config)
      const result = await workflowApi.continuationSetConfig(payload as unknown as Record<string, unknown>)
      const parsed = result as { success: boolean; data?: Partial<ContinuationConfigState> }
      const normalized = normalizeConfig(parsed.success ? parsed.data : payload, payload)
      setConfig(normalized)
      setDraft(normalized)
    } catch (error) {
      console.error('Failed to save continuation config:', error)
      throw error
    } finally {
      setSaving(false)
    }
  }, [draft, config])

  const reset = useCallback(() => {
    setDraft(config)
  }, [config])

  const updateField = useCallback(
    (key: keyof ContinuationConfigState, value: number) => {
      setDraft(prev => {
        const base = normalizeConfig(prev, config)
        const nextValue = normalizeNonNegativeInt(value, base[key])
        return { ...base, [key]: key === 'countdownSeconds' ? Math.max(1, nextValue) : nextValue }
      })
    },
    [config]
  )

  const handleInputChange = useCallback(
    (key: keyof ContinuationConfigState, raw: string) => {
      if (raw.trim() === '') {
        updateField(key, config[key])
        return
      }
      const value = Number(raw)
      if (!Number.isNaN(value)) updateField(key, value)
    },
    [config, updateField]
  )

  const handleInputBlur = useCallback(
    (key: keyof ContinuationConfigState) => {
      updateField(key, draft[key])
    },
    [draft, updateField]
  )

  return {
    config,
    draft,
    loading,
    saving,
    isDirty,
    load,
    save,
    reset,
    updateField,
    handleInputChange,
    handleInputBlur
  }
}

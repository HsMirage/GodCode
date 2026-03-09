import { z } from 'zod'
import {
  DEFAULT_HOOK_COOLDOWN_MS,
  DEFAULT_HOOK_FAILURE_THRESHOLD,
  DEFAULT_HOOK_TIMEOUT_MS,
  HOOK_GOVERNANCE_CONFIG_VERSION,
  type HookGovernanceAuditSummary,
  type HookGovernanceItem,
  type HookGovernanceStatus,
  type HookGovernanceUpdateInput,
  type HookGovernanceUpdateItem,
  type HookGovernanceUpdateResult,
  type HookReliabilityPolicy,
  type PersistedHookGovernanceConfig
} from '@/shared/hook-governance-contract'
import { logger } from '../../../shared/logger'
import { DatabaseService } from '../database'
import { SETTING_KEYS } from '@/main/services/settings/schema-registry'
import { hookManager } from './manager'

const HOOK_GOVERNANCE_SETTING_KEY = SETTING_KEYS.HOOK_GOVERNANCE_CONFIG

const strategyPatchSchema = z
  .object({
    timeoutMs: z.number().finite().optional(),
    failureThreshold: z.number().finite().optional(),
    cooldownMs: z.number().finite().optional()
  })
  .partial()

const hookGovernanceUpdateItemSchema = z
  .object({
    id: z.string().trim().min(1),
    enabled: z.boolean().optional(),
    priority: z.number().finite().optional(),
    strategy: strategyPatchSchema.optional(),
    timeoutMs: z.number().finite().optional(),
    failureThreshold: z.number().finite().optional(),
    cooldownMs: z.number().finite().optional()
  })
  .transform(item => {
    const normalized: HookGovernanceUpdateItem = {
      id: item.id.trim()
    }

    if (typeof item.enabled === 'boolean') {
      normalized.enabled = item.enabled
    }

    if (typeof item.priority === 'number' && Number.isFinite(item.priority)) {
      normalized.priority = normalizePriority(item.priority)
    }

    const normalizedStrategy = normalizeStrategyPatch(
      item.strategy ?? {
        timeoutMs: item.timeoutMs,
        failureThreshold: item.failureThreshold,
        cooldownMs: item.cooldownMs
      }
    )

    if (normalizedStrategy) {
      normalized.strategy = normalizedStrategy
    }

    return normalized
  })
  .refine(
    item =>
      item.enabled !== undefined ||
      item.priority !== undefined ||
      (item.strategy !== undefined && Object.keys(item.strategy).length > 0),
    'No valid hook updates provided'
  )

const hookGovernanceRawInputSchema = z.object({
  hooks: z.array(z.unknown())
})

const persistedHookGovernanceRawConfigSchema = z.object({
  version: z.number().int().positive().default(HOOK_GOVERNANCE_CONFIG_VERSION),
  hooks: z.array(z.unknown()).default([])
})

let cachedPersistedHookGovernanceConfig: PersistedHookGovernanceConfig | null = null

function normalizePriority(value: number): number {
  if (!Number.isFinite(value)) {
    return 100
  }

  return Math.max(1, Math.floor(value))
}

function normalizeStrategyValue(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.floor(value as number))
}

function resolveStrategy(strategy?: Partial<HookReliabilityPolicy>): HookReliabilityPolicy {
  return {
    timeoutMs: normalizeStrategyValue(strategy?.timeoutMs, DEFAULT_HOOK_TIMEOUT_MS),
    failureThreshold: normalizeStrategyValue(strategy?.failureThreshold, DEFAULT_HOOK_FAILURE_THRESHOLD),
    cooldownMs: normalizeStrategyValue(strategy?.cooldownMs, DEFAULT_HOOK_COOLDOWN_MS)
  }
}

function normalizeStrategyPatch(strategy?: Partial<HookReliabilityPolicy>): Partial<HookReliabilityPolicy> | undefined {
  if (!strategy) {
    return undefined
  }

  const normalized: Partial<HookReliabilityPolicy> = {}

  if (strategy.timeoutMs !== undefined) {
    normalized.timeoutMs = normalizeStrategyValue(strategy.timeoutMs, DEFAULT_HOOK_TIMEOUT_MS)
  }

  if (strategy.failureThreshold !== undefined) {
    normalized.failureThreshold = normalizeStrategyValue(
      strategy.failureThreshold,
      DEFAULT_HOOK_FAILURE_THRESHOLD
    )
  }

  if (strategy.cooldownMs !== undefined) {
    normalized.cooldownMs = normalizeStrategyValue(strategy.cooldownMs, DEFAULT_HOOK_COOLDOWN_MS)
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function buildPersistableHookGovernanceConfig(): PersistedHookGovernanceConfig {
  const hooks = hookManager
    .getAll()
    .map(hook => ({
      id: hook.id,
      enabled: hook.enabled ?? true,
      priority: normalizePriority(hook.priority ?? 100),
      strategy: resolveStrategy(hook.strategy)
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return {
    version: HOOK_GOVERNANCE_CONFIG_VERSION,
    hooks
  }
}

async function persistHookGovernanceConfig(): Promise<PersistedHookGovernanceConfig> {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const payload = buildPersistableHookGovernanceConfig()
  await prisma.systemSetting.upsert({
    where: { key: HOOK_GOVERNANCE_SETTING_KEY },
    update: { value: JSON.stringify(payload) },
    create: { key: HOOK_GOVERNANCE_SETTING_KEY, value: JSON.stringify(payload) }
  })

  cachedPersistedHookGovernanceConfig = payload
  return payload
}

async function loadPersistedHookGovernanceConfig(): Promise<PersistedHookGovernanceConfig | null> {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const setting = await prisma.systemSetting.findUnique({
    where: { key: HOOK_GOVERNANCE_SETTING_KEY }
  })

  if (!setting?.value) {
    cachedPersistedHookGovernanceConfig = null
    return null
  }

  try {
    const parsed = persistedHookGovernanceRawConfigSchema.parse(JSON.parse(setting.value))
    const normalized: PersistedHookGovernanceConfig = {
      version: parsed.version,
      hooks: parsed.hooks
        .map(item => hookGovernanceUpdateItemSchema.safeParse(item))
        .filter((result): result is { success: true; data: HookGovernanceUpdateItem } => result.success)
        .map(result => result.data)
    }
    cachedPersistedHookGovernanceConfig = normalized
    return normalized
  } catch (error) {
    logger.warn('Failed to parse persisted hook governance config:', error)
    cachedPersistedHookGovernanceConfig = null
    return null
  }
}

function applyHookGovernanceUpdateInMemory(
  input: HookGovernanceUpdateInput,
  allowUnknown = false
): { updated: string[]; skipped: Array<{ id: string; reason: string }> } {
  const updated: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []

  for (const item of input.hooks) {
    const hook = hookManager.get(item.id)
    if (!hook) {
      if (allowUnknown) {
        skipped.push({ id: item.id, reason: 'hook_not_found' })
      }
      continue
    }

    let changed = false

    if (typeof item.enabled === 'boolean') {
      if (item.enabled) {
        hookManager.enable(item.id)
      } else {
        hookManager.disable(item.id)
      }
      changed = true
    }

    if (typeof item.priority === 'number') {
      hook.priority = normalizePriority(item.priority)
      changed = true
    }

    const normalizedStrategy = normalizeStrategyPatch(item.strategy)
    if (normalizedStrategy) {
      hook.strategy = {
        ...resolveStrategy(hook.strategy),
        ...normalizedStrategy
      }
      changed = true
    }

    if (changed) {
      updated.push(item.id)
    }
  }

  return { updated, skipped }
}

function buildHookAuditSummary(hookId: string): HookGovernanceAuditSummary {
  const hook = hookManager.get(hookId)
  const lastAudit = hookManager.getRecentExecutionAudits(200).find(record => record.strategy.hookId === hookId)

  return {
    executionCount: hook?.executionCount ?? 0,
    errorCount: hook?.errorCount ?? 0,
    lastAuditAt: lastAudit?.timestamp,
    lastStatus: lastAudit?.result.status
  }
}

export function normalizeHookGovernanceUpdateInput(input: unknown): HookGovernanceUpdateInput {
  const parsed = hookGovernanceRawInputSchema.parse(input)
  const hooks = parsed.hooks
    .map(item => hookGovernanceUpdateItemSchema.safeParse(item))
    .filter((result): result is { success: true; data: HookGovernanceUpdateItem } => result.success)
    .map(result => result.data)

  if (hooks.length === 0) {
    throw new Error('No valid hook updates provided')
  }

  return { hooks }
}

export function getHookSystemStatus(): HookGovernanceStatus {
  const stats = hookManager.getStats()
  const hooks: HookGovernanceItem[] = hookManager
    .getAll()
    .map(hook => ({
      id: hook.id,
      name: hook.name,
      event: hook.event,
      description: hook.description,
      enabled: hook.enabled ?? true,
      priority: hook.priority ?? 100,
      source: hook.source ?? 'custom',
      scope: hook.scope ?? 'global',
      strategy: resolveStrategy(hook.strategy),
      runtime: hookManager.getHookRuntimeSnapshot(hook.id),
      audit: buildHookAuditSummary(hook.id)
    }))
    .sort((a, b) => {
      if (a.event === b.event) {
        if (a.priority === b.priority) {
          return a.name.localeCompare(b.name)
        }
        return a.priority - b.priority
      }
      return a.event.localeCompare(b.event)
    })

  return {
    initialized: stats.total > 0,
    stats,
    hooks,
    recentExecutions: hookManager.getRecentExecutionAudits(50)
  }
}

export async function updateHookGovernance(
  input: HookGovernanceUpdateInput
): Promise<HookGovernanceUpdateResult> {
  const normalizedInput = normalizeHookGovernanceUpdateInput(input)
  const { updated, skipped } = applyHookGovernanceUpdateInMemory(normalizedInput, true)

  try {
    await persistHookGovernanceConfig()
    return {
      success: true,
      updated,
      skipped,
      status: getHookSystemStatus()
    }
  } catch (error) {
    logger.error('Failed to persist hook governance config:', error)
    return {
      success: false,
      updated: [],
      skipped,
      status: getHookSystemStatus()
    }
  }
}

export function applyCachedHookGovernanceConfig(): {
  updated: string[]
  skipped: Array<{ id: string; reason: string }>
} {
  if (!cachedPersistedHookGovernanceConfig || cachedPersistedHookGovernanceConfig.hooks.length === 0) {
    return { updated: [], skipped: [] }
  }

  return applyHookGovernanceUpdateInMemory(
    {
      hooks: cachedPersistedHookGovernanceConfig.hooks
    },
    false
  )
}

export async function restorePersistedHookGovernance(): Promise<void> {
  try {
    const persisted = await loadPersistedHookGovernanceConfig()
    if (!persisted || persisted.hooks.length === 0) {
      return
    }

    applyHookGovernanceUpdateInMemory(
      {
        hooks: persisted.hooks
      },
      false
    )
  } catch (error) {
    logger.warn('Failed to restore persisted hook governance config:', error)
  }
}

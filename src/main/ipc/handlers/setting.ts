import { IpcMainInvokeEvent } from 'electron'
import type { SystemSetting } from '@prisma/client'
import { DatabaseService } from '../../services/database'
import {
  SETTING_KEYS,
  settingSchemaRegistry,
  buildScopedSettingStorageKey,
  parseScopedSettingStorageKey,
  type ResolvedSettingValue,
  type SettingSchemaDefinition,
  type SettingValueSource,
  type JsonValue,
  type SettingSchemaDescriptor
} from '../../services/settings/schema-registry'

export { SETTING_KEYS }
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export interface SettingGetInput {
  key: string
  spaceId?: string
}

export interface SettingSetInput {
  key: string
  value: unknown
  spaceId?: string
}

export interface SettingGetAllInput {
  spaceId?: string
}

export interface SettingScopeSource {
  scope: 'global' | 'space'
  source: SettingValueSource
}

export interface SettingResolvedResult {
  key: string
  value: string | number | boolean | JsonValue | null
  source: SettingValueSource
  schema: SettingSchemaDefinition
  scopeSource?: SettingScopeSource
}

function normalizeSettingGetInput(input: string | SettingGetInput): SettingGetInput {
  if (typeof input === 'string') {
    return { key: input }
  }

  return input
}

function normalizeSettingSetInput(input: { key: string; value: unknown } | SettingSetInput): SettingSetInput {
  return input
}

function normalizeSettingGetAllInput(input?: SettingGetAllInput): SettingGetAllInput {
  return input ?? {}
}

function serializeResolvedValue(key: string, resolved: ResolvedSettingValue): string | null {
  return settingSchemaRegistry.validateAndSerialize(key, resolved.value)
}

type SystemSettingReader = {
  systemSetting: {
    findMany: (args: { where: { key: { in: string[] } } }) => Promise<SystemSetting[]>
  }
}

async function fetchScopedSettingRows(params: {
  reader: SystemSettingReader
  key: string
  includeSpaceScope: boolean
  spaceId?: string
}): Promise<SystemSetting[]> {
  const { reader, key, includeSpaceScope, spaceId } = params

  const targetKeys = [key]
  if (includeSpaceScope && spaceId) {
    targetKeys.push(buildScopedSettingStorageKey(key, 'space', spaceId))
  }

  return reader.systemSetting.findMany({
    where: {
      key: {
        in: targetKeys
      }
    }
  })
}

function resolveScopedSettingValue(params: {
  schema: SettingSchemaDefinition
  settings: SystemSetting[]
  key: string
  spaceId?: string
}): {
  resolved: ResolvedSettingValue
  scopeSource: SettingScopeSource
} {
  const { schema, settings, key, spaceId } = params

  let selectedValue: string | null = null
  let selectedScope: 'global' | 'space' = 'global'

  if (schema.scope === 'space' && spaceId) {
    const scopedKey = buildScopedSettingStorageKey(key, 'space', spaceId)
    const scopedSetting = settings.find(setting => setting.key === scopedKey)

    if (scopedSetting) {
      selectedValue = scopedSetting.value
      selectedScope = 'space'
    }
  }

  if (selectedScope === 'global') {
    const globalSetting = settings.find(setting => setting.key === key)
    selectedValue = globalSetting?.value ?? null
  }

  const resolved = settingSchemaRegistry.resolveValue(key, selectedValue)

  return {
    resolved,
    scopeSource: {
      scope: selectedScope,
      source: resolved.source
    }
  }
}

/**
 * Get a system setting by key (serialized value)
 */
export async function handleSettingGet(
  _event: IpcMainInvokeEvent,
  input: string | SettingGetInput
): Promise<string | null> {
  const normalized = normalizeSettingGetInput(input)
  const { key, spaceId } = normalized

  if (!key || typeof key !== 'string') {
    throw new Error('Invalid setting key')
  }

  const schema = settingSchemaRegistry.getSchema(key)
  if (!schema) {
    throw new Error(`Unknown setting key: ${key}`)
  }

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const settings = await fetchScopedSettingRows({
    reader: prisma,
    key,
    includeSpaceScope: schema.scope === 'space',
    spaceId
  })

  const { resolved } = resolveScopedSettingValue({
    schema,
    settings,
    key,
    spaceId
  })
  return serializeResolvedValue(key, resolved)
}

/**
 * Get a system setting by key (typed resolved value + source)
 */
export async function handleSettingGetResolved(
  _event: IpcMainInvokeEvent,
  input: string | SettingGetInput
): Promise<SettingResolvedResult> {
  const normalized = normalizeSettingGetInput(input)
  const { key, spaceId } = normalized

  if (!key || typeof key !== 'string') {
    throw new Error('Invalid setting key')
  }

  const schema = settingSchemaRegistry.getSchema(key)
  if (!schema) {
    throw new Error(`Unknown setting key: ${key}`)
  }

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const settings = await fetchScopedSettingRows({
    reader: prisma,
    key,
    includeSpaceScope: schema.scope === 'space',
    spaceId
  })

  const { resolved, scopeSource } = resolveScopedSettingValue({
    schema,
    settings,
    key,
    spaceId
  })

  return {
    key,
    value: resolved.value,
    source: resolved.source,
    schema,
    scopeSource
  }
}

/**
 * Set a system setting
 */
export async function handleSettingSet(
  _event: IpcMainInvokeEvent,
  input: { key: string; value: unknown } | SettingSetInput
): Promise<{ key: string; value: string | null }> {
  const normalized = normalizeSettingSetInput(input)
  const { key, value, spaceId } = normalized

  if (!key || typeof key !== 'string') {
    throw new Error('Invalid setting key')
  }

  const schema = settingSchemaRegistry.getSchema(key)
  if (!schema) {
    throw new Error(`Unknown setting key: ${key}`)
  }

  const serializedValue = settingSchemaRegistry.validateAndSerialize(key, value)

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const storageKey =
    schema.scope === 'space' && spaceId ? buildScopedSettingStorageKey(key, 'space', spaceId) : key

  if (schema.scope === 'space' && spaceId && serializedValue === null) {
    await prisma.systemSetting.deleteMany({
      where: { key: storageKey }
    })
    return { key: storageKey, value: null }
  }

  const setting = await prisma.systemSetting.upsert({
    where: { key: storageKey },
    update: { value: serializedValue },
    create: { key: storageKey, value: serializedValue }
  })

  return { key: setting.key, value: setting.value }
}

/**
 * Get all system settings (serialized values, including schema defaults)
 */
export async function handleSettingGetAll(
  _event: IpcMainInvokeEvent,
  input?: SettingGetAllInput
): Promise<Record<string, string | null>> {
  const normalized = normalizeSettingGetAllInput(input)
  const { spaceId } = normalized

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const settings: SystemSetting[] = await prisma.systemSetting.findMany()

  const globalPersisted = settings.reduce((acc: Record<string, string | null>, setting: SystemSetting) => {
    const scoped = parseScopedSettingStorageKey(setting.key)
    if (scoped) return acc

    acc[setting.key] = setting.value
    return acc
  }, {})

  const resolved = { ...globalPersisted }

  for (const schema of settingSchemaRegistry.listSchemas()) {
    const matchedSettings = settings.filter(setting => {
      if (setting.key === schema.key) return true
      const scoped = parseScopedSettingStorageKey(setting.key)
      if (!scoped) return false
      return scoped.baseKey === schema.key
    })

    const { resolved: resolvedValue } = resolveScopedSettingValue({
      schema,
      settings: matchedSettings,
      key: schema.key,
      spaceId
    })
    resolved[schema.key] = serializeResolvedValue(schema.key, resolvedValue)
  }

  return resolved
}

/**
 * Get all registered setting schemas
 */
export async function handleSettingSchemaList(
  _event: IpcMainInvokeEvent
): Promise<SettingSchemaDescriptor[]> {
  return settingSchemaRegistry.getSchemaDescriptors()
}

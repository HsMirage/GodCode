import { logger } from '@/shared/logger'

export const SETTING_KEYS = {
  DEFAULT_MODEL_ID: 'defaultModelId',
  MAX_TOOL_ITERATIONS: 'maxToolIterations',
  HOOK_GOVERNANCE_CONFIG: 'hookGovernanceConfig',
  WORKFORCE_MAX_CONCURRENT: 'workforceMaxConcurrent',
  WORKFORCE_CONCURRENCY_LIMITS: 'workforceConcurrencyLimits',
  PERMISSION_TEMPLATE: 'permissionTemplate'
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]
export type SettingValueType = 'string' | 'number' | 'boolean' | 'json'
export type SettingScope = 'global' | 'space'
export const SETTING_SCOPE_KEY_SEPARATOR = '::'

export function buildScopedSettingStorageKey(
  key: string,
  scope: SettingScope,
  scopeId: string
): string {
  return `${key}${SETTING_SCOPE_KEY_SEPARATOR}${scope}${SETTING_SCOPE_KEY_SEPARATOR}${scopeId}`
}

export function parseScopedSettingStorageKey(storedKey: string): {
  baseKey: string
  scope: SettingScope
  scopeId: string
} | null {
  const segments = storedKey.split(SETTING_SCOPE_KEY_SEPARATOR)
  if (segments.length !== 3) return null

  const [baseKey, scope, scopeId] = segments
  if (!baseKey || !scope || !scopeId) return null
  if (scope !== 'global' && scope !== 'space') return null

  return {
    baseKey,
    scope,
    scopeId
  }
}
export type SettingValueSource = 'stored' | 'default' | 'null'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export interface SettingValidationRules {
  min?: number
  max?: number
  integer?: boolean
  minLength?: number
  maxLength?: number
  pattern?: string
  enum?: Array<string | number | boolean>
}

export interface SettingSchemaDefinition {
  key: string
  type: SettingValueType
  scope: SettingScope
  defaultValue?: string | number | boolean | JsonValue | null
  nullable?: boolean
  description?: string
  validation?: SettingValidationRules
}

export interface SettingSchemaDescriptor extends SettingSchemaDefinition {
  defaultValueSerialized: string | null
}

export interface ResolvedSettingValue {
  value: string | number | boolean | JsonValue | null
  source: SettingValueSource
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item))
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item))
  }

  return false
}

function cloneSchema(schema: SettingSchemaDefinition): SettingSchemaDefinition {
  return {
    ...schema,
    validation: schema.validation ? { ...schema.validation } : undefined
  }
}

class SettingSchemaRegistry {
  private readonly schemas = new Map<string, SettingSchemaDefinition>()

  register(schema: SettingSchemaDefinition): void {
    const key = schema.key?.trim()
    if (!key) {
      throw new Error('Setting schema key is required')
    }

    if (this.schemas.has(key)) {
      throw new Error(`Setting schema already registered: ${key}`)
    }

    const normalized: SettingSchemaDefinition = {
      ...schema,
      key,
      nullable: schema.nullable ?? false,
      validation: schema.validation ? { ...schema.validation } : undefined
    }

    if (normalized.defaultValue !== undefined) {
      this.validateValue(normalized, normalized.defaultValue)
    }

    this.schemas.set(key, normalized)
  }

  registerMany(schemas: SettingSchemaDefinition[]): void {
    for (const schema of schemas) {
      this.register(schema)
    }
  }

  getSchema(key: string): SettingSchemaDefinition | undefined {
    const schema = this.schemas.get(key)
    return schema ? cloneSchema(schema) : undefined
  }

  listSchemas(): SettingSchemaDefinition[] {
    return Array.from(this.schemas.values())
      .map((schema) => cloneSchema(schema))
      .sort((a, b) => a.key.localeCompare(b.key))
  }

  getSchemaDescriptors(): SettingSchemaDescriptor[] {
    return this.listSchemas().map((schema) => ({
      ...schema,
      defaultValueSerialized:
        schema.defaultValue !== undefined
          ? this.serializeValue(schema, schema.defaultValue ?? null)
          : null
    }))
  }

  getRegisteredKeys(): string[] {
    return Array.from(this.schemas.keys()).sort((a, b) => a.localeCompare(b))
  }

  validateAndSerialize(key: string, rawValue: unknown): string | null {
    const schema = this.schemas.get(key)
    if (!schema) {
      throw new Error(
        `Unknown setting key: ${key}. Please register schema first. Registered keys: ${this.getRegisteredKeys().join(', ')}`
      )
    }

    const parsed = this.parseInputValue(schema, rawValue)
    this.validateValue(schema, parsed)
    return this.serializeValue(schema, parsed)
  }

  resolveValue(key: string, storedValue: string | null): ResolvedSettingValue {
    const schema = this.schemas.get(key)
    if (!schema) {
      throw new Error(
        `Unknown setting key: ${key}. Please register schema first. Registered keys: ${this.getRegisteredKeys().join(', ')}`
      )
    }

    const defaultValue = schema.defaultValue ?? null

    if (storedValue === null) {
      if (schema.defaultValue !== undefined) {
        return { value: defaultValue, source: 'default' }
      }
      return { value: null, source: 'null' }
    }

    try {
      const parsedStored = this.parseStoredValue(schema, storedValue)
      this.validateValue(schema, parsedStored)
      return { value: parsedStored, source: 'stored' }
    } catch (error) {
      logger.warn('[SettingSchemaRegistry] Invalid persisted setting value, fallback to default', {
        key,
        error: error instanceof Error ? error.message : String(error)
      })

      if (schema.defaultValue !== undefined) {
        return { value: defaultValue, source: 'default' }
      }
      return { value: null, source: 'null' }
    }
  }

  private parseInputValue(
    schema: SettingSchemaDefinition,
    rawValue: unknown
  ): string | number | boolean | JsonValue | null {
    if (rawValue === null || rawValue === undefined) {
      if (schema.nullable) return null
      throw new Error(`Setting "${schema.key}" does not allow null`)
    }

    switch (schema.type) {
      case 'string': {
        if (typeof rawValue !== 'string') {
          throw new Error(`Setting "${schema.key}" expects string value`)
        }
        return rawValue
      }

      case 'number': {
        const numericValue =
          typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'string' && rawValue.trim().length > 0
              ? Number(rawValue)
              : Number.NaN

        if (!Number.isFinite(numericValue)) {
          throw new Error(`Setting "${schema.key}" expects numeric value`)
        }

        return numericValue
      }

      case 'boolean': {
        if (typeof rawValue === 'boolean') {
          return rawValue
        }

        if (typeof rawValue === 'string') {
          const normalized = rawValue.trim().toLowerCase()
          if (normalized === 'true') return true
          if (normalized === 'false') return false
        }

        throw new Error(`Setting "${schema.key}" expects boolean value`)
      }

      case 'json': {
        if (typeof rawValue === 'string') {
          try {
            const parsed = JSON.parse(rawValue) as unknown
            if (!isJsonValue(parsed)) {
              throw new Error('JSON value contains unsupported data type')
            }
            return parsed
          } catch (error) {
            throw new Error(
              `Setting "${schema.key}" expects valid JSON string: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }

        if (!isJsonValue(rawValue)) {
          throw new Error(`Setting "${schema.key}" expects JSON-compatible value`)
        }

        return rawValue
      }

      default:
        throw new Error(`Unsupported setting type for key "${schema.key}"`)
    }
  }

  private parseStoredValue(
    schema: SettingSchemaDefinition,
    rawStoredValue: string
  ): string | number | boolean | JsonValue {
    switch (schema.type) {
      case 'string':
        return rawStoredValue

      case 'number': {
        const numericValue = Number(rawStoredValue)
        if (!Number.isFinite(numericValue)) {
          throw new Error(`Stored number is invalid: ${rawStoredValue}`)
        }
        return numericValue
      }

      case 'boolean': {
        if (rawStoredValue === 'true') return true
        if (rawStoredValue === 'false') return false
        throw new Error(`Stored boolean is invalid: ${rawStoredValue}`)
      }

      case 'json': {
        const parsed = JSON.parse(rawStoredValue) as unknown
        if (!isJsonValue(parsed)) {
          throw new Error('Stored JSON contains unsupported data type')
        }
        return parsed
      }

      default:
        throw new Error(`Unsupported setting type for key "${schema.key}"`)
    }
  }

  private serializeValue(
    schema: SettingSchemaDefinition,
    value: string | number | boolean | JsonValue | null
  ): string | null {
    if (value === null) {
      return null
    }

    switch (schema.type) {
      case 'string':
        return value as string
      case 'number':
        return String(value)
      case 'boolean':
        return value ? 'true' : 'false'
      case 'json':
        return JSON.stringify(value)
      default:
        throw new Error(`Unsupported setting type for key "${schema.key}"`)
    }
  }

  private validateValue(
    schema: SettingSchemaDefinition,
    value: string | number | boolean | JsonValue | null
  ): void {
    if (value === null) {
      if (!schema.nullable) {
        throw new Error(`Setting "${schema.key}" does not allow null`)
      }
      return
    }

    const rules = schema.validation
    if (!rules) return

    if (rules.enum && !rules.enum.includes(value as string | number | boolean)) {
      throw new Error(
        `Setting "${schema.key}" must be one of: ${rules.enum.map((item) => String(item)).join(', ')}`
      )
    }

    if (schema.type === 'number') {
      const numericValue = value as number

      if (rules.integer && !Number.isInteger(numericValue)) {
        throw new Error(`Setting "${schema.key}" must be an integer`)
      }

      if (typeof rules.min === 'number' && numericValue < rules.min) {
        throw new Error(`Setting "${schema.key}" must be >= ${rules.min}`)
      }

      if (typeof rules.max === 'number' && numericValue > rules.max) {
        throw new Error(`Setting "${schema.key}" must be <= ${rules.max}`)
      }
    }

    if (schema.type === 'string') {
      const stringValue = value as string

      if (typeof rules.minLength === 'number' && stringValue.length < rules.minLength) {
        throw new Error(`Setting "${schema.key}" length must be >= ${rules.minLength}`)
      }

      if (typeof rules.maxLength === 'number' && stringValue.length > rules.maxLength) {
        throw new Error(`Setting "${schema.key}" length must be <= ${rules.maxLength}`)
      }

      if (rules.pattern) {
        const regex = new RegExp(rules.pattern)
        if (!regex.test(stringValue)) {
          throw new Error(`Setting "${schema.key}" does not match required pattern`)
        }
      }
    }
  }
}

export const settingSchemaRegistry = new SettingSchemaRegistry()

const BUILTIN_SETTING_SCHEMAS: SettingSchemaDefinition[] = [
  {
    key: SETTING_KEYS.DEFAULT_MODEL_ID,
    type: 'string',
    scope: 'global',
    nullable: true,
    defaultValue: null,
    description: '系统默认模型 ID（为空时按 agent/category 绑定回退）'
  },
  {
    key: SETTING_KEYS.MAX_TOOL_ITERATIONS,
    type: 'number',
    scope: 'global',
    nullable: false,
    defaultValue: 100,
    validation: {
      integer: true,
      min: 1,
      max: 1000
    },
    description: '单次消息允许的工具调用最大轮次'
  },
  {
    key: SETTING_KEYS.HOOK_GOVERNANCE_CONFIG,
    type: 'json',
    scope: 'global',
    nullable: true,
    defaultValue: null,
    description: 'Hook 治理策略持久化快照'
  },
  {
    key: SETTING_KEYS.WORKFORCE_MAX_CONCURRENT,
    type: 'number',
    scope: 'space',
    nullable: true,
    defaultValue: null,
    validation: {
      integer: true,
      min: 1
    },
    description: 'Workforce 并发子任务全局上限'
  },
  {
    key: SETTING_KEYS.WORKFORCE_CONCURRENCY_LIMITS,
    type: 'json',
    scope: 'global',
    nullable: true,
    defaultValue: null,
    description: 'Workforce 各类别并发上限映射（JSON）'
  },
  {
    key: SETTING_KEYS.PERMISSION_TEMPLATE,
    type: 'string',
    scope: 'global',
    nullable: false,
    defaultValue: 'balanced',
    validation: {
      enum: ['safe', 'balanced', 'full']
    },
    description: '工具权限模板（safe/balanced/full，工具调用默认自动执行）'
  }
]

settingSchemaRegistry.registerMany(BUILTIN_SETTING_SCHEMAS)

export function registerSettingSchema(schema: SettingSchemaDefinition): void {
  settingSchemaRegistry.register(schema)
}

export function registerSettingSchemas(schemas: SettingSchemaDefinition[]): void {
  settingSchemaRegistry.registerMany(schemas)
}

import { IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../services/database'

/**
 * System setting keys
 */
export const SETTING_KEYS = {
  DEFAULT_MODEL_ID: 'defaultModelId'
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

/**
 * Get a system setting by key
 */
export async function handleSettingGet(
  _event: IpcMainInvokeEvent,
  key: string
): Promise<string | null> {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid setting key')
  }

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const setting = await prisma.systemSetting.findUnique({
    where: { key }
  })

  return setting?.value ?? null
}

/**
 * Set a system setting
 */
export async function handleSettingSet(
  _event: IpcMainInvokeEvent,
  input: { key: string; value: string | null }
): Promise<{ key: string; value: string | null }> {
  const { key, value } = input

  if (!key || typeof key !== 'string') {
    throw new Error('Invalid setting key')
  }

  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const setting = await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  })

  return { key: setting.key, value: setting.value }
}

/**
 * Get all system settings
 */
export async function handleSettingGetAll(
  _event: IpcMainInvokeEvent
): Promise<Record<string, string | null>> {
  const dbService = DatabaseService.getInstance()
  await dbService.init()
  const prisma = dbService.getClient()

  const settings = await prisma.systemSetting.findMany()

  return settings.reduce(
    (acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    },
    {} as Record<string, string | null>
  )
}

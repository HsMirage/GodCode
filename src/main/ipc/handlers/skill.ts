import { IpcMainInvokeEvent } from 'electron'
import { skillRegistry } from '@/main/services/skills/registry'
import type { SkillCommandItem } from '@/main/services/skills/types'

type SkillCommandItemsInput = {
  query?: string
}

export async function handleSkillCommandItems(
  _event: IpcMainInvokeEvent,
  input?: SkillCommandItemsInput
): Promise<SkillCommandItem[]> {
  const query = typeof input?.query === 'string' ? input.query : ''
  return skillRegistry.getCommandItems(query)
}

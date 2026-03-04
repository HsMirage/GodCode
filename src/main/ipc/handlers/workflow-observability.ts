import type { IpcMainInvokeEvent } from 'electron'
import { WorkforceEngine } from '@/main/services/workforce'
import {
  getHookSystemStatus,
  updateHookGovernance,
  type HookGovernanceUpdateInput,
  type HookGovernanceUpdateItem
} from '@/main/services/hooks'

const workforceEngine = new WorkforceEngine()

export async function handleWorkflowObservabilityGet(
  _event: IpcMainInvokeEvent,
  workflowTaskId: string
) {
  return workforceEngine.getWorkflowObservability(workflowTaskId)
}

export async function handleHookGovernanceGet(_event: IpcMainInvokeEvent) {
  return getHookSystemStatus()
}

function normalizeHookGovernanceUpdateInput(input: unknown): HookGovernanceUpdateInput {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { hooks?: unknown[] }).hooks)) {
    throw new Error('Invalid hook governance update input')
  }

  const hooks = ((input as { hooks: unknown[] }).hooks ?? [])
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const candidate = item as {
        id?: unknown
        enabled?: unknown
        priority?: unknown
      }

      if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
        return null
      }

      const normalized: HookGovernanceUpdateItem = {
        id: candidate.id.trim()
      }

      if (typeof candidate.enabled === 'boolean') {
        normalized.enabled = candidate.enabled
      }

      if (typeof candidate.priority === 'number' && Number.isFinite(candidate.priority)) {
        normalized.priority = candidate.priority
      }

      if (normalized.enabled === undefined && normalized.priority === undefined) {
        return null
      }

      return normalized
    })
    .filter((item): item is HookGovernanceUpdateItem => item !== null)

  if (hooks.length === 0) {
    throw new Error('No valid hook updates provided')
  }

  return { hooks }
}

export async function handleHookGovernanceSet(_event: IpcMainInvokeEvent, input: unknown) {
  const normalizedInput = normalizeHookGovernanceUpdateInput(input)
  return updateHookGovernance(normalizedInput)
}

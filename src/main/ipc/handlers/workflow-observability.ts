import type { IpcMainInvokeEvent } from 'electron'
import { WorkforceEngine } from '@/main/services/workforce'
import {
  getHookSystemStatus,
  normalizeHookGovernanceUpdateInput,
  updateHookGovernance,
  type HookGovernanceUpdateInput
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

export async function handleHookGovernanceSet(_event: IpcMainInvokeEvent, input: unknown) {
  const normalizedInput: HookGovernanceUpdateInput = normalizeHookGovernanceUpdateInput(input)
  return updateHookGovernance(normalizedInput)
}

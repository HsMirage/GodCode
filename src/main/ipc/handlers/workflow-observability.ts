import type { IpcMainInvokeEvent } from 'electron'
import { WorkforceEngine } from '@/main/services/workforce'

const workforceEngine = new WorkforceEngine()

export async function handleWorkflowObservabilityGet(
  _event: IpcMainInvokeEvent,
  workflowTaskId: string
) {
  return workforceEngine.getWorkflowObservability(workflowTaskId)
}

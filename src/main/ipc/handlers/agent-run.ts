/**
 * Agent Run IPC Handlers
 */

import { IpcMainInvokeEvent } from 'electron'
import { AgentRunService } from '../../services/agent-run.service'

const agentRunService = AgentRunService.getInstance()

export async function handleAgentRunList(
  _event: IpcMainInvokeEvent,
  taskId: string
) {
  return await agentRunService.listByTask(taskId)
}

export async function handleAgentRunGet(
  _event: IpcMainInvokeEvent,
  runId: string
) {
  return await agentRunService.getById(runId)
}

export async function handleAgentRunGetLogs(
  _event: IpcMainInvokeEvent,
  runId: string
) {
  return await agentRunService.getLogs(runId)
}

import type { IpcMainInvokeEvent } from 'electron'
import { toolApprovalService } from '@/main/services/tools/tool-approval.service'
import type {
  ToolApprovalListInput,
  ToolApprovalResolveInput,
  ToolApprovalResolveResult,
  ToolApprovalRequest
} from '@/shared/tool-approval-contract'

export async function handleToolApprovalList(
  _event: IpcMainInvokeEvent,
  input?: ToolApprovalListInput
): Promise<ToolApprovalRequest[]> {
  return await toolApprovalService.listRequests(input)
}

export async function handleToolApprovalResolve(
  _event: IpcMainInvokeEvent,
  input: ToolApprovalResolveInput
): Promise<ToolApprovalResolveResult> {
  return await toolApprovalService.resolveRequest(input)
}


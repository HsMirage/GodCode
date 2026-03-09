export type ToolApprovalStatus = 'pending_approval' | 'approved' | 'rejected' | 'expired'

export type ToolApprovalDecision = 'approved' | 'rejected'

export type ToolApprovalRiskLevel = 'low' | 'medium' | 'high'

export interface ToolApprovalRequest {
  id: string
  sessionId: string
  taskId?: string
  runId?: string
  traceId?: string
  toolCallId: string
  toolName: string
  requestedToolName: string
  resolvedToolName: string
  arguments: Record<string, unknown>
  riskLevel: ToolApprovalRiskLevel
  reason: string
  status: ToolApprovalStatus
  requestedAt: string
  resolvedAt?: string
  decision?: ToolApprovalStatus
  decisionReason?: string
}

export interface ToolApprovalListInput {
  sessionId?: string
  includeResolved?: boolean
}

export interface ToolApprovalResolveInput {
  requestId: string
  decision: ToolApprovalDecision
  reason?: string
}

export interface ToolApprovalResolveResult {
  success: boolean
  request: ToolApprovalRequest
}


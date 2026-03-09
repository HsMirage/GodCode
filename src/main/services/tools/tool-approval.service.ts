import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { AgentRunService } from '@/main/services/agent-run.service'
import { AuditLogService } from '@/main/services/audit-log.service'
import { EVENT_CHANNELS } from '@/shared/ipc-channels'
import { executionEventPersistenceService } from '../execution-event-persistence.service'
import type { ToolExecutionPermissionPreview } from './permission-policy'
import type { ToolCall } from './tool-execution.service'
import type { ToolExecutionContext } from './tool.interface'
import type { BrowserToolContext } from '../ai-browser/types'
import type {
  ToolApprovalListInput,
  ToolApprovalRequest,
  ToolApprovalResolveInput,
  ToolApprovalResolveResult,
  ToolApprovalRiskLevel,
  ToolApprovalStatus
} from '@/shared/tool-approval-contract'

const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000

interface PendingApprovalEntry {
  request: ToolApprovalRequest
  resolve: (request: ToolApprovalRequest) => void
  timer: NodeJS.Timeout
}

type ApprovalContext = ToolExecutionContext | BrowserToolContext

export class ToolApprovalRequiredError extends Error {
  readonly request: ToolApprovalRequest

  constructor(request: ToolApprovalRequest, message: string) {
    super(message)
    this.name = 'ToolApprovalRequiredError'
    this.request = request
  }
}

export class ToolApprovalService {
  private static instance: ToolApprovalService | null = null

  private readonly logger = LoggerService.getInstance().getLogger()
  private readonly agentRunService = AgentRunService.getInstance()
  private readonly auditLogService = AuditLogService.getInstance()
  private readonly pending = new Map<string, PendingApprovalEntry>()
  private readonly resolved = new Map<string, ToolApprovalRequest>()

  static getInstance(): ToolApprovalService {
    if (!ToolApprovalService.instance) {
      ToolApprovalService.instance = new ToolApprovalService()
    }
    return ToolApprovalService.instance
  }

  async requestApproval(params: {
    toolCall: ToolCall
    permissionPreview: ToolExecutionPermissionPreview
    context: ApprovalContext
  }): Promise<ToolApprovalRequest> {
    const sessionId = ('sessionId' in params.context ? params.context.sessionId : '') || ''
    const request: ToolApprovalRequest = {
      id: randomUUID(),
      sessionId,
      taskId: 'taskId' in params.context ? params.context.taskId : undefined,
      runId: 'runId' in params.context ? params.context.runId : undefined,
      traceId: 'traceId' in params.context ? params.context.traceId : undefined,
      toolCallId: params.toolCall.id,
      toolName: params.toolCall.name,
      requestedToolName: params.permissionPreview.requestedName,
      resolvedToolName: params.permissionPreview.resolvedName,
      arguments: params.toolCall.arguments,
      riskLevel: this.resolveRiskLevel(params.permissionPreview),
      reason:
        params.permissionPreview.confirmReason ||
        params.permissionPreview.reason ||
        'Manual approval required before executing this tool',
      status: 'pending_approval',
      requestedAt: new Date().toISOString()
    }

    let resolveRequest!: (request: ToolApprovalRequest) => void
    const promise = new Promise<ToolApprovalRequest>(resolve => {
      resolveRequest = resolve
    })

    const timer = setTimeout(() => {
      void this.finalizeRequest(request.id, 'expired', 'Approval request expired')
    }, DEFAULT_APPROVAL_TIMEOUT_MS)

    this.pending.set(request.id, {
      request,
      resolve: resolveRequest,
      timer
    })

    try {
      await this.persistStatus(request)
      await this.appendRunLog(request, 'Tool approval requested', {
        requestId: request.id,
        toolName: request.toolName,
        toolCallId: request.toolCallId,
        riskLevel: request.riskLevel,
        reason: request.reason
      })
      await this.audit(request, 'tool_approval_requested', true)
      await executionEventPersistenceService.appendEvent({
        sessionId: request.sessionId,
        taskId: request.taskId,
        runId: request.runId,
        type: 'run-paused',
        payload: {
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          reason: request.reason
        }
      })
      this.emitUpdated(request)
    } catch (error) {
      clearTimeout(timer)
      this.pending.delete(request.id)
      throw error
    }

    return await promise
  }

  async listRequests(input?: ToolApprovalListInput): Promise<ToolApprovalRequest[]> {
    const sessionId = input?.sessionId?.trim()
    const pending = Array.from(this.pending.values()).map(entry => entry.request)
    const resolved = input?.includeResolved ? Array.from(this.resolved.values()) : []

    return [...pending, ...resolved]
      .filter(request => !sessionId || request.sessionId === sessionId)
      .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
  }

  async resolveRequest(input: ToolApprovalResolveInput): Promise<ToolApprovalResolveResult> {
    const status: ToolApprovalStatus = input.decision === 'approved' ? 'approved' : 'rejected'
    const request = await this.finalizeRequest(input.requestId, status, input.reason)
    return {
      success: true,
      request
    }
  }

  private async finalizeRequest(
    requestId: string,
    status: ToolApprovalStatus,
    decisionReason?: string
  ): Promise<ToolApprovalRequest> {
    const entry = this.pending.get(requestId)
    if (!entry) {
      const resolved = this.resolved.get(requestId)
      if (resolved) {
        return resolved
      }
      throw new Error(`Approval request not found: ${requestId}`)
    }

    clearTimeout(entry.timer)
    this.pending.delete(requestId)

    const resolvedRequest: ToolApprovalRequest = {
      ...entry.request,
      status,
      decision: status,
      decisionReason,
      resolvedAt: new Date().toISOString()
    }

    this.resolved.set(requestId, resolvedRequest)
    await this.persistStatus(resolvedRequest)
    await this.appendRunLog(resolvedRequest, `Tool approval ${status}`, {
      requestId: resolvedRequest.id,
      toolName: resolvedRequest.toolName,
      toolCallId: resolvedRequest.toolCallId,
      decisionReason
    })
    await this.audit(
      resolvedRequest,
      status === 'approved' ? 'tool_approval_approved' : 'tool_approval_rejected',
      status === 'approved',
      status === 'approved' ? null : decisionReason || status
    )
    await executionEventPersistenceService.appendEvent({
      sessionId: resolvedRequest.sessionId,
      taskId: resolvedRequest.taskId,
      runId: resolvedRequest.runId,
      type: status === 'approved' ? 'tool-call-approved' : 'tool-call-rejected',
      payload: {
        toolCallId: resolvedRequest.toolCallId,
        toolName: resolvedRequest.toolName,
        decisionReason,
        status
      }
    })
    if (status === 'approved') {
      await executionEventPersistenceService.appendEvent({
        sessionId: resolvedRequest.sessionId,
        taskId: resolvedRequest.taskId,
        runId: resolvedRequest.runId,
        type: 'run-resumed',
        payload: {
          toolCallId: resolvedRequest.toolCallId,
          toolName: resolvedRequest.toolName
        }
      })
    }
    this.emitUpdated(resolvedRequest)
    entry.resolve(resolvedRequest)

    return resolvedRequest
  }

  private resolveRiskLevel(preview: ToolExecutionPermissionPreview): ToolApprovalRiskLevel {
    if (preview.highRisk || preview.highRiskEnforced) {
      return 'high'
    }
    if (preview.dangerous) {
      return 'medium'
    }
    return 'low'
  }

  private async persistStatus(request: ToolApprovalRequest): Promise<void> {
    if (!request.taskId) {
      return
    }

    const prisma = DatabaseService.getInstance().getClient()
    const existing = await prisma.task.findUnique({
      where: { id: request.taskId },
      select: { metadata: true }
    })
    const metadata = (existing?.metadata as Record<string, unknown> | null) || {}
    const approvalMetadata =
      metadata.toolApproval && typeof metadata.toolApproval === 'object'
        ? (metadata.toolApproval as Record<string, unknown>)
        : {}
    const history = Array.isArray(approvalMetadata.history)
      ? ([...approvalMetadata.history] as ToolApprovalRequest[])
      : []
    const nextHistory = this.upsertHistory(history, request)

    await prisma.task.update({
      where: { id: request.taskId },
      data: {
        status: request.status === 'pending_approval' ? 'pending_approval' : request.status === 'approved' ? 'running' : 'failed',
        output:
          request.status === 'rejected' || request.status === 'expired'
            ? request.decisionReason || `Tool approval ${request.status}`
            : undefined,
        metadata: {
          ...metadata,
          toolApproval: {
            ...approvalMetadata,
            status: request.status,
            currentRequestId: request.id,
            current: request,
            history: nextHistory
          }
        }
      }
    })

    this.emitTaskStatusChanged(request)
  }

  private upsertHistory(history: ToolApprovalRequest[], request: ToolApprovalRequest): ToolApprovalRequest[] {
    const existingIndex = history.findIndex(item => item.id === request.id)
    if (existingIndex >= 0) {
      const next = [...history]
      next[existingIndex] = request
      return next
    }
    return [...history, request].slice(-20)
  }

  private async appendRunLog(
    request: ToolApprovalRequest,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!request.runId) {
      return
    }
    try {
      await this.agentRunService.addLog(request.runId, {
        timestamp: new Date().toISOString(),
        level: request.status === 'approved' ? 'info' : request.status === 'pending_approval' ? 'warn' : 'error',
        message,
        data: {
          ...(data || {}),
          status: request.status,
          traceId: request.traceId
        }
      })
    } catch (error) {
      this.logger.warn('Failed to append tool approval run log', {
        runId: request.runId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async audit(
    request: ToolApprovalRequest,
    action: string,
    success: boolean,
    errorMsg?: string | null
  ): Promise<void> {
    try {
      await this.auditLogService.log({
        action,
        entityType: 'tool_approval',
        entityId: request.id,
        sessionId: request.sessionId || undefined,
        success,
        errorMsg: errorMsg || undefined,
        metadata: request
      })
    } catch (error) {
      this.logger.warn('Failed to write tool approval audit log', {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private emitUpdated(request: ToolApprovalRequest): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send(EVENT_CHANNELS.TOOL_APPROVAL_UPDATED, { request })
    }
  }

  private emitTaskStatusChanged(request: ToolApprovalRequest): void {
    if (!request.taskId) {
      return
    }
    const payload = {
      workflowId: request.taskId,
      taskId: request.taskId,
      eventType: 'tool-approval',
      status:
        request.status === 'pending_approval'
          ? 'pending_approval'
          : request.status === 'approved'
            ? 'running'
            : 'failed',
      timestamp: new Date(),
      data: {
        approvalRequest: request
      }
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send(EVENT_CHANNELS.TASK_STATUS_CHANGED, payload)
    }
  }
}

export const toolApprovalService = ToolApprovalService.getInstance()

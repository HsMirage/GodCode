import type { Message as PrismaMessage } from '@prisma/client'
import type { AgentRoutingStrategy } from '@/shared/agent-definitions'
import type { SkillCommandInvocation, SkillRuntimePayload } from '@/main/services/skills/types'
import type { RecoveryTrackingMetadata } from '@/shared/recovery-contract'
import type { TraceContext } from '@/shared/trace-contract'

export type MessageSendInput = {
  sessionId: string
  content: string
  agentCode?: string
  skillCommand?: SkillCommandInvocation
  resumeContext?: RecoveryTrackingMetadata
  traceContext?: TraceContext
}

export type MessageAbortInput = {
  sessionId: string
}

export type MessageExecutionPath = 'direct' | 'delegate' | 'workforce'

export type MessageSelectedDefinition = {
  code: string
  defaultStrategy: AgentRoutingStrategy
}

export type MessageLogger = {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export type MessageRuntimeContext = {
  input: MessageSendInput
  traceContext: TraceContext
  resolvedContent: string
  agentCode?: string
  selectedDefinition?: MessageSelectedDefinition
  skillRuntimePayload?: SkillRuntimePayload
  resumeContext?: RecoveryTrackingMetadata
  strategy: string
  workspaceDir: string
  userMessageMetadata?: Record<string, unknown>
  initialAssistantMetadata?: Record<string, unknown>
}

export type MessageExecutionResult = {
  assistantContent: string
  assistantMetadata?: Record<string, unknown>
}

export type PersistedMessagePair = {
  userMessage: PrismaMessage
  assistantMessage: PrismaMessage
}

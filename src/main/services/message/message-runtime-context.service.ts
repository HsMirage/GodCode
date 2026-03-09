import path from 'path'
import type { Message as PrismaMessage, PrismaClient } from '@prisma/client'
import type { Message as DomainMessage } from '@/types/domain'
import type { LLMConfig } from '@/main/services/llm/adapter.interface'
import type { SmartRouter } from '@/main/services/router/smart-router'
import type {
  Skill,
  SkillCommandInvocation,
  SkillRuntimePayload
} from '@/main/services/skills/types'
import { applyRecoveryTrackingMetadata } from '@/shared/recovery-contract'
import { applyTraceMetadata, createTraceContext } from '@/shared/trace-contract'
import type { ContextInjectionType } from '@/main/services/hooks/context-injection-policy'
import type { MessageLogger, MessageRuntimeContext, MessageSendInput } from './message.types'
import { skillRegistry } from '@/main/services/skills/registry'
import { resolveScopedRuntimeToolNames } from '@/main/services/delegate/tool-allowlist'
import { PRIMARY_AGENTS, CATEGORY_AGENTS } from '@/shared/agent-definitions'

export const toDomainMessages = (messages: PrismaMessage[]): DomainMessage[] =>
  messages.map(message => ({
    id: message.id,
    sessionId: message.sessionId,
    role: message.role as DomainMessage['role'],
    content: message.content,
    createdAt: message.createdAt,
    metadata: (message.metadata as Record<string, unknown> | null) ?? undefined
  }))

export const toLLMConfig = (config: unknown): LLMConfig => {
  if (!config || typeof config !== 'object') {
    return {}
  }

  return config as LLMConfig
}

export function parseSettingInt(value: string | null | undefined, min: number, max: number): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

export function resolveAgentRuntimeToolNames(agentCode: string): string[] | undefined {
  return resolveScopedRuntimeToolNames({ subagentType: agentCode })
}

export function mergeScopedToolNames(
  agentScopedToolNames?: string[],
  skillScopedToolNames?: string[]
): string[] | undefined {
  if (agentScopedToolNames === undefined && skillScopedToolNames === undefined) {
    return undefined
  }

  if (agentScopedToolNames === undefined) {
    return skillScopedToolNames
  }

  if (skillScopedToolNames === undefined) {
    return agentScopedToolNames
  }

  const skillScopedSet = new Set(skillScopedToolNames)
  return agentScopedToolNames.filter(toolName => skillScopedSet.has(toolName))
}

export function normalizeSkillModelOverride(skillRuntimePayload?: SkillRuntimePayload): string | undefined {
  const model = skillRuntimePayload?.model?.trim()
  return model || undefined
}

export function normalizeContextInjectionType(type: unknown): ContextInjectionType {
  if (
    type === 'workspace-rules' ||
    type === 'continuation-reminder' ||
    type === 'hook-injection' ||
    type === 'context-overflow-warning' ||
    type === 'edit-recovery' ||
    type === 'custom'
  ) {
    return type
  }
  return 'custom'
}

function normalizeSkillCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function resolveSkillByInvocation(invocation: SkillCommandInvocation): Skill | undefined {
  const normalizedCommand = normalizeSkillCommand(invocation.command)
  if (!normalizedCommand) return undefined

  const commandResolved = skillRegistry.findByCommand(normalizedCommand)
  if (commandResolved) return commandResolved

  const directId = invocation.command.trim()
  if (directId) {
    return skillRegistry.get(directId)
  }

  return undefined
}

function renderSkillTemplate(template: string, input: string): string {
  const placeholderPattern = /\{\{\s*input\s*\}\}/gi
  if (placeholderPattern.test(template)) {
    return template.replace(placeholderPattern, input)
  }

  if (!input) return template
  return `${template}\n\n${input}`
}

function assembleSkillRuntimePayload(
  invocation: SkillCommandInvocation,
  fallbackContent: string
): {
  runtimePayload: SkillRuntimePayload
  resolvedContent: string
} {
  const skill = resolveSkillByInvocation(invocation)
  if (!skill) {
    throw new Error(`未找到可执行的技能命令: ${invocation.command}`)
  }

  if (skill.enabled === false) {
    throw new Error(`技能已被禁用: ${skill.id}`)
  }

  if (!skill.template?.trim()) {
    throw new Error(`技能缺少模板字段 template: ${skill.id}`)
  }

  const normalizedCommand = normalizeSkillCommand(invocation.command)
  const normalizedInput = typeof invocation.input === 'string' ? invocation.input.trim() : ''
  const fallbackInput = fallbackContent.trim()
  const effectiveInput = normalizedInput || fallbackInput

  const runtimePayload: SkillRuntimePayload = {
    id: skill.id,
    name: skill.name,
    command: normalizedCommand,
    rawInput: invocation.rawInput?.trim() || null,
    input: effectiveInput || null,
    renderedPrompt: renderSkillTemplate(skill.template, effectiveInput),
    template: skill.template,
    allowedTools: Array.isArray(skill.allowedTools) ? skill.allowedTools : null,
    agent: skill.agent?.trim() || null,
    model: skill.model?.trim() || null,
    subtask: typeof skill.subtask === 'boolean' ? skill.subtask : null,
    mcpConfig: skill.mcpConfig || null
  }

  return {
    runtimePayload,
    resolvedContent: runtimePayload.renderedPrompt
  }
}

export async function buildMessageRuntimeContext({
  prisma,
  logger,
  router,
  input
}: {
  prisma: PrismaClient
  logger: MessageLogger
  router: SmartRouter
  input: MessageSendInput
}): Promise<MessageRuntimeContext> {
  let resolvedContent = input.content
  let skillRuntimePayload: SkillRuntimePayload | undefined

  if (input.skillCommand) {
    const skillAssembly = assembleSkillRuntimePayload(input.skillCommand, input.content)
    resolvedContent = skillAssembly.resolvedContent
    skillRuntimePayload = skillAssembly.runtimePayload
  }

  const traceContext = input.traceContext ?? createTraceContext({ sessionId: input.sessionId })

  const normalizedAgentCode = (skillRuntimePayload?.agent ?? input.agentCode)?.trim()
  const agentCode =
    normalizedAgentCode && normalizedAgentCode.toLowerCase() !== 'default'
      ? normalizedAgentCode
      : undefined
  const resolvedDefinition = agentCode
    ? [...PRIMARY_AGENTS, ...CATEGORY_AGENTS].find(def => def.code === agentCode)
    : undefined
  const selectedDefinition = resolvedDefinition
    ? { code: resolvedDefinition.code, defaultStrategy: resolvedDefinition.defaultStrategy }
    : undefined

  const userMessageMetadata: Record<string, unknown> = applyTraceMetadata({}, traceContext)
  if (agentCode) {
    userMessageMetadata.agentCode = agentCode
  }
  if (skillRuntimePayload) {
    userMessageMetadata.skill = skillRuntimePayload
  }
  if (input.resumeContext) {
    Object.assign(userMessageMetadata, applyRecoveryTrackingMetadata({}, input.resumeContext))
  }

  const strategy = selectedDefinition?.defaultStrategy
    ? selectedDefinition.defaultStrategy === 'direct-enhanced'
      ? 'direct'
      : selectedDefinition.defaultStrategy
    : router.analyzeTask(resolvedContent, { agentCode })

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: { space: true }
  })
  const workspaceDir = session?.space?.workDir || process.cwd()

  logger.info('[message:send] Resolved session workspace context', {
    sessionId: input.sessionId,
    spaceId: session?.space?.id ?? null,
    workspaceDir,
    agentCode,
    strategy,
    skillId: skillRuntimePayload?.id,
    traceId: traceContext.traceId
  })

  const assistantBaseMetadata = applyTraceMetadata(
    {
      ...(agentCode ? { agentCode } : {}),
      ...(skillRuntimePayload ? { skill: skillRuntimePayload } : {})
    },
    traceContext
  )

  return {
    input,
    traceContext,
    resolvedContent,
    agentCode,
    selectedDefinition,
    skillRuntimePayload,
    resumeContext: input.resumeContext,
    strategy,
    workspaceDir: path.normalize(workspaceDir),
    userMessageMetadata:
      Object.keys(userMessageMetadata).length > 0 ? userMessageMetadata : undefined,
    initialAssistantMetadata: input.resumeContext
      ? applyRecoveryTrackingMetadata(assistantBaseMetadata, input.resumeContext)
      : assistantBaseMetadata
  }
}

import type { PrismaClient } from '@prisma/client'
import type { Message as DomainMessage } from '@/types/domain'
import type { SmartRouter } from '@/main/services/router/smart-router'
import { SETTING_KEYS } from '@/main/services/settings/schema-registry'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { costTracker } from '@/main/services/llm/cost-tracker'
import { extractRouteOutput } from '@/main/ipc/handlers/route-output'
import { ModelSelectionService } from '@/main/services/llm/model-selection.service'
import { toolExecutionService } from '@/main/services/tools/tool-execution.service'
import { getAgentPromptByCode } from '@/main/services/delegate/agents'
import { resolveScopedRuntimeToolNames } from '@/main/services/delegate/tool-allowlist'
import { hookManager } from '@/main/services/hooks'
import {
  buildContextInjectionPayload,
  type ContextInjectionCandidate,
  type ContextInjectionSummary
} from '@/main/services/hooks/context-injection-policy'
import {
  mergeScopedToolNames,
  normalizeContextInjectionType,
  normalizeSkillModelOverride,
  parseSettingInt,
  resolveAgentRuntimeToolNames,
  toDomainMessages,
  toLLMConfig
} from './message-runtime-context.service'
import type {
  MessageExecutionPath,
  MessageExecutionResult,
  MessageLogger,
  MessageRuntimeContext
} from './message.types'
import type { MessageStreamSession } from './message-stream.service'

async function executeDirectMessage({
  prisma,
  logger,
  runtimeContext,
  stream
}: {
  prisma: PrismaClient
  logger: MessageLogger
  runtimeContext: MessageRuntimeContext
  stream: MessageStreamSession
}): Promise<MessageExecutionResult> {
  const {
    agentCode,
    initialAssistantMetadata,
    input,
    skillRuntimePayload,
    strategy,
    traceContext,
    workspaceDir
  } = runtimeContext

  const skillModelOverride = normalizeSkillModelOverride(skillRuntimePayload)
  const [modelSelection, maxToolIterationsSetting] = await Promise.all([
    ModelSelectionService.getInstance().resolveModelSelection({
      overrideModelSpec: skillModelOverride,
      agentCode,
      temperatureFallback: undefined
    }),
    prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.MAX_TOOL_ITERATIONS } })
  ])

  const adapter = createLLMAdapter(modelSelection.provider, {
    apiKey: modelSelection.apiKey,
    baseURL: modelSelection.baseURL
  })

  const history = await prisma.message.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { createdAt: 'asc' }
  })

  const agentSystemPrompt = agentCode ? getAgentPromptByCode(agentCode)?.trim() : undefined
  const scopedAgentToolNames = agentCode ? resolveAgentRuntimeToolNames(agentCode) : undefined
  const effectiveScopedAgentToolNames =
    scopedAgentToolNames !== undefined
      ? toolExecutionService.getToolDefinitions(scopedAgentToolNames).map(tool => tool.name)
      : undefined
  const skillScopedToolNames = skillRuntimePayload?.allowedTools
    ? resolveScopedRuntimeToolNames({ availableTools: skillRuntimePayload.allowedTools })
    : undefined
  const effectiveSkillScopedToolNames =
    skillScopedToolNames !== undefined
      ? toolExecutionService.getToolDefinitions(skillScopedToolNames).map(tool => tool.name)
      : undefined
  const effectiveRuntimeToolNames = mergeScopedToolNames(
    effectiveScopedAgentToolNames,
    effectiveSkillScopedToolNames
  )
  const agentToolNames = effectiveRuntimeToolNames ?? []
  const agentToolDefinitions =
    effectiveRuntimeToolNames !== undefined
      ? toolExecutionService.getToolDefinitions(agentToolNames)
      : undefined

  const baseConfig = toLLMConfig(modelSelection.config)
  const maxToolIterations =
    parseSettingInt(maxToolIterationsSetting?.value, 1, 1000) ?? baseConfig.maxToolIterations
  const llmConfig = {
    ...baseConfig,
    model: modelSelection.model,
    temperature: modelSelection.temperature ?? baseConfig.temperature,
    apiProtocol: modelSelection.protocol ?? baseConfig.apiProtocol,
    maxToolIterations,
    workspaceDir,
    sessionId: input.sessionId,
    agentCode,
    tools: agentToolDefinitions,
    abortSignal: stream.signal,
    traceId: traceContext.traceId
  }

  logger.info('[handleMessageSend] Resolved chat model', {
    agentCode,
    modelId: modelSelection.modelId,
    provider: modelSelection.provider,
    modelName: modelSelection.model,
    baseURL: modelSelection.baseURL,
    temperature: llmConfig.temperature,
    maxToolIterations: llmConfig.maxToolIterations,
    hasAgentSystemPrompt: Boolean(agentSystemPrompt),
    agentToolCount: agentToolNames.length,
    modelSource: modelSelection.source,
    protocol: modelSelection.protocol,
    skillId: skillRuntimePayload?.id,
    skillModelOverride: skillModelOverride ?? null,
    skillToolScopeCount: effectiveSkillScopedToolNames?.length ?? null,
    executionPath: 'direct'
  })

  const domainMessages = toDomainMessages(history)
  const initialMessagesForHook: DomainMessage[] = agentSystemPrompt
    ? [
        {
          id: `system:${input.sessionId}:${agentCode}`,
          sessionId: input.sessionId,
          role: 'system',
          content: agentSystemPrompt,
          createdAt: new Date(),
          metadata: agentCode ? { agentCode } : undefined
        },
        ...domainMessages
      ]
    : domainMessages

  const messageCreateResult = await hookManager.emitMessageCreate(
    {
      sessionId: input.sessionId,
      workspaceDir,
      userId: undefined
    },
    {
      id: `system:runtime:${input.sessionId}`,
      role: 'system',
      content: agentSystemPrompt ?? ''
    }
  )

  const injectionCandidates = (messageCreateResult.injections ?? []).flatMap(injection => {
      const content = injection.content?.trim()
      if (!content) {
        return []
      }
      return [{
        type: normalizeContextInjectionType(injection.type),
        source: injection.source || 'hook-manager',
        content,
        priority: injection.priority
      } satisfies ContextInjectionCandidate]
    })

  let contextInjectionSummary: ContextInjectionSummary | undefined
  let messagesForLLM: DomainMessage[] = initialMessagesForHook

  if (injectionCandidates.length > 0) {
    const injectionPayload = buildContextInjectionPayload(injectionCandidates)
    contextInjectionSummary = injectionPayload.summary

    if (injectionPayload.injectedContent.trim()) {
      const injectedSystemMessage: DomainMessage = {
        id: `system:injection:${input.sessionId}:${Date.now()}`,
        sessionId: input.sessionId,
        role: 'system',
        content: injectionPayload.injectedContent,
        createdAt: new Date(),
        metadata: {
          source: 'hook-context-injection',
          summary: injectionPayload.summary
        }
      }

      messagesForLLM = agentSystemPrompt
        ? [messagesForLLM[0], injectedSystemMessage, ...messagesForLLM.slice(1)]
        : [injectedSystemMessage, ...messagesForLLM]
    }
  }

  let assistantContent = ''
  await toolExecutionService.withAllowedTools(effectiveRuntimeToolNames, async () => {
    for await (const chunk of adapter.streamMessage(messagesForLLM, llmConfig)) {
      if (chunk.content) {
        assistantContent += chunk.content
      }

      stream.forwardAdapterChunk(chunk)
    }
  })

  const assistantMetadata: Record<string, unknown> = {
    ...(initialAssistantMetadata || {}),
    routeStrategy: strategy,
    executionPath: 'direct',
    model: modelSelection.model,
    modelSource: modelSelection.source
  }

  if (contextInjectionSummary && contextInjectionSummary.totalCount > 0) {
    assistantMetadata.contextInjectionSummary = contextInjectionSummary
  }

  costTracker.trackUsage(modelSelection.provider, 0, 0)

  return {
    assistantContent,
    assistantMetadata
  }
}

async function executeRoutedMessage({
  router,
  runtimeContext,
  stream
}: {
  router: SmartRouter
  runtimeContext: MessageRuntimeContext
  stream: MessageStreamSession
}): Promise<MessageExecutionResult> {
  const {
    agentCode,
    initialAssistantMetadata,
    input,
    resolvedContent,
    resumeContext,
    selectedDefinition,
    skillRuntimePayload,
    strategy,
    traceContext
  } = runtimeContext

  const skillScopedToolNames = skillRuntimePayload?.allowedTools
    ? resolveScopedRuntimeToolNames({ availableTools: skillRuntimePayload.allowedTools })
    : undefined
  const effectiveSkillScopedToolNames =
    skillScopedToolNames !== undefined
      ? toolExecutionService.getToolDefinitions(skillScopedToolNames).map(tool => tool.name)
      : undefined
  const skillModelOverride = normalizeSkillModelOverride(skillRuntimePayload)

  const routeResult = await router.route(resolvedContent, {
    sessionId: input.sessionId,
    prompt: resolvedContent,
    agentCode,
    abortSignal: stream.signal,
    forceWorkforce: selectedDefinition?.defaultStrategy === 'workforce',
    availableTools: effectiveSkillScopedToolNames,
    overrideModelSpec: skillModelOverride,
    skillRuntime: skillRuntimePayload,
    resumeContext,
    traceContext
  })

  if (stream.signal.aborted) {
    stream.sendDone()
  }

  const assistantContent = extractRouteOutput(routeResult)
  const executionPath: MessageExecutionPath =
    'workflowId' in routeResult ? 'workforce' : 'taskId' in routeResult ? 'delegate' : 'direct'

  if (!stream.wasAborted) {
    stream.sendDone(assistantContent)
  }

  return {
    assistantContent,
    assistantMetadata: {
      ...(initialAssistantMetadata || {}),
      routeStrategy: strategy,
      executionPath,
      skillModelOverride: skillModelOverride ?? null,
      skillToolScopeCount: effectiveSkillScopedToolNames?.length ?? null
    }
  }
}

export async function executeMessage({
  prisma,
  router,
  logger,
  runtimeContext,
  stream
}: {
  prisma: PrismaClient
  router: SmartRouter
  logger: MessageLogger
  runtimeContext: MessageRuntimeContext
  stream: MessageStreamSession
}): Promise<MessageExecutionResult> {
  if (runtimeContext.strategy === 'direct') {
    return executeDirectMessage({ prisma, logger, runtimeContext, stream })
  }

  return executeRoutedMessage({ router, runtimeContext, stream })
}

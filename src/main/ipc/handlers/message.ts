import fs from 'fs'
import path from 'path'
import { SETTING_KEYS } from '@/main/services/settings/schema-registry'
import { IpcMainInvokeEvent } from 'electron'
import { Prisma, type Message as PrismaMessage } from '@prisma/client'
import type { Message as DomainMessage } from '@/types/domain'
import type { LLMConfig } from '@/main/services/llm/adapter.interface'
import { DatabaseService } from '@/main/services/database'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { costTracker } from '@/main/services/llm/cost-tracker'
import { LoggerService } from '@/main/services/logger'
import { SmartRouter } from '@/main/services/router/smart-router'
import { extractRouteOutput } from './route-output'
import { taskContinuationService } from '@/main/services/task-continuation.service'
import { ModelSelectionService } from '@/main/services/llm/model-selection.service'
import { backgroundTaskManager, cancelTasks } from '@/main/services/tools/background'
import { toolExecutionService } from '@/main/services/tools/tool-execution.service'
import { getAgentPromptByCode } from '@/main/services/delegate/agents'
import { resolveScopedRuntimeToolNames } from '@/main/services/delegate/tool-allowlist'
import { llmRetryNotifier } from '@/main/services/llm/retry-notifier'
import { EVENT_CHANNELS } from '@/shared/ipc-channels'
import { PRIMARY_AGENTS, CATEGORY_AGENTS } from '@/shared/agent-definitions'
import { hookManager } from '@/main/services/hooks'
import { BoulderStateService } from '@/main/services/boulder-state.service'
import { skillRegistry } from '@/main/services/skills/registry'
import type { Skill, SkillCommandInvocation, SkillRuntimePayload } from '@/main/services/skills/types'
import {
  buildContextInjectionPayload,
  type ContextInjectionCandidate,
  type ContextInjectionSummary,
  type ContextInjectionType
} from '@/main/services/hooks/context-injection-policy'


type MessageSendInput = {
  sessionId: string
  content: string
  agentCode?: string
  skillCommand?: SkillCommandInvocation
}

type MessageAbortInput = {
  sessionId: string
}

const activeStreamControllers = new Map<string, AbortController>()

const toDomainMessages = (messages: PrismaMessage[]): DomainMessage[] =>
  messages.map(message => ({
    id: message.id,
    sessionId: message.sessionId,
    role: message.role as DomainMessage['role'],
    content: message.content,
    createdAt: message.createdAt,
    metadata: (message.metadata as Record<string, unknown> | null) ?? undefined
  }))

const toLLMConfig = (config: unknown): LLMConfig => {
  if (!config || typeof config !== 'object') {
    return {}
  }

  return config as LLMConfig
}

function parseSettingInt(value: string | null | undefined, min: number, max: number): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function resolveAgentRuntimeToolNames(agentCode: string): string[] | undefined {
  return resolveScopedRuntimeToolNames({ subagentType: agentCode })
}

function mergeScopedToolNames(
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

function normalizeSkillModelOverride(skillRuntimePayload?: SkillRuntimePayload): string | undefined {
  const model = skillRuntimePayload?.model?.trim()
  return model || undefined
}

function normalizeContextInjectionType(type: unknown): ContextInjectionType {
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

function extractPlanPath(content: string): string | undefined {
  const match = content.match(
    /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
  )
  return match?.[0]
}

function normalizePlanPath(candidate: string, workspaceDir: string): string {
  const trimmed = candidate.trim().replace(/^["']|["']$/g, '')
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed)
  }
  return path.resolve(workspaceDir, trimmed)
}

export async function handleMessageSend(
  event: IpcMainInvokeEvent,
  input: MessageSendInput
): Promise<PrismaMessage> {
  const prisma = DatabaseService.getInstance().getClient()
  const logger = LoggerService.getInstance().getLogger()
  const router = new SmartRouter()

  let resolvedContent = input.content
  let skillRuntimePayload: SkillRuntimePayload | undefined

  if (input.skillCommand) {
    const skillAssembly = assembleSkillRuntimePayload(input.skillCommand, input.content)
    resolvedContent = skillAssembly.resolvedContent
    skillRuntimePayload = skillAssembly.runtimePayload
  }

  const normalizedAgentCode = (skillRuntimePayload?.agent ?? input.agentCode)?.trim()
  const agentCode =
    normalizedAgentCode && normalizedAgentCode.toLowerCase() !== 'default'
      ? normalizedAgentCode
      : undefined
  const selectedDefinition = agentCode
    ? [...PRIMARY_AGENTS, ...CATEGORY_AGENTS].find(def => def.code === agentCode)
    : undefined

  const userMessageMetadata: Record<string, unknown> = {}
  if (agentCode) {
    userMessageMetadata.agentCode = agentCode
  }
  if (skillRuntimePayload) {
    userMessageMetadata.skill = skillRuntimePayload
  }

  const userMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.message.create({
      data: {
        sessionId: input.sessionId,
        role: 'user',
        content: resolvedContent,
        metadata:
          Object.keys(userMessageMetadata).length > 0
            ? (userMessageMetadata as Prisma.InputJsonValue)
            : undefined
      }
    })

    // Ensure the owning session is marked active recently so session lists reflect activity.
    // Prisma @updatedAt will also update automatically on writes, but we make it explicit here.
    await tx.session.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() }
    })

    return created
  })

  const strategy = selectedDefinition?.defaultStrategy
    ? selectedDefinition.defaultStrategy === 'direct-enhanced'
      ? 'direct'
      : selectedDefinition.defaultStrategy
    : router.analyzeTask(resolvedContent, { agentCode })
  let assistantContent = ''
  let assistantMetadata: Record<string, unknown> | undefined = agentCode
    ? { agentCode }
    : undefined
  if (skillRuntimePayload) {
    assistantMetadata = {
      ...(assistantMetadata || {}),
      skill: skillRuntimePayload
    }
  }

  // Get workspace directory from session's space
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
    skillId: skillRuntimePayload?.id
  })
  const streamAbortController = new AbortController()
  let streamDoneSent = false
  let streamWasAborted = false
  let lastRetryNoticeAt = 0
  const unsubscribeRetryNotice = llmRetryNotifier.subscribe(notification => {
    if (notification.sessionId !== input.sessionId) return
    if (streamAbortController.signal.aborted) return

    const now = Date.now()
    if (now - lastRetryNoticeAt < 1000) return
    lastRetryNoticeAt = now

    event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, {
      sessionId: input.sessionId,
      message: `api请求失败，正在尝试重连（第${notification.attempt}次，约${Math.max(
        1,
        Math.ceil(notification.delayMs / 1000)
      )}秒后）`,
      code: 'API_RETRYING'
    })
  })

  // Ensure only one active stream per session.
  const previousController = activeStreamControllers.get(input.sessionId)
  if (previousController && !previousController.signal.aborted) {
    previousController.abort()
  }
  activeStreamControllers.set(input.sessionId, streamAbortController)

  try {
    if (strategy === 'direct') {
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
        maxToolIterations,
        workspaceDir,
        sessionId: input.sessionId,
        agentCode,
        tools: agentToolDefinitions,
        abortSignal: streamAbortController.signal
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

      const injectionCandidates: ContextInjectionCandidate[] = (messageCreateResult.injections ?? [])
        .map(injection => {
          const content = injection.content?.trim()
          if (!content) {
            return null
          }
          return {
            type: normalizeContextInjectionType(injection.type),
            source: injection.source || 'hook-manager',
            content,
            priority: injection.priority
          } satisfies ContextInjectionCandidate
        })
        .filter((candidate): candidate is ContextInjectionCandidate => candidate !== null)

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

      await toolExecutionService.withAllowedTools(effectiveRuntimeToolNames, async () => {
        for await (const chunk of adapter.streamMessage(messagesForLLM, llmConfig)) {
          if (chunk.content) {
            assistantContent += chunk.content
          }

          if (chunk.done) {
            streamDoneSent = true
          }

          event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
            sessionId: input.sessionId,
            content: chunk.content,
            done: chunk.done,
            type: chunk.type,
            toolCall: chunk.toolCall,
            error: chunk.error
          })

          if (chunk.type === 'error' && chunk.error) {
            event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, {
              sessionId: input.sessionId,
              message: chunk.error.message,
              code: chunk.error.code
            })
          }
        }
      })

      if (contextInjectionSummary && contextInjectionSummary.totalCount > 0) {
        assistantMetadata = {
          ...(assistantMetadata || {}),
          contextInjectionSummary
        }
      }

      assistantMetadata = {
        ...(assistantMetadata || {}),
        routeStrategy: strategy,
        executionPath: 'direct',
        model: modelSelection.model,
        modelSource: modelSelection.source
      }

      costTracker.trackUsage(modelSelection.provider, 0, 0)
    } else {
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
        abortSignal: streamAbortController.signal,
        forceWorkforce: selectedDefinition?.defaultStrategy === 'workforce',
        availableTools: effectiveSkillScopedToolNames,
        overrideModelSpec: skillModelOverride,
        skillRuntime: skillRuntimePayload
      })

      if (streamAbortController.signal.aborted) {
        streamWasAborted = true
        if (!streamDoneSent) {
          event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
            sessionId: input.sessionId,
            content: '',
            done: true,
            type: 'done'
          })
          streamDoneSent = true
        }
      }

      assistantContent = extractRouteOutput(routeResult)

      const executionPath =
        'workflowId' in routeResult ? 'workforce' : 'taskId' in routeResult ? 'delegate' : 'direct'
      assistantMetadata = {
        ...(assistantMetadata || {}),
        routeStrategy: strategy,
        executionPath,
        skillModelOverride: skillModelOverride ?? null,
        skillToolScopeCount: effectiveSkillScopedToolNames?.length ?? null
      }

      if (!streamWasAborted) {
        event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
          sessionId: input.sessionId,
          content: assistantContent,
          done: true,
          type: 'done'
        })
        streamDoneSent = true
      }
    }
  } catch (error) {
    streamWasAborted = streamAbortController.signal.aborted
    if (streamWasAborted) {
      logger.info('IPC message:send aborted by user', { sessionId: input.sessionId })
      if (!streamDoneSent) {
        event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
          sessionId: input.sessionId,
          content: '',
          done: true,
          type: 'done'
        })
      }
    } else {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('IPC message:send failed', { error: message, strategy })

      // Send error event to renderer
      event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, {
        sessionId: input.sessionId,
        message,
        code: 'MESSAGE_SEND_ERROR'
      })

      throw error
    }
  } finally {
    unsubscribeRetryNotice()

    if (streamAbortController.signal.aborted) {
      streamWasAborted = true
    }

    const activeController = activeStreamControllers.get(input.sessionId)
    if (activeController === streamAbortController) {
      activeStreamControllers.delete(input.sessionId)
    }
  }

  if (streamWasAborted && !assistantContent.trim()) {
    return userMessage
  }

  if (agentCode === 'fuxi' && assistantContent.trim()) {
    const detectedPlanPath = extractPlanPath(assistantContent)
    const boulderService = BoulderStateService.getInstance()
    let normalizedPlanPath: string | undefined

    if (detectedPlanPath) {
      normalizedPlanPath = normalizePlanPath(detectedPlanPath, workspaceDir)
    } else {
      try {
        const tracked = await boulderService.isSessionTracked(input.sessionId)
        const state = await boulderService.getState()
        if (tracked && state.active_plan) {
          normalizedPlanPath = normalizePlanPath(state.active_plan, workspaceDir)
        }
      } catch (error) {
        logger.warn('Failed to read boulder state after FuXi planning', {
          sessionId: input.sessionId,
          planPath: detectedPlanPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const looksLikePlanOutput =
      /(TL;DR|TODOs|Execution Strategy|Success Criteria|工作目标|执行策略|成功标准|计划|TODO)/i.test(
        assistantContent
      )
    const resolvedPlanPath = normalizedPlanPath && fs.existsSync(normalizedPlanPath) ? normalizedPlanPath : undefined

    if (resolvedPlanPath && (detectedPlanPath || looksLikePlanOutput)) {
      try {
        const state = await boulderService.getState()
        const sessionIds = new Set(state.session_ids || [])
        sessionIds.add(input.sessionId)

        await boulderService.updateState({
          active_plan: resolvedPlanPath,
          plan_name: path.basename(resolvedPlanPath, path.extname(resolvedPlanPath)),
          session_ids: Array.from(sessionIds),
          agent: 'fuxi',
          status: 'in_progress'
        })
      } catch (error) {
        logger.warn('Failed to update boulder state after FuXi planning', {
          sessionId: input.sessionId,
          planPath: resolvedPlanPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      assistantContent = `${assistantContent}\n\n---\n\n✅ 伏羲已完成规划，建议切换到夸父(KuaFu)执行。\n请发送：\`执行计划 ${resolvedPlanPath}\``
      assistantMetadata = {
        ...(assistantMetadata || {}),
        handoffToAgent: 'kuafu',
        planPath: resolvedPlanPath
      }
    }
  }

  const assistantMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.message.create({
      data: {
        sessionId: userMessage.sessionId,
        role: 'assistant',
        content: assistantContent,
        metadata: (assistantMetadata || {}) as Prisma.InputJsonValue
      }
    })

    await tx.session.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() }
    })

    return created
  })

  return assistantMessage
}

export async function handleMessageAbort(
  _event: IpcMainInvokeEvent,
  input: MessageAbortInput
): Promise<{
  success: boolean
  abortedStream: boolean
  cancelledBackgroundTaskCount: number
  cancelledTaskRows: number
}> {
  const prisma = DatabaseService.getInstance().getClient()
  const sessionId = input.sessionId

  const controller = activeStreamControllers.get(sessionId)
  const abortedStream = Boolean(controller && !controller.signal.aborted)
  if (abortedStream) {
    controller?.abort()
  }

  taskContinuationService.markAborted(sessionId)

  const runningTasks = backgroundTaskManager.getRunningTasks()
  const sessionTaskIds = runningTasks
    .filter(task => {
      const meta = (task.metadata || {}) as Record<string, unknown>
      return meta.sessionId === sessionId
    })
    .map(task => task.id)

  if (sessionTaskIds.length > 0) {
    await cancelTasks(sessionTaskIds, { signal: 'SIGTERM' })
  }

  const cancelledRows = await prisma.task.updateMany({
    where: {
      sessionId,
      status: { in: ['pending', 'running'] }
    },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      output: 'Cancelled by user'
    }
  })

  return {
    success: true,
    abortedStream,
    cancelledBackgroundTaskCount: sessionTaskIds.length,
    cancelledTaskRows: cancelledRows.count
  }
}

export async function handleMessageList(
  _event: IpcMainInvokeEvent,
  sessionId: string
): Promise<PrismaMessage[]> {
  const db = DatabaseService.getInstance()
  await db.init()
  const prisma = db.getClient()
  return prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' }
  })
}

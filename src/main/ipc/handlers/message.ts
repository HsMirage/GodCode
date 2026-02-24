import { IpcMainInvokeEvent } from 'electron'
import { Prisma, type Message as PrismaMessage } from '@prisma/client'
import type { Message as DomainMessage } from '@/types/domain'
import type { LLMConfig } from '@/main/services/llm/adapter.interface'
import { DatabaseService } from '@/main/services/database'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { costTracker } from '@/main/services/llm/cost-tracker'
import { LoggerService } from '@/main/services/logger'
import { SmartRouter, type RouteResult } from '@/main/services/router/smart-router'
import { SecureStorageService } from '@/main/services/secure-storage.service'
import { taskContinuationService } from '@/main/services/task-continuation.service'
import { backgroundTaskManager, cancelTasks } from '@/main/services/tools/background'
import { toolExecutionService } from '@/main/services/tools/tool-execution.service'
import { getAgentPromptByCode } from '@/main/services/delegate/agents'
import { resolveScopedRuntimeToolNames } from '@/main/services/delegate/tool-allowlist'
import { llmRetryNotifier } from '@/main/services/llm/retry-notifier'
import { EVENT_CHANNELS } from '@/shared/ipc-channels'
import { PRIMARY_AGENTS, CATEGORY_AGENTS } from '@/shared/agent-definitions'
import { BoulderStateService } from '@/main/services/boulder-state.service'
import path from 'node:path'
import fs from 'node:fs'

type MessageSendInput = {
  sessionId: string
  content: string
  agentCode?: string
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

function resolveAgentRuntimeToolNames(agentCode: string): string[] | undefined {
  return resolveScopedRuntimeToolNames({ subagentType: agentCode })
}

function extractRouteOutput(result: RouteResult): string {
  if ('strategy' in result && result.strategy === 'direct') {
    return result.output
  }
  if ('taskId' in result) {
    return result.output
  }
  if ('workflowId' in result) {
    if (result.tasks.length === 0) {
      return '工作流执行完成：当前计划没有未完成任务。'
    }
    const taskSummary = result.tasks
      .map(task => {
        const execution = result.executions.get(task.id)
        const assignment = task.assignedAgent
          ? `执行: ${task.assignedAgent}`
          : task.assignedCategory
            ? `类别: ${task.assignedCategory}`
            : ''
        const model = execution?.model ? `模型: ${execution.model}` : ''
        const details = [assignment, model].filter(Boolean).join('，')
        return `- ${task.description}${details ? `（${details}）` : ''}`
      })
      .join('\n')
    const outputs = Array.from(result.results.entries())
      .map(([taskId, output]) => {
        const execution = result.executions.get(taskId)
        const heading = execution?.model
          ? `### ${taskId} (${execution.model})`
          : `### ${taskId}`
        return `${heading}\n${output}`
      })
      .join('\n\n---\n\n')

    const checkpoints = Array.isArray(result.orchestratorCheckpoints)
      ? result.orchestratorCheckpoints
      : []
    const checkpointSummary =
      checkpoints.length > 0
        ? (() => {
            const fallbackCount = checkpoints.filter(item => item.status === 'fallback').length
            const haltCount = checkpoints.filter(item => item.status === 'halt').length
            const last = checkpoints[checkpoints.length - 1]
            return [
              'Orchestrator Checkpoints:',
              `- 参与状态: ${result.orchestratorParticipation ? '已参与' : '未参与'}`,
              `- 总次数: ${checkpoints.length}`,
              `- 最后检查点: ${last.phase} / ${last.status}`,
              `- fallback次数: ${fallbackCount}`,
              `- halt次数: ${haltCount}`
            ].join('\n')
          })()
        : 'Orchestrator Checkpoints:\n- 参与状态: 未记录检查点'

    return `工作流执行完成。\n\n任务分解与分配:\n${taskSummary}\n\n${checkpointSummary}\n\n执行结果:\n\n${outputs}`
  }
  return ''
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
  const normalizedAgentCode = input.agentCode?.trim()
  const agentCode =
    normalizedAgentCode && normalizedAgentCode.toLowerCase() !== 'default'
      ? normalizedAgentCode
      : undefined
  const selectedDefinition = agentCode
    ? [...PRIMARY_AGENTS, ...CATEGORY_AGENTS].find(def => def.code === agentCode)
    : undefined

  const userMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.message.create({
      data: {
        sessionId: input.sessionId,
        role: 'user',
        content: input.content,
        metadata: agentCode ? { agentCode } : {}
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
    : router.analyzeTask(input.content, { agentCode })
  let assistantContent = ''
  let assistantMetadata: Record<string, unknown> | undefined = agentCode
    ? { agentCode }
    : undefined

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
    strategy
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
    if (strategy === 'direct' || strategy === 'direct-enhanced') {
      // Enforced resolution order:
      // 1) agent-specific bound model (Settings -> Agent Bindings)
      // 2) system global default model (Settings -> defaultModelId)
      // 3) otherwise: block with a clear error
      const bindingPromise = agentCode
        ? prisma.agentBinding.findUnique({
            where: { agentCode },
            select: { enabled: true, modelId: true, temperature: true }
          })
        : Promise.resolve(null)

      const [binding, defaultModelSetting] = await Promise.all([
        bindingPromise,
        prisma.systemSetting.findUnique({ where: { key: 'defaultModelId' } })
      ])

      let resolvedModelId: string | null = null
      if (binding?.enabled && binding.modelId) {
        resolvedModelId = binding.modelId
      } else {
        resolvedModelId = defaultModelSetting?.value?.trim() || null
      }

      const resolvedModel = resolvedModelId
        ? await prisma.model.findUnique({
            where: { id: resolvedModelId },
            include: { apiKeyRef: true }
          })
        : null

      if (!resolvedModel) {
        throw new Error(
          '未配置可用模型。请在“设置 -> 模型”中设置系统默认模型，或在“设置 -> Agent 绑定”中为当前 Agent 绑定模型。'
        )
      }

      // Credentials resolution (new relation first, legacy fallback)
      const encryptedApiKey = resolvedModel.apiKeyRef?.encryptedKey ?? resolvedModel.apiKey
      const resolvedBaseURL = resolvedModel.apiKeyRef?.baseURL ?? resolvedModel.baseURL ?? undefined

      if (!encryptedApiKey) {
        throw new Error('当前模型缺少 API Key。请在“设置 -> API Keys / 模型”中补全后重试。')
      }

      // Decrypt API key before use
      const secureStorage = SecureStorageService.getInstance()
      const decryptedApiKey = secureStorage.decrypt(encryptedApiKey)

      const adapter = createLLMAdapter(resolvedModel.provider, {
        apiKey: decryptedApiKey,
        baseURL: resolvedBaseURL
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
      const agentToolNames = effectiveScopedAgentToolNames ?? []
      const agentToolDefinitions =
        effectiveScopedAgentToolNames !== undefined
          ? toolExecutionService.getToolDefinitions(agentToolNames)
          : undefined

      const baseConfig = toLLMConfig(resolvedModel.config)
      const llmConfig = {
        ...baseConfig,
        model: resolvedModel.modelName,
        temperature: binding?.temperature ?? baseConfig.temperature,
        workspaceDir,
        sessionId: input.sessionId,
        agentCode,
        tools: agentToolDefinitions,
        abortSignal: streamAbortController.signal
      }

      logger.info('[handleMessageSend] Resolved chat model', {
        agentCode,
        resolvedModelId,
        provider: resolvedModel.provider,
        modelName: resolvedModel.modelName,
        baseURL: resolvedBaseURL,
        temperature: llmConfig.temperature,
        hasAgentSystemPrompt: Boolean(agentSystemPrompt),
        agentToolCount: agentToolNames.length
      })

      const domainMessages = toDomainMessages(history)
      const messagesForLLM: DomainMessage[] = agentSystemPrompt
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

      await toolExecutionService.withAllowedTools(effectiveScopedAgentToolNames, async () => {
        for await (const chunk of adapter.streamMessage(messagesForLLM, llmConfig)) {
          // Accumulate text content
          if (chunk.content) {
            assistantContent += chunk.content
          }

          if (chunk.done) {
            streamDoneSent = true
          }

          // Send stream chunk event with full type information
          event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
            sessionId: input.sessionId,
            content: chunk.content,
            done: chunk.done,
            type: chunk.type,
            toolCall: chunk.toolCall,
            error: chunk.error
          })

          // If there's an error, also send to the error channel
          if (chunk.type === 'error' && chunk.error) {
            event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, {
              sessionId: input.sessionId,
              message: chunk.error.message,
              code: chunk.error.code
            })
          }
        }
      })

      costTracker.trackUsage(resolvedModel.provider, 0, 0)
    } else {
      const routeContext = {
        sessionId: input.sessionId,
        prompt: input.content,
        agentCode,
        abortSignal: streamAbortController.signal
      }
      const routeResult = await router.route(input.content, {
        ...routeContext,
        forceWorkforce: selectedDefinition?.defaultStrategy === 'workforce'
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

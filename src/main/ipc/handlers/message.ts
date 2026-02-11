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
import { EVENT_CHANNELS } from '@/shared/ipc-channels'
import { getAgentByCode, PRIMARY_AGENTS, CATEGORY_AGENTS } from '@/shared/agent-definitions'

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

const AGENT_TOOL_ALIAS_MAP: Record<string, string[]> = {
  read: ['file_read'],
  write: ['file_write'],
  edit: ['file_write'],
  bash: ['bash'],
  glob: ['glob'],
  grep: ['grep'],
  webfetch: ['webfetch'],
  websearch: ['websearch'],
  look_at: ['look_at'],
  browser_navigate: ['browser_navigate'],
  browser_click: ['browser_click'],
  browser_fill: ['browser_fill'],
  browser_snapshot: ['browser_snapshot'],
  browser_screenshot: ['browser_screenshot'],
  browser_extract: ['browser_extract'],
  lsp_diagnostics: ['lsp_diagnostics'],
  lsp_goto_definition: ['lsp_goto_definition'],
  lsp_find_references: ['lsp_find_references'],
  lsp_symbols: ['lsp_symbols']
}

const AGENT_CODE_ALIASES: Record<string, string> = {
  explore: 'qianliyan',
  oracle: 'baize',
  librarian: 'diting',
  metis: 'chongming',
  momus: 'leigong',
  prometheus: 'fuxi',
  sisyphus: 'haotian',
  atlas: 'kuafu',
  hephaestus: 'luban'
}

function resolveAgentRuntimeToolNames(agentCode: string): string[] | undefined {
  const resolvedAgentCode = AGENT_CODE_ALIASES[agentCode] || agentCode
  const agentDefinition = getAgentByCode(resolvedAgentCode)
  if (!agentDefinition) {
    return undefined
  }

  if (agentDefinition.tools.length === 0) {
    return []
  }

  const availableToolNames = new Set(
    toolExecutionService.getToolDefinitions().map(tool => tool.name)
  )
  const resolvedToolNames = agentDefinition.tools
    .flatMap(toolName => AGENT_TOOL_ALIAS_MAP[toolName] ?? [toolName])
    .filter(toolName => availableToolNames.has(toolName))

  return Array.from(new Set(resolvedToolNames))
}

function extractRouteOutput(result: RouteResult): string {
  if ('strategy' in result && result.strategy === 'direct') {
    return result.output
  }
  if ('taskId' in result) {
    return result.output
  }
  if ('workflowId' in result) {
    return Array.from(result.results.values()).join('\n\n---\n\n')
  }
  return ''
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
    : router.analyzeTask(input.content)
  let assistantContent = ''

  // Get workspace directory from session's space
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: { space: true }
  })
  const workspaceDir = session?.space?.workDir || process.cwd()
  const streamAbortController = new AbortController()
  let streamDoneSent = false
  let streamWasAborted = false

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
      const agentToolNames = scopedAgentToolNames ?? []
      const agentToolDefinitions =
        scopedAgentToolNames !== undefined
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

      await toolExecutionService.withAllowedTools(scopedAgentToolNames, async () => {
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
        agentCode
      }
      const routeResult =
        selectedDefinition?.defaultStrategy === 'workforce'
          ? await new SmartRouter([{ pattern: /.*/i, strategy: 'workforce' }]).route(
              input.content,
              routeContext
            )
          : await router.route(input.content, routeContext)

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

  const assistantMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.message.create({
      data: {
        sessionId: userMessage.sessionId,
        role: 'assistant',
        content: assistantContent,
        metadata: agentCode ? { agentCode } : {}
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
  const prisma = DatabaseService.getInstance().getClient()
  return prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' }
  })
}

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

type MessageSendInput = {
  sessionId: string
  content: string
}

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

  const userMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    return tx.message.create({
      data: {
        sessionId: input.sessionId,
        role: 'user',
        content: input.content
      }
    })
  })

  const strategy = router.analyzeTask(input.content)
  let assistantContent = ''

  try {
    if (strategy === 'direct') {
      const isE2ETest = process.env.CODEALL_E2E_TEST === '1'
      const model = await prisma.model.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { apiKeyRef: true }
      })
      const resolvedModel =
        model ??
        (isE2ETest
          ? { provider: 'mock', apiKey: 'mock', baseURL: null, config: {}, apiKeyRef: null }
          : null)

      // Debug: 打印从数据库读取的模型配置
      logger.info('[handleMessageSend] Model from database', {
        hasModel: !!model,
        provider: model?.provider,
        modelName: model?.modelName,
        baseURL: model?.apiKeyRef?.baseURL ?? model?.baseURL,
        hasApiKeyRef: !!model?.apiKeyRef,
        hasApiKey: !!model?.apiKey,
        hasApiKeyRefEncryptedKey: !!model?.apiKeyRef?.encryptedKey
      })

      if (!resolvedModel) {
        throw new Error('No active model configured')
      }

      // Credentials resolution (new relation first, legacy fallback)
      const encryptedApiKey = resolvedModel.apiKeyRef?.encryptedKey ?? resolvedModel.apiKey
      const resolvedBaseURL = resolvedModel.apiKeyRef?.baseURL ?? resolvedModel.baseURL ?? undefined

      if (!encryptedApiKey) {
        if (!isE2ETest) {
          throw new Error('Active model API key is missing')
        }
      }

      // Decrypt API key before use
      const secureStorage = SecureStorageService.getInstance()
      const decryptedApiKey = encryptedApiKey ? secureStorage.decrypt(encryptedApiKey) : 'mock'

      const adapter = createLLMAdapter(resolvedModel.provider, {
        apiKey: decryptedApiKey,
        baseURL: resolvedBaseURL
      })

      const history = await prisma.message.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { createdAt: 'asc' }
      })

      const baseConfig = toLLMConfig(resolvedModel.config)
      // 确保使用用户配置的模型名称
      const llmConfig = {
        ...baseConfig,
        model: 'modelName' in resolvedModel ? resolvedModel.modelName : baseConfig.model
      }

      // Debug: 打印最终的 LLM 配置
      logger.info('[handleMessageSend] Final LLM config', {
        model: llmConfig.model,
        baseConfig
      })

      const domainMessages = toDomainMessages(history)

      for await (const chunk of adapter.streamMessage(domainMessages, llmConfig)) {
        if (chunk.content) {
          assistantContent += chunk.content
        }

        event.sender.send('message:stream-chunk', {
          content: chunk.content,
          done: chunk.done
        })
      }

      costTracker.trackUsage(resolvedModel.provider, 0, 0)
    } else {
      const routeResult = await router.route(input.content, {
        prompt: input.content
      })

      assistantContent = extractRouteOutput(routeResult)

      event.sender.send('message:stream-chunk', {
        content: assistantContent,
        done: true
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('IPC message:send failed', { error: message, strategy })
    throw error
  }

  const assistantMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    return tx.message.create({
      data: {
        sessionId: userMessage.sessionId,
        role: 'assistant',
        content: assistantContent
      }
    })
  })

  return assistantMessage
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

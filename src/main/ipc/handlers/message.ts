import { IpcMainInvokeEvent } from 'electron'
import { Prisma, type Message as PrismaMessage } from '@prisma/client'
import type { Message as DomainMessage } from '@/types/domain'
import type { LLMConfig } from '@/main/services/llm/adapter.interface'
import { DatabaseService } from '@/main/services/database'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { costTracker } from '@/main/services/llm/cost-tracker'
import { LoggerService } from '@/main/services/logger'
import { SmartRouter, type RouteResult } from '@/main/services/router/smart-router'

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
      const model = await prisma.model.findFirst({ orderBy: { createdAt: 'desc' } })
      const resolvedModel =
        model ?? (isE2ETest ? { provider: 'mock', apiKey: 'mock', config: {} } : null)

      if (!resolvedModel) {
        throw new Error('No active model configured')
      }

      if (!resolvedModel.apiKey) {
        if (!isE2ETest) {
          throw new Error('Active model API key is missing')
        }
      }

      const adapter = createLLMAdapter(resolvedModel.provider, {
        apiKey: resolvedModel.apiKey ?? 'mock'
      })

      const history = await prisma.message.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { createdAt: 'asc' }
      })

      const llmConfig = toLLMConfig(resolvedModel.config)
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

import { IpcMainInvokeEvent } from 'electron'
import type { Message as PrismaMessage } from '@prisma/client'
import type { Message as DomainMessage } from '@/types/domain'
import type { LLMConfig } from '@/main/services/llm/adapter.interface'
import { DatabaseService } from '@/main/services/database'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { costTracker } from '@/main/services/llm/cost-tracker'
import { LoggerService } from '@/main/services/logger'

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

export async function handleMessageSend(
  event: IpcMainInvokeEvent,
  input: MessageSendInput
): Promise<PrismaMessage> {
  const prisma = DatabaseService.getInstance().getClient()
  const logger = LoggerService.getInstance().getLogger()

  const userMessage = await prisma.$transaction(async tx => {
    return tx.message.create({
      data: {
        sessionId: input.sessionId,
        role: 'user',
        content: input.content
      }
    })
  })

  const model = await prisma.model.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!model) {
    throw new Error('No active model configured')
  }

  if (!model.apiKey) {
    throw new Error('Active model API key is missing')
  }

  const adapter = createLLMAdapter(model.provider as 'anthropic', {
    apiKey: model.apiKey
  })

  const history = await prisma.message.findMany({
    where: { sessionId: input.sessionId },
    orderBy: { createdAt: 'asc' }
  })

  const llmConfig = toLLMConfig(model.config)
  const domainMessages = toDomainMessages(history)
  let assistantContent = ''

  try {
    for await (const chunk of adapter.streamMessage(domainMessages, llmConfig)) {
      if (chunk.content) {
        assistantContent += chunk.content
      }

      event.sender.send('message:stream-chunk', {
        content: chunk.content,
        done: chunk.done
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('IPC message:send streaming failed', { error: message })
    throw error
  }

  const assistantMessage = await prisma.$transaction(async tx => {
    return tx.message.create({
      data: {
        sessionId: userMessage.sessionId,
        role: 'assistant',
        content: assistantContent
      }
    })
  })

  costTracker.trackUsage(model.provider, 0, 0)
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

import { IpcMainInvokeEvent } from 'electron'
import type { Message as PrismaMessage } from '@prisma/client'
import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { recoveryMetadataService } from '@/main/services/recovery-metadata.service'
import { SmartRouter } from '@/main/services/router/smart-router'
import { taskContinuationService } from '@/main/services/task-continuation.service'
import { backgroundTaskManager, cancelTasks } from '@/main/services/tools/background'
import { createTraceContext } from '@/shared/trace-contract'
import {
  buildMessageRuntimeContext
} from '@/main/services/message/message-runtime-context.service'
import { persistUserMessage } from '@/main/services/message/message-persistence.service'
import {
  abortActiveMessageStream,
  createMessageStreamSession
} from '@/main/services/message/message-stream.service'
import { executeMessage } from '@/main/services/message/message-execution.service'
import { finalizeMessageExecution } from '@/main/services/message/message-finalizer.service'
import type { MessageAbortInput, MessageExecutionResult, MessageSendInput } from '@/main/services/message/message.types'

export async function handleMessageSend(
  event: IpcMainInvokeEvent,
  input: MessageSendInput
): Promise<PrismaMessage> {
  const prisma = DatabaseService.getInstance().getClient()
  const logger = LoggerService.getInstance().getLogger()
  const router = new SmartRouter()
  const tracedInput: MessageSendInput = {
    ...input,
    traceContext: input.traceContext ?? createTraceContext({ sessionId: input.sessionId })
  }
  const runtimeContext = await buildMessageRuntimeContext({
    prisma,
    logger,
    router,
    input: tracedInput
  })
  const userMessage = await persistUserMessage({
    prisma,
    sessionId: input.sessionId,
    content: runtimeContext.resolvedContent,
    metadata: runtimeContext.userMessageMetadata
  })
  const stream = createMessageStreamSession(event, input.sessionId)
  let executionResult: MessageExecutionResult = {
    assistantContent: '',
    assistantMetadata: runtimeContext.initialAssistantMetadata
  }
  const isContinuationRecovery =
    tracedInput.resumeContext?.recoverySource === 'manual-resume' ||
    tracedInput.resumeContext?.recoverySource === 'auto-resume'

  if (isContinuationRecovery && tracedInput.resumeContext) {
    taskContinuationService.markRecovering(input.sessionId)
    await recoveryMetadataService.annotateSessionTasks(
      tracedInput.sessionId,
      tracedInput.resumeContext,
      'todo-tasks'
    )
  }

  try {
    try {
      executionResult = await executeMessage({
        prisma,
        router,
        logger,
        runtimeContext,
        stream
      })
    } catch (error) {
      stream.handleCaughtError(error, logger, runtimeContext.strategy)
    } finally {
      stream.dispose()
    }

    return finalizeMessageExecution({
      prisma,
      logger,
      runtimeContext,
      userMessage,
      executionResult,
      streamWasAborted: stream.wasAborted
    })
  } finally {
    if (isContinuationRecovery) {
      taskContinuationService.markRecoveryComplete(input.sessionId)
    }
  }
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

  const abortedStream = abortActiveMessageStream(sessionId)

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

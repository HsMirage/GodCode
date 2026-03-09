import type { IpcMainInvokeEvent } from 'electron'
import type { LLMChunk } from '@/main/services/llm/adapter.interface'
import { llmRetryNotifier, type LLMRetryNotification } from '@/main/services/llm/retry-notifier'
import { EVENT_CHANNELS } from '@/shared/ipc-channels'
import type { MessageLogger } from './message.types'
import { executionEventPersistenceService } from '../execution-event-persistence.service'

const activeStreamControllers = new Map<string, AbortController>()

function buildRetryNotice(notification: LLMRetryNotification): string {
  const retryInSeconds = Math.max(1, Math.ceil(notification.delayMs / 1000))

  const prefix = (() => {
    switch (notification.classification) {
      case 'NETWORK_ERROR':
        return '模型连接异常，正在重试'
      case 'TIMEOUT':
      case 'GATEWAY_TIMEOUT':
        return '模型请求超时，正在重试'
      case 'RATE_LIMIT':
        return '模型请求触发限流，正在重试'
      case 'SERVICE_UNAVAILABLE':
      case 'SERVER_ERROR':
        return '模型服务暂时不可用，正在重试'
      case 'RESOURCE_BUSY':
        return '模型服务繁忙或响应不完整，正在重试'
      default:
        return '模型请求失败，正在重试'
    }
  })()

  return `${prefix}（第${notification.attempt}次，约${retryInSeconds}秒后）`
}

export class MessageStreamSession {
  private readonly abortController = new AbortController()
  private readonly unsubscribeRetryNotice: () => void
  private streamDoneSent = false
  private streamWasAborted = false
  private lastRetryNoticeAt = 0

  constructor(
    private readonly event: IpcMainInvokeEvent,
    readonly sessionId: string
  ) {
    void executionEventPersistenceService.appendEvent({
      sessionId: this.sessionId,
      type: 'message-stream-started',
      payload: {
        source: 'message-stream-session'
      }
    })

    this.unsubscribeRetryNotice = llmRetryNotifier.subscribe(notification => {
      if (notification.sessionId !== this.sessionId) return
      if (this.abortController.signal.aborted) return

      const now = Date.now()
      if (now - this.lastRetryNoticeAt < 1000) return
      this.lastRetryNoticeAt = now

      this.sendError(buildRetryNotice(notification), 'API_RETRYING')
    })
  }

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  get controller(): AbortController {
    return this.abortController
  }

  get wasAborted(): boolean {
    return this.streamWasAborted || this.abortController.signal.aborted
  }

  get doneSent(): boolean {
    return this.streamDoneSent
  }

  abort(): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort()
    }
  }

  sendChunk(chunk: Pick<LLMChunk, 'content' | 'done' | 'type' | 'toolCall' | 'error'>): void {
    if (chunk.done) {
      this.streamDoneSent = true
    }

    if ((chunk.type === 'content' && chunk.content) || chunk.done) {
      void executionEventPersistenceService.appendEvent({
        sessionId: this.sessionId,
        type: 'llm-response-chunked',
        payload: {
          size: chunk.content.length,
          done: chunk.done,
          eventType: chunk.type || (chunk.done ? 'done' : 'content')
        }
      })
    }

    this.event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
      sessionId: this.sessionId,
      content: chunk.content,
      done: chunk.done,
      type: chunk.type,
      toolCall: chunk.toolCall,
      error: chunk.error
    })
  }

  forwardAdapterChunk(chunk: LLMChunk): void {
    if (chunk.type === 'usage' && chunk.usage) {
      this.sendUsage(chunk.usage)
      return
    }

    this.sendChunk(chunk)

    if (chunk.type === 'error' && chunk.error) {
      this.sendError(chunk.error.message, chunk.error.code)
    }
  }

  sendDone(content = ''): void {
    if (this.streamDoneSent) {
      return
    }

    this.sendChunk({
      content,
      done: true,
      type: 'done'
    })
  }

  sendError(message: string, code = 'MESSAGE_SEND_ERROR'): void {
    this.event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, {
      sessionId: this.sessionId,
      message,
      code
    })
  }

  sendUsage(usage: NonNullable<LLMChunk['usage']>): void {
    this.event.sender.send(EVENT_CHANNELS.MESSAGE_STREAM_USAGE, {
      sessionId: this.sessionId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens
    })
  }

  handleCaughtError(error: unknown, logger: MessageLogger, strategy: string): void {
    this.streamWasAborted = this.abortController.signal.aborted

    if (this.streamWasAborted) {
      logger.info('IPC message:send aborted by user', { sessionId: this.sessionId })
      this.sendDone()
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    logger.error('IPC message:send failed', { error: message, strategy })
    this.sendError(message)
    throw error
  }

  dispose(): void {
    this.unsubscribeRetryNotice()

    if (this.abortController.signal.aborted) {
      this.streamWasAborted = true
    }

    const activeController = activeStreamControllers.get(this.sessionId)
    if (activeController === this.abortController) {
      activeStreamControllers.delete(this.sessionId)
    }
  }
}

export function createMessageStreamSession(
  event: IpcMainInvokeEvent,
  sessionId: string
): MessageStreamSession {
  const previousController = activeStreamControllers.get(sessionId)
  if (previousController && !previousController.signal.aborted) {
    previousController.abort()
  }

  const stream = new MessageStreamSession(event, sessionId)
  activeStreamControllers.set(sessionId, stream.controller)
  return stream
}

export function abortActiveMessageStream(sessionId: string): boolean {
  const controller = activeStreamControllers.get(sessionId)
  const abortedStream = Boolean(controller && !controller.signal.aborted)
  if (abortedStream) {
    controller?.abort()
  }
  return abortedStream
}

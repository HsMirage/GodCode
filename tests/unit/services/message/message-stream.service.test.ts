import { describe, expect, test, vi } from 'vitest'
import { EVENT_CHANNELS } from '../../../../src/shared/ipc-channels'
import { llmRetryNotifier } from '../../../../src/main/services/llm/retry-notifier'
import { RetryableErrorType } from '../../../../src/main/services/workforce/retry'

const { appendEvent } = vi.hoisted(() => ({
  appendEvent: vi.fn()
}))

vi.mock('../../../../src/main/services/execution-event-persistence.service', () => ({
  executionEventPersistenceService: {
    appendEvent
  }
}))

import {
  abortActiveMessageStream,
  createMessageStreamSession
} from '../../../../src/main/services/message/message-stream.service'

describe('message-stream.service', () => {
  test('forwards stream chunk and error events to renderer channels', () => {
    const send = vi.fn()
    const stream = createMessageStreamSession({ sender: { send } } as any, 'session-stream-error')

    try {
      stream.forwardAdapterChunk({
        content: 'partial failure',
        done: false,
        type: 'error',
        error: {
          message: 'boom',
          code: 'TEST_ERROR'
        }
      })

      expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.MESSAGE_STREAM_CHUNK, {
        sessionId: 'session-stream-error',
        content: 'partial failure',
        done: false,
        type: 'error',
        toolCall: undefined,
        error: {
          message: 'boom',
          code: 'TEST_ERROR'
        }
      })
      expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.MESSAGE_STREAM_ERROR, {
        sessionId: 'session-stream-error',
        message: 'boom',
        code: 'TEST_ERROR'
      })
      expect(appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'message-stream-started', sessionId: 'session-stream-error' })
      )
    } finally {
      stream.dispose()
    }
  })

  test('persists chunk progress events', () => {
    const send = vi.fn()
    const stream = createMessageStreamSession({ sender: { send } } as any, 'session-progress')

    try {
      stream.forwardAdapterChunk({
        content: 'partial content',
        done: false,
        type: 'content'
      })

      expect(appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'llm-response-chunked',
          sessionId: 'session-progress'
        })
      )
    } finally {
      stream.dispose()
    }
  })

  test('publishes retry notifications to stream error channel', () => {
    const send = vi.fn()
    const stream = createMessageStreamSession({ sender: { send } } as any, 'session-retry')

    try {
      llmRetryNotifier.notify({
        sessionId: 'session-retry',
        provider: 'openai',
        attempt: 2,
        delayMs: 1200,
        error: 'temporary failure',
        classification: RetryableErrorType.NETWORK_ERROR,
        nextAction: 'retry',
        manualTakeoverRequired: false,
        occurredAt: new Date('2026-03-06T00:00:00.000Z')
      })

      expect(send).toHaveBeenCalledWith(
        EVENT_CHANNELS.MESSAGE_STREAM_ERROR,
        expect.objectContaining({
          sessionId: 'session-retry',
          message: '模型连接异常，正在重试（第2次，约2秒后）',
          code: 'API_RETRYING'
        })
      )
    } finally {
      stream.dispose()
    }
  })

  test('formats busy retries without claiming api connectivity failure', () => {
    const send = vi.fn()
    const stream = createMessageStreamSession({ sender: { send } } as any, 'session-busy-retry')

    try {
      llmRetryNotifier.notify({
        sessionId: 'session-busy-retry',
        provider: 'openai',
        attempt: 1,
        delayMs: 500,
        error: 'temporary empty output',
        classification: RetryableErrorType.RESOURCE_BUSY,
        nextAction: 'retry',
        manualTakeoverRequired: false,
        occurredAt: new Date('2026-03-06T00:00:00.000Z')
      })

      expect(send).toHaveBeenCalledWith(
        EVENT_CHANNELS.MESSAGE_STREAM_ERROR,
        expect.objectContaining({
          sessionId: 'session-busy-retry',
          message: '模型服务繁忙或响应不完整，正在重试（第1次，约1秒后）',
          code: 'API_RETRYING'
        })
      )
    } finally {
      stream.dispose()
    }
  })

  test('forwards usage payload to usage event channel', () => {
    const send = vi.fn()
    const stream = createMessageStreamSession({ sender: { send } } as any, 'session-usage')

    try {
      stream.forwardAdapterChunk({
        content: '',
        done: false,
        type: 'usage',
        usage: {
          promptTokens: 12,
          completionTokens: 8,
          totalTokens: 20
        }
      })

      expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.MESSAGE_STREAM_USAGE, {
        sessionId: 'session-usage',
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20
      })
    } finally {
      stream.dispose()
    }
  })

  test('aborts active stream by session id', () => {
    const stream = createMessageStreamSession({ sender: { send: vi.fn() } } as any, 'session-abort')

    try {
      expect(abortActiveMessageStream('session-abort')).toBe(true)
      expect(stream.signal.aborted).toBe(true)
    } finally {
      stream.dispose()
    }
  })
})

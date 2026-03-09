import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const mockPrisma = {
  task: {
    updateMany: vi.fn()
  },
  message: {
    findMany: vi.fn()
  }
}

const mockDb = {
  init: vi.fn(),
  getClient: vi.fn(() => mockPrisma)
}

const buildMessageRuntimeContext = vi.fn()
const persistUserMessage = vi.fn()
const createMessageStreamSession = vi.fn()
const abortActiveMessageStream = vi.fn()
const executeMessage = vi.fn()
const finalizeMessageExecution = vi.fn()
const markAborted = vi.fn()
const markRecovering = vi.fn()
const markRecoveryComplete = vi.fn()
const getRunningTasks = vi.fn()
const cancelTasks = vi.fn()
const annotateSessionTasks = vi.fn()

vi.mock('@/main/services/database', () => ({
  DatabaseService: {
    getInstance: () => mockDb
  }
}))

vi.mock('@/main/services/logger', () => ({
  LoggerService: {
    getInstance: () => ({
      getLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    })
  }
}))

vi.mock('@/main/services/router/smart-router', () => ({
  SmartRouter: class {}
}))

vi.mock('@/main/services/task-continuation.service', () => ({
  taskContinuationService: {
    markAborted,
    markRecovering,
    markRecoveryComplete
  }
}))

vi.mock('@/main/services/recovery-metadata.service', () => ({
  recoveryMetadataService: {
    annotateSessionTasks
  }
}))

vi.mock('@/main/services/tools/background', () => ({
  backgroundTaskManager: {
    getRunningTasks
  },
  cancelTasks
}))

vi.mock('@/main/services/message/message-runtime-context.service', () => ({
  buildMessageRuntimeContext
}))

vi.mock('@/main/services/message/message-persistence.service', () => ({
  persistUserMessage
}))

vi.mock('@/main/services/message/message-stream.service', () => ({
  createMessageStreamSession,
  abortActiveMessageStream
}))

vi.mock('@/main/services/message/message-execution.service', () => ({
  executeMessage
}))

vi.mock('@/main/services/message/message-finalizer.service', () => ({
  finalizeMessageExecution
}))

describe('message IPC handler orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.task.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.message.findMany.mockResolvedValue([])
    mockDb.init.mockResolvedValue(undefined)
  })

  test('handleMessageSend delegates orchestration to message services', async () => {
    const { handleMessageSend } = await import('../../../src/main/ipc/handlers/message')

    const input = { sessionId: 'session-1', content: 'hello', agentCode: 'luban' }
    const runtimeContext = {
      input,
      resolvedContent: 'hello',
      strategy: 'direct',
      workspaceDir: '/tmp/workspace',
      userMessageMetadata: { agentCode: 'luban' },
      initialAssistantMetadata: { agentCode: 'luban' }
    }
    const userMessage = { id: 'user-1', sessionId: 'session-1', role: 'user', content: 'hello' }
    const executionResult = {
      assistantContent: 'done',
      assistantMetadata: { executionPath: 'direct' }
    }
    const assistantMessage = {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'done'
    }
    const stream = {
      wasAborted: false,
      dispose: vi.fn(),
      handleCaughtError: vi.fn()
    }

    buildMessageRuntimeContext.mockResolvedValue(runtimeContext)
    persistUserMessage.mockResolvedValue(userMessage)
    createMessageStreamSession.mockReturnValue(stream)
    executeMessage.mockResolvedValue(executionResult)
    finalizeMessageExecution.mockResolvedValue(assistantMessage)

    const event = { sender: { send: vi.fn() } } as unknown as IpcMainInvokeEvent
    const result = await handleMessageSend(event, input)

    expect(buildMessageRuntimeContext).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          ...input,
          traceContext: expect.objectContaining({
            sessionId: 'session-1',
            traceId: expect.stringMatching(/^tr-/),
            startedAt: expect.any(String)
          })
        })
      })
    )
    expect(persistUserMessage).toHaveBeenCalledWith({
      prisma: mockPrisma,
      sessionId: 'session-1',
      content: 'hello',
      metadata: { agentCode: 'luban' }
    })
    expect(createMessageStreamSession).toHaveBeenCalledWith(event, 'session-1')
    expect(executeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: mockPrisma,
        runtimeContext,
        stream
      })
    )
    expect(stream.dispose).toHaveBeenCalledTimes(1)
    expect(finalizeMessageExecution).toHaveBeenCalledWith({
      prisma: mockPrisma,
      logger: expect.any(Object),
      runtimeContext,
      userMessage,
      executionResult,
      streamWasAborted: false
    })
    expect(result).toBe(assistantMessage)
  })

  test('handleMessageAbort cancels matching running tasks and marks session aborted', async () => {
    const { handleMessageAbort } = await import('../../../src/main/ipc/handlers/message')

    abortActiveMessageStream.mockReturnValue(true)
    getRunningTasks.mockReturnValue([
      { id: 'task-1', metadata: { sessionId: 'session-1' } },
      { id: 'task-2', metadata: { sessionId: 'session-2' } },
      { id: 'task-3', metadata: { sessionId: 'session-1' } }
    ])
    mockPrisma.task.updateMany.mockResolvedValue({ count: 2 })

    const result = await handleMessageAbort({} as IpcMainInvokeEvent, { sessionId: 'session-1' })

    expect(abortActiveMessageStream).toHaveBeenCalledWith('session-1')
    expect(markAborted).toHaveBeenCalledWith('session-1')
    expect(cancelTasks).toHaveBeenCalledWith(['task-1', 'task-3'], { signal: 'SIGTERM' })
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        sessionId: 'session-1',
        status: { in: ['pending', 'running'] }
      },
      data: expect.objectContaining({
        status: 'cancelled',
        output: 'Cancelled by user',
        completedAt: expect.any(Date)
      })
    })
    expect(result).toEqual({
      success: true,
      abortedStream: true,
      cancelledBackgroundTaskCount: 2,
      cancelledTaskRows: 2
    })
  })

  test('handleMessageSend annotates todo tasks for resume flows', async () => {
    const { handleMessageSend } = await import('../../../src/main/ipc/handlers/message')

    const input = {
      sessionId: 'session-1',
      content: 'continue now',
      resumeContext: {
        recoverySource: 'manual-resume' as const,
        recoveryStage: 'prompt-ready' as const,
        resumeReason: 'pending-todos' as const,
        resumeAction: 'send-resume-prompt' as const,
        recoveryUpdatedAt: '2026-03-06T00:00:00.000Z'
      }
    }
    const runtimeContext = {
      input,
      resolvedContent: input.content,
      strategy: 'direct',
      workspaceDir: '/tmp/workspace',
      userMessageMetadata: { resumeReason: 'pending-todos' },
      initialAssistantMetadata: { resumeReason: 'pending-todos' }
    }
    const userMessage = { id: 'user-1', sessionId: 'session-1', role: 'user', content: 'continue now' }
    const executionResult = {
      assistantContent: 'done',
      assistantMetadata: { executionPath: 'direct' }
    }
    const assistantMessage = {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'done'
    }
    const stream = {
      wasAborted: false,
      dispose: vi.fn(),
      handleCaughtError: vi.fn()
    }

    buildMessageRuntimeContext.mockResolvedValue(runtimeContext)
    persistUserMessage.mockResolvedValue(userMessage)
    createMessageStreamSession.mockReturnValue(stream)
    executeMessage.mockResolvedValue(executionResult)
    finalizeMessageExecution.mockResolvedValue(assistantMessage)
    annotateSessionTasks.mockResolvedValue(['todo-1'])

    const event = { sender: { send: vi.fn() } } as unknown as IpcMainInvokeEvent
    const result = await handleMessageSend(event, input)

    expect(markRecovering).toHaveBeenCalledWith('session-1')
    expect(annotateSessionTasks).toHaveBeenCalledWith(
      'session-1',
      input.resumeContext,
      'todo-tasks'
    )
    expect(markRecoveryComplete).toHaveBeenCalledWith('session-1')
    expect(result).toBe(assistantMessage)
  })

  test('handleMessageList initializes db and loads ordered messages', async () => {
    const { handleMessageList } = await import('../../../src/main/ipc/handlers/message')

    const messages = [
      { id: 'message-1', sessionId: 'session-1', role: 'user', content: 'first' },
      { id: 'message-2', sessionId: 'session-1', role: 'assistant', content: 'second' }
    ]
    mockPrisma.message.findMany.mockResolvedValue(messages)

    const result = await handleMessageList({} as IpcMainInvokeEvent, 'session-1')

    expect(mockDb.init).toHaveBeenCalledTimes(1)
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      orderBy: { createdAt: 'asc' }
    })
    expect(result).toBe(messages)
  })
})

test('handleMessageSend injects trace context at IPC entry', async () => {
  const { handleMessageSend } = await import('../../../src/main/ipc/handlers/message')

  const input = { sessionId: 'session-1', content: 'trace this request' }
  const runtimeContext = {
    input,
    traceContext: {
      traceId: 'tr-prebuilt',
      startedAt: '2026-03-06T00:00:00.000Z'
    },
    resolvedContent: input.content,
    strategy: 'direct',
    workspaceDir: '/tmp/workspace',
    userMessageMetadata: { traceId: 'tr-prebuilt' },
    initialAssistantMetadata: { traceId: 'tr-prebuilt' }
  }
  const userMessage = { id: 'user-1', sessionId: 'session-1', role: 'user', content: input.content }
  const executionResult = {
    assistantContent: 'done',
    assistantMetadata: { executionPath: 'direct', traceId: 'tr-prebuilt' }
  }
  const assistantMessage = {
    id: 'assistant-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'done'
  }
  const stream = {
    wasAborted: false,
    dispose: vi.fn(),
    handleCaughtError: vi.fn()
  }

  buildMessageRuntimeContext.mockResolvedValue(runtimeContext)
  persistUserMessage.mockResolvedValue(userMessage)
  createMessageStreamSession.mockReturnValue(stream)
  executeMessage.mockResolvedValue(executionResult)
  finalizeMessageExecution.mockResolvedValue(assistantMessage)

  const event = { sender: { send: vi.fn() } } as unknown as IpcMainInvokeEvent
  await handleMessageSend(event, input)

  const tracedInput = buildMessageRuntimeContext.mock.calls[0]?.[0]?.input
  expect(tracedInput.sessionId).toBe('session-1')
  expect(tracedInput.traceContext).toEqual(
    expect.objectContaining({
      sessionId: 'session-1',
      traceId: expect.stringMatching(/^tr-/),
      startedAt: expect.any(String)
    })
  )
})

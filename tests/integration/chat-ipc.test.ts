import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { DatabaseService } from '../../src/main/services/database'
import type { PrismaClient } from '@prisma/client'
import fs from 'fs'
import { EVENT_CHANNELS } from '../../src/shared/ipc-channels'
import { loadBuiltinSkills } from '../../src/main/services/skills/loader'
import { skillRegistry } from '../../src/main/services/skills/registry'
import { hookManager } from '../../src/main/services/hooks'

// Set E2E test mode BEFORE imports that read it
process.env.CODEALL_E2E_TEST = '1'

// Mock Electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn(name => {
        if (name === 'userData') return '/tmp/codeall-test-userdata'
        return '/tmp'
      })
    },
    safeStorage: {
      // Keep encryption disabled in tests; SecureStorageService will treat values as plaintext.
      isEncryptionAvailable: vi.fn(() => false),
      encryptString: vi.fn((text: string) => Buffer.from(text, 'utf-8')),
      decryptString: vi.fn((buf: Buffer) => buf.toString('utf-8'))
    }
  }
})

// Mock child_process for PostgresManager
vi.mock('child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('child_process')>()
  const spawnMock = vi.fn(() => ({
    stdout: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => {
            cb(Buffer.from('server started'))
            cb(Buffer.from('database cluster initialized'))
          }, 10)
        }
      })
    },
    stderr: {
      on: vi.fn()
    },
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') {
        setTimeout(() => cb(0), 20)
      }
    })
  }))
  return {
    ...actual,
    spawn: spawnMock,
    default: {
      ...actual,
      spawn: spawnMock
    }
  }
})

// Mock fs for PostgresManager
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (p.indexOf('bin') !== -1 || p.indexOf('native') !== -1) return true
      if (p.indexOf('PG_VERSION') !== -1) return false
      return actual.existsSync(p)
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn((p: string, encoding: any) => {
      if (p.indexOf('db-credentials.json') !== -1) {
        return JSON.stringify({
          user: 'test-user',
          password: 'test-password',
          port: 54321
        })
      }
      return actual.readFileSync(p, encoding)
    })
  }
})

// In-memory mock store for Prisma
const mockStore: any = {
  space: [],
  model: [],
  systemSetting: [],
  agentBinding: [],
  categoryBinding: [],
  session: [],
  message: [],
  task: [],
  artifact: []
}

// Simple UUID generator
let uuidCounter = 0
const uuid = () => `uuid-${++uuidCounter}`

const createDelegate = (modelName: string) => ({
  create: vi.fn(async ({ data }: any) => {
    const entry = { id: uuid(), ...data, createdAt: new Date(), updatedAt: new Date() }
    mockStore[modelName].push(entry)
    return entry
  }),
  findUnique: vi.fn(async ({ where, include }: any) => {
    if (!where) return null

    // Support the common Prisma `findUnique({ where: { id } })` pattern in app code.
    const key = Object.keys(where)[0]
    const value = where[key]
    const item = mockStore[modelName].find((it: any) => it[key] === value) || null
    if (!item) return null

    // Very small subset of `include` support used by handleMessageSend:
    // session.findUnique({ include: { space: true } })
    if (include && modelName === 'session' && include.space) {
      const space = mockStore.space.find((s: any) => s.id === item.spaceId) || null
      return { ...item, space }
    }

    // agentBinding/categoryBinding include model relation in model selection service
    if (include && (modelName === 'agentBinding' || modelName === 'categoryBinding') && include.model) {
      const model = item.modelId ? mockStore.model.find((m: any) => m.id === item.modelId) || null : null
      if (model && include.model.include?.apiKeyRef) {
        return {
          ...item,
          model: {
            ...model,
            apiKeyRef: model.apiKeyRef ?? null
          }
        }
      }
      return { ...item, model }
    }

    // model include apiKeyRef relation in model selection service
    if (include && modelName === 'model' && include.apiKeyRef) {
      return {
        ...item,
        apiKeyRef: item.apiKeyRef ?? null
      }
    }

    return item
  }),
  findFirst: vi.fn(async ({ where, orderBy }: any) => {
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) => Object.entries(where).every(([k, v]) => item[k] === v))
    }
    if (orderBy) {
      const key = Object.keys(orderBy)[0]
      const dir = orderBy[key]
      items.sort((a: any, b: any) => {
        if (dir === 'asc') return a[key] > b[key] ? 1 : -1
        return a[key] < b[key] ? 1 : -1
      })
    }
    return items[0] || null
  }),
  findMany: vi.fn(async ({ where, orderBy }: any = {}) => {
    let items = mockStore[modelName]
    if (where) {
      items = items.filter((item: any) =>
        Object.entries(where).every(([k, v]) => {
          if (v && typeof v === 'object' && 'in' in v) {
            return (v as { in: unknown[] }).in.includes(item[k])
          }
          return item[k] === v
        })
      )
    }
    if (orderBy) {
      const key = Object.keys(orderBy)[0]
      const dir = orderBy[key]
      items.sort((a: any, b: any) => {
        if (dir === 'asc') return a[key] > b[key] ? 1 : -1
        return a[key] < b[key] ? 1 : -1
      })
    }
    return items
  }),
  update: vi.fn(async ({ where, data }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index === -1) throw new Error(`${modelName} not found`)
    const updated = { ...mockStore[modelName][index], ...data, updatedAt: new Date() }
    mockStore[modelName][index] = updated
    return updated
  }),
  delete: vi.fn(async ({ where }: any) => {
    const index = mockStore[modelName].findIndex((item: any) => item.id === where.id)
    if (index !== -1) mockStore[modelName].splice(index, 1)
    return { id: where.id }
  }),
  deleteMany: vi.fn(async ({ where }: any = {}) => {
    if (!where) {
      const count = mockStore[modelName].length
      mockStore[modelName] = []
      return { count }
    }
    const initialLen = mockStore[modelName].length
    mockStore[modelName] = mockStore[modelName].filter(
      (item: any) =>
        !Object.entries(where).every(([k, v]: any) => {
          if (v && typeof v === 'object' && 'in' in v) {
            return v.in.includes(item[k])
          }
          return item[k] === v
        })
    )
    return { count: initialLen - mockStore[modelName].length }
  })
})

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      space = createDelegate('space')
      model = createDelegate('model')
      systemSetting = createDelegate('systemSetting')
      agentBinding = createDelegate('agentBinding')
      categoryBinding = createDelegate('categoryBinding')
      session = createDelegate('session')
      message = createDelegate('message')
      task = createDelegate('task')
      artifact = createDelegate('artifact')
      $connect() {
        return Promise.resolve()
      }
      $disconnect() {
        return Promise.resolve()
      }
      $transaction(callback: any) {
        return callback(this)
      }
    },
    Prisma: {
      TransactionClient: class {}
    }
  }
})

let lastLLMConfig: any = null
let lastLLMMessages: any[] | null = null

// Mock LLM factory so tests can assert on resolved model config without real network calls.
vi.mock('@/main/services/llm/factory', () => ({
  createLLMAdapter: vi.fn(() => ({
    sendMessage: vi.fn(),
    streamMessage: async function* (messages: any[], config: any) {
      lastLLMConfig = config
      lastLLMMessages = messages
      const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
      let content = `[Mock Response] Received: "${String(lastUser).slice(0, 50)}"`
      if (String(lastUser).toLowerCase().includes('tool:')) {
        content += '\n\n[Tool Execution Result]\nfile1.ts\nfile2.ts'
      }
      yield { content, done: true }
    }
  }))
}))

// Mock Logger
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock LoggerService
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

// Mock cost-tracker
vi.mock('@/main/services/llm/cost-tracker', () => ({
  costTracker: {
    trackUsage: vi.fn()
  }
}))

// Mock SmartRouter to return 'direct' strategy
vi.mock('@/main/services/router/smart-router', () => ({
  SmartRouter: class {
    analyzeTask() {
      return 'direct'
    }
    route() {
      return Promise.resolve({ strategy: 'direct', output: '' })
    }
  }
}))

const mockBoulderState = {
  getState: vi.fn(),
  isSessionTracked: vi.fn(),
  updateState: vi.fn()
}

vi.mock('@/main/services/boulder-state.service', () => ({
  BoulderStateService: {
    getInstance: vi.fn(() => mockBoulderState)
  }
}))

// Mock tool-execution.service to avoid real file operations
vi.mock('@/main/services/tools/tool-execution.service', () => ({
  toolExecutionService: {
    executeTool: vi.fn().mockResolvedValue({
      success: true,
      result: { output: 'file1.ts\nfile2.ts' }
    }),
    withAllowedTools: vi.fn(async (_tools: any, operation: any) => operation()),
    getToolDefinitions: vi.fn().mockReturnValue([])
  }
}))

// Mock builtin tools registration
vi.mock('@/main/services/tools', () => ({}))

describe('Chat IPC Integration - handleMessageSend', () => {
  let prisma: PrismaClient
  let sessionId: string
  let spaceId: string
  let streamChunks: Array<{ content: string; done: boolean }>
  let mockEvent: IpcMainInvokeEvent

  // Create a fresh mock event for each test
  const createMockEvent = () => {
    streamChunks = []
    return {
      sender: {
        send: vi.fn((channel: string, data: any) => {
          if (channel === 'message:stream-chunk') {
            streamChunks.push(data)
          }
        })
      },
      frameId: 1,
      processId: 1,
      senderFrame: {} as any
    } as unknown as IpcMainInvokeEvent
  }

  beforeAll(async () => {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    prisma = dbService.getClient()
  })

  beforeEach(async () => {
    skillRegistry.clear()
    loadBuiltinSkills({ disabledBuiltins: new Set(['git-master', 'frontend-ui-ux']) })

    // Clear mock stores
    mockStore.space = []
    mockStore.model = []
    mockStore.systemSetting = []
    mockStore.agentBinding = []
    mockStore.session = []
    mockStore.message = []
    mockStore.task = []
    mockStore.artifact = []
    uuidCounter = 0
    lastLLMConfig = null
    lastLLMMessages = null
    mockBoulderState.getState.mockClear()
    mockBoulderState.isSessionTracked.mockClear()
    mockBoulderState.updateState.mockClear()
    mockBoulderState.getState.mockResolvedValue({ session_ids: [] })
    mockBoulderState.isSessionTracked.mockResolvedValue(false)
    mockBoulderState.updateState.mockResolvedValue(undefined)

    // Create a space and session for testing
    const space = await prisma.space.create({
      data: {
        name: 'Chat IPC Test Space',
        workDir: '/tmp/chat-ipc-test'
      }
    })
    spaceId = space.id

    const session = await prisma.session.create({
      data: {
        spaceId: space.id,
        title: 'Chat IPC Test Session',
        status: 'active'
      }
    })
    sessionId = session.id

    // Ensure a default model exists (enforced by handleMessageSend).
    const model = await prisma.model.create({
      data: {
        provider: 'openai',
        modelName: 'test-default-model',
        apiKey: 'test-key',
        baseURL: null,
        config: { apiProtocol: 'chat/completions' }
      }
    })
    await prisma.systemSetting.create({
      data: {
        key: 'defaultModelId',
        value: model.id
      }
    })

    // Create fresh mock event
    mockEvent = createMockEvent()
  })

  afterAll(async () => {
    // Cleanup
    if (prisma) {
      await prisma.message.deleteMany({ where: { sessionId } })
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
      await prisma.space.delete({ where: { id: spaceId } }).catch(() => {})
    }
  })

  test('persists context injection summary metadata for assistant message', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const originalHooks = hookManager.getAll().map(hook => ({ ...hook }))
    hookManager.clear()
    hookManager.registerMany(originalHooks)

    hookManager.register({
      id: 'test-context-injection-summary',
      name: 'Test Context Injection Summary',
      event: 'onMessageCreate',
      priority: 1,
      enabled: true,
      callback: async () => ({
        inject: {
          type: 'custom',
          source: 'test-suite',
          priority: 1,
          content: '## docs/notes.md\nline one\nline two'
        }
      })
    })

    try {
      const result = await handleMessageSend(mockEvent, {
        sessionId,
        content: 'Please summarize injected context metadata',
        agentCode: 'luban'
      })

      const summary = (result.metadata as any)?.contextInjectionSummary
      expect(summary).toBeDefined()
      expect(summary.title).toBe('本次注入上下文摘要')
      expect(summary.totalCount).toBeGreaterThan(0)
      expect(summary.acceptedCount).toBeGreaterThan(0)
      expect(summary.items?.[0]?.source).toBe('test-suite')
    } finally {
      hookManager.clear()
      hookManager.registerMany(originalHooks)
    }
  })

  test('filters sensitive paths from injected context before LLM call by default', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const originalHooks = hookManager.getAll().map(hook => ({ ...hook }))
    hookManager.clear()
    hookManager.registerMany(originalHooks)

    hookManager.register({
      id: 'test-sensitive-context-filtering',
      name: 'Test Sensitive Context Filtering',
      event: 'onMessageCreate',
      priority: 1,
      enabled: true,
      callback: async () => ({
        inject: {
          type: 'custom',
          source: 'test-sensitive',
          priority: 1,
          content:
            '## docs/normal.md\nvisible-normal-line\n\n---\n\n## certs/private.key\nPRIVATE KEY SHOULD BE FILTERED\n\n---\n\n## .env\nAPI_KEY=SHOULD_BE_FILTERED\n\n---\n\n## notes/mixed.md\nline-before\n/tmp/certs/dev.pem\nline-after'
        }
      })
    })

    try {
      await handleMessageSend(mockEvent, {
        sessionId,
        content: 'Please process context with sensitive paths',
        agentCode: 'luban'
      })

      const systemMessages = (lastLLMMessages || []).filter((msg: any) => msg.role === 'system')
      const injectedSystem = systemMessages.find(
        (msg: any) => typeof msg?.content === 'string' && String(msg.content).includes('visible-normal-line')
      )

      expect(injectedSystem).toBeDefined()
      const injectedContent = String(injectedSystem.content)
      expect(injectedContent).toContain('visible-normal-line')
      expect(injectedContent).toContain('line-before')
      expect(injectedContent).toContain('line-after')
      expect(injectedContent).not.toContain('PRIVATE KEY SHOULD BE FILTERED')
      expect(injectedContent).not.toContain('API_KEY=SHOULD_BE_FILTERED')
      expect(injectedContent).not.toContain('/tmp/certs/dev.pem')

      const assistantMessage = [...mockStore.message]
        .reverse()
        .find((msg: any) => msg.role === 'assistant' && msg.sessionId === sessionId)
      const summary = assistantMessage?.metadata?.contextInjectionSummary
      expect(summary).toBeDefined()
      expect(summary.filteredCount).toBeGreaterThan(0)
      expect(summary.items.some((item: any) => item.filteredSensitive === true)).toBe(true)
    } finally {
      hookManager.clear()
      hookManager.registerMany(originalHooks)
    }
  })

  test('send normal message - assistant response contains "Mock Response"', async () => {
    // Dynamic import to get the handler after mocks are set up
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Hello, how are you?',
      agentCode: 'luban'
    })

    // Verify the assistant message was created
    expect(result).toBeDefined()
    expect(result.role).toBe('assistant')
    expect(result.sessionId).toBe(sessionId)
    expect(result.content).toContain('Mock')

    // Verify streaming chunks were sent
    expect(streamChunks.length).toBeGreaterThan(0)

    // The last chunk should have done: true
    const lastChunk = streamChunks[streamChunks.length - 1]
    expect(lastChunk.done).toBe(true)

    // Concatenate all chunk contents
    const fullContent = streamChunks.map(c => c.content).join('')
    expect(fullContent).toContain('Mock')

    // Verify event.sender.send was called with message:stream-chunk
    expect(mockEvent.sender.send).toHaveBeenCalledWith(
      'message:stream-chunk',
      expect.objectContaining({ content: expect.any(String) })
    )
  })

  test('send message containing "tool:" - response includes "Tool Execution Result"', async () => {
    // Dynamic import to get the handler after mocks are set up
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Please run tool: file_list',
      agentCode: 'luban'
    })

    // Verify the assistant message was created
    expect(result).toBeDefined()
    expect(result.role).toBe('assistant')
    expect(result.sessionId).toBe(sessionId)
    expect(result.content).toContain('Tool Execution Result')

    // Verify streaming chunks were sent
    expect(streamChunks.length).toBeGreaterThan(0)

    // Concatenate all chunk contents
    const fullContent = streamChunks.map(c => c.content).join('')
    expect(fullContent).toContain('Tool Execution Result')

    // The last chunk should have done: true
    const lastChunk = streamChunks[streamChunks.length - 1]
    expect(lastChunk.done).toBe(true)

    // Verify event.sender.send was called with message:stream-chunk
    expect(mockEvent.sender.send).toHaveBeenCalledWith(
      'message:stream-chunk',
      expect.objectContaining({ content: expect.any(String) })
    )
  })

  test('blocks when neither system default nor agent-specific model is configured', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    // Remove default model setting and ensure there is no agent binding model.
    mockStore.systemSetting = []
    mockStore.model = []
    mockStore.agentBinding = []

    await expect(
      handleMessageSend(mockEvent, {
        sessionId,
        content: 'Hello',
        agentCode: 'luban'
      })
    ).rejects.toThrow(/未配置可用模型/)
  })

  test('agent-specific model overrides system default model', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const modelA = await prisma.model.create({
      data: {
        provider: 'openai',
        modelName: 'model-A',
        apiKey: 'key-A',
        baseURL: null,
        config: { apiProtocol: 'chat/completions' }
      }
    })
    const modelB = await prisma.model.create({
      data: {
        provider: 'openai',
        modelName: 'model-B',
        apiKey: 'key-B',
        baseURL: null,
        config: { apiProtocol: 'chat/completions' }
      }
    })

    // Set system default to modelA.
    mockStore.systemSetting = []
    await prisma.systemSetting.create({ data: { key: 'defaultModelId', value: modelA.id } })

    // Bind luban to modelB.
    await prisma.agentBinding.create({
      data: {
        agentCode: 'luban',
        agentName: '昊天',
        agentType: 'primary',
        description: null,
        modelId: modelB.id,
        temperature: 0.42,
        tools: [],
        systemPrompt: null,
        enabled: true
      }
    })

    await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Hello from luban',
      agentCode: 'luban'
    })

    expect(lastLLMConfig).toBeTruthy()
    expect(lastLLMConfig.model).toBe('model-B')
    expect(lastLLMConfig.temperature).toBe(0.42)
    expect(lastLLMConfig.agentCode).toBe('luban')
  })

  test('uses system default model when selected agent has no bound model', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const modelA = await prisma.model.create({
      data: {
        provider: 'openai',
        modelName: 'model-A2',
        apiKey: 'key-A2',
        baseURL: null,
        config: { apiProtocol: 'chat/completions' }
      }
    })

    mockStore.systemSetting = []
    await prisma.systemSetting.create({ data: { key: 'defaultModelId', value: modelA.id } })

    await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Hello from other agent',
      agentCode: 'luban'
    })

    expect(lastLLMConfig).toBeTruthy()
    expect(lastLLMConfig.model).toBe('model-A2')
    expect(lastLLMConfig.agentCode).toBe('luban')
  })

  test('falls back to system default when agent binding is enabled but modelId is empty', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const systemDefaultModel = await prisma.model.create({
      data: {
        provider: 'openai-compatible',
        modelName: 'fallback-default-model',
        apiKey: 'fallback-key',
        baseURL: 'https://api.example.com/v1',
        config: { apiProtocol: 'responses' }
      }
    })

    mockStore.systemSetting = []
    await prisma.systemSetting.create({ data: { key: 'defaultModelId', value: systemDefaultModel.id } })

    await prisma.agentBinding.create({
      data: {
        agentCode: 'luban',
        agentName: '鲁班',
        agentType: 'primary',
        description: null,
        modelId: null,
        temperature: 0.55,
        tools: [],
        systemPrompt: null,
        enabled: true
      }
    })

    await handleMessageSend(mockEvent, {
      sessionId,
      content: 'Please use fallback default model',
      agentCode: 'luban'
    })

    expect(lastLLMConfig).toBeTruthy()
    expect(lastLLMConfig.model).toBe('fallback-default-model')
    expect(lastLLMConfig.agentCode).toBe('luban')
    expect(lastLLMConfig.apiProtocol).toBe('responses')
  })

  test('keeps responses protocol for repeated openai-compatible sends', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const responsesModel = await prisma.model.create({
      data: {
        provider: 'openai-compatible',
        modelName: 'responses-stability-model',
        apiKey: 'responses-key',
        baseURL: 'https://api.example.com/v1',
        config: { apiProtocol: 'responses' }
      }
    })

    mockStore.systemSetting = []
    await prisma.systemSetting.create({ data: { key: 'defaultModelId', value: responsesModel.id } })

    for (let i = 0; i < 20; i += 1) {
      await handleMessageSend(mockEvent, {
        sessionId,
        content: `Repeated message #${i + 1}`,
        agentCode: 'luban'
      })

      expect(lastLLMConfig).toBeTruthy()
      expect(lastLLMConfig.model).toBe('responses-stability-model')
      expect(lastLLMConfig.apiProtocol).toBe('responses')
    }

    const streamErrorCalls = ((mockEvent.sender.send as any).mock.calls as unknown[][]).filter(
      call => call[0] === EVENT_CHANNELS.MESSAGE_STREAM_ERROR
    )
    expect(streamErrorCalls).toHaveLength(0)
  })

  test('still uses system default after agent binding reset (delete)', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const defaultModel = await prisma.model.create({
      data: {
        provider: 'openai-compatible',
        modelName: 'post-reset-default-model',
        apiKey: 'post-reset-key',
        baseURL: 'https://api.example.com/v1',
        config: { apiProtocol: 'responses' }
      }
    })

    const dedicatedModel = await prisma.model.create({
      data: {
        provider: 'openai-compatible',
        modelName: 'agent-dedicated-model',
        apiKey: 'dedicated-key',
        baseURL: 'https://api.example.com/v1',
        config: { apiProtocol: 'responses' }
      }
    })

    mockStore.systemSetting = []
    await prisma.systemSetting.create({ data: { key: 'defaultModelId', value: defaultModel.id } })

    await prisma.agentBinding.create({
      data: {
        agentCode: 'luban',
        agentName: '鲁班',
        agentType: 'primary',
        description: null,
        modelId: dedicatedModel.id,
        temperature: 0.42,
        tools: [],
        systemPrompt: null,
        enabled: true
      }
    })

    await handleMessageSend(mockEvent, {
      sessionId,
      content: 'before reset should use dedicated',
      agentCode: 'luban'
    })
    expect(lastLLMConfig.model).toBe('agent-dedicated-model')

    await prisma.agentBinding.deleteMany({ where: { agentCode: 'luban' } })

    await handleMessageSend(mockEvent, {
      sessionId,
      content: 'after reset should use system default',
      agentCode: 'luban'
    })
    expect(lastLLMConfig.model).toBe('post-reset-default-model')
    expect(lastLLMConfig.apiProtocol).toBe('responses')
  })

  test('slash skill /review assembles runtime payload and stores skill metadata', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: '',
      agentCode: 'luban',
      skillCommand: {
        command: '/review',
        input: 'Please review src/main/services/skills/registry.ts',
        rawInput: '/review Please review src/main/services/skills/registry.ts'
      }
    })

    expect(result).toBeDefined()
    expect(result.role).toBe('assistant')

    const userMessage = mockStore.message.find((msg: any) => msg.role === 'user')
    expect(userMessage).toBeDefined()
    expect(String(userMessage.content)).toContain('You are a senior reviewer')
    expect(String(userMessage.content)).toContain('Please review src/main/services/skills/registry.ts')

    const userSkillMeta = (userMessage.metadata as any)?.skill
    expect(userSkillMeta?.id).toBe('review')
    expect(userSkillMeta?.command).toBe('/review')
    expect(userSkillMeta?.input).toBe('Please review src/main/services/skills/registry.ts')

    const assistantSkillMeta = (result.metadata as any)?.skill
    expect(assistantSkillMeta?.id).toBe('review')
    expect(assistantSkillMeta?.allowedTools).toEqual(['read', 'grep', 'glob', 'bash'])
  })

  test('slash skill command returns clear error when skill is missing', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    await expect(
      handleMessageSend(mockEvent, {
        sessionId,
        content: '',
        skillCommand: {
          command: '/non-existent-skill',
          rawInput: '/non-existent-skill run something'
        }
      })
    ).rejects.toThrow(/未找到可执行的技能命令/)
  })

  test('slash skill command returns clear error when skill is disabled', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')

    const skill = skillRegistry.get('review')
    expect(skill).toBeDefined()
    skillRegistry.register(
      {
        ...skill!,
        enabled: false
      },
      'builtin'
    )

    await expect(
      handleMessageSend(mockEvent, {
        sessionId,
        content: '',
        skillCommand: {
          command: '/review',
          rawInput: '/review'
        }
      })
    ).rejects.toThrow(/技能已被禁用: review/)
  })

  test('fuxi handoff should capture .fuxi plan path', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')
    const { SmartRouter } = await import('@/main/services/router/smart-router')

    vi.spyOn(SmartRouter.prototype, 'route').mockResolvedValueOnce({
      taskId: 'mock-task-id',
      output: 'TL;DR\nTODOs\nExecution Strategy\nSuccess Criteria\n计划路径: .fuxi/plans/codeall-repair.md',
      success: true
    } as any)

    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) =>
      String(p).replace(/\\/g, '/').includes('.fuxi/plans/codeall-repair.md')
    )

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: '请你先规划这个任务',
      agentCode: 'fuxi'
    })

    expect(result.content).toContain('建议切换到夸父')
    expect(result.content).toContain('执行计划')
    expect((result.metadata as any)?.agentCode).toBe('fuxi')
    expect((result.metadata as any)?.handoffToAgent).toBe('kuafu')
    expect((result.metadata as any)?.planPath).toContain('.fuxi/plans/codeall-repair.md')
    expect(mockBoulderState.updateState).toHaveBeenCalledTimes(1)
  })

  test('fuxi handoff should keep legacy .sisyphus plan path compatibility', async () => {
    const { handleMessageSend } = await import('../../src/main/ipc/handlers/message')
    const { SmartRouter } = await import('@/main/services/router/smart-router')

    vi.spyOn(SmartRouter.prototype, 'route').mockResolvedValueOnce({
      taskId: 'mock-task-id-legacy',
      output: 'TL;DR\nTODOs\nExecution Strategy\nSuccess Criteria\n计划路径: .sisyphus/plans/legacy-repair.md',
      success: true
    } as any)

    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) =>
      String(p).replace(/\\/g, '/').includes('.sisyphus/plans/legacy-repair.md')
    )

    const result = await handleMessageSend(mockEvent, {
      sessionId,
      content: '请你先规划这个任务',
      agentCode: 'fuxi'
    })

    expect(result.content).toContain('建议切换到夸父')
    expect(result.content).toContain('执行计划')
    expect((result.metadata as any)?.agentCode).toBe('fuxi')
    expect((result.metadata as any)?.handoffToAgent).toBe('kuafu')
    expect((result.metadata as any)?.planPath).toContain('.sisyphus/plans/legacy-repair.md')
    expect(mockBoulderState.updateState).toHaveBeenCalled()
    const lastUpdateCall = mockBoulderState.updateState.mock.calls.at(-1)?.[0]
    expect(String(lastUpdateCall?.active_plan || '')).toContain('.sisyphus/plans/legacy-repair.md')
  })
})

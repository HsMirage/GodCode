declare module '../../types/domain' {
  export * from '../../../types/domain'
}

import type { Space, Session, Message, Model, Task, Artifact } from '../../types/domain'

type ModelConfigPayload = {
  thinkingMode?: boolean
  apiProtocol?: 'chat/completions' | 'responses'
  [key: string]: unknown
}

type SkillCommandItem = {
  label: string
  command: string
  description: string
  argsHint?: string
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

type SettingValueType = 'string' | 'number' | 'boolean' | 'json'

type SettingValueSource = 'stored' | 'default' | 'null'

type SettingSchemaDescriptor = {
  key: string
  type: SettingValueType
  scope: 'global' | 'space'
  defaultValue?: string | number | boolean | JsonValue | null
  nullable?: boolean
  description?: string
  validation?: {
    min?: number
    max?: number
    integer?: boolean
    minLength?: number
    maxLength?: number
    pattern?: string
    enum?: Array<string | number | boolean>
  }
  defaultValueSerialized: string | null
}

type SettingResolvedResult = {
  key: string
  value: string | number | boolean | JsonValue | null
  source: SettingValueSource
  schema: SettingSchemaDescriptor
  scopeSource?: {
    scope: 'global' | 'space'
    source: SettingValueSource
  }
}

type SkillCommandInvocation = {
  command: string
  input?: string
  rawInput?: string
}

interface CodeAllAPI {
  invoke(channel: 'ping'): Promise<string>

  // Space
  invoke(
    channel: 'space:create',
    data: { name: string; workDir: string }
  ): Promise<{ success: boolean; data?: Space; error?: string }>
  invoke(channel: 'space:list'): Promise<{ success: boolean; data?: Space[]; error?: string }>
  invoke(
    channel: 'space:update',
    spaceId: string,
    updates: { name?: string; workDir?: string }
  ): Promise<{ success: boolean; data?: Space | null; error?: string }>
  invoke(channel: 'space:get', spaceId: string): Promise<{ success: boolean; data?: Space | null; error?: string }>
  invoke(channel: 'space:delete', spaceId: string): Promise<{ success: boolean; error?: string }>
  invoke(channel: 'dialog:select-folder'): Promise<{ success: boolean; data?: string | null; error?: string }>
  invoke(
    channel: 'model:create',
    data: {
      provider: string
      modelName: string
      apiKey?: string
      apiKeyId?: string
      baseURL?: string | null
      contextSize?: number
      config?: ModelConfigPayload
    }
  ): Promise<Model>
  invoke(channel: 'model:list'): Promise<Model[]>
  invoke(
    channel: 'model:update',
    data: {
      id: string
      data: {
        provider?: string
        modelName?: string
        apiKey?: string
        apiKeyId?: string | null
        baseURL?: string | null
        contextSize?: number
        config?: ModelConfigPayload
      }
    }
  ): Promise<Model>
  invoke(channel: 'model:delete', id: string): Promise<void>
  invoke(channel: 'session:create', data: { spaceId: string; title?: string }): Promise<Session>
  invoke(channel: 'session:get', id: string): Promise<Session | null>
  invoke(channel: 'session:get-or-create-default', data?: { spaceId?: string }): Promise<Session>
  invoke(channel: 'session:list', spaceId?: string): Promise<Session[]>
  invoke(
    channel: 'message:send',
    data: { sessionId: string; content: string; agentCode?: string; skillCommand?: SkillCommandInvocation }
  ): Promise<Message>
  invoke(channel: 'message:list', sessionId: string): Promise<Message[]>
  invoke(channel: 'skill:command-items', input?: { query?: string }): Promise<SkillCommandItem[]>
  invoke(
    channel: 'message:abort',
    data: { sessionId: string }
  ): Promise<{
    success: boolean
    abortedStream: boolean
    cancelledBackgroundTaskCount: number
    cancelledTaskRows: number
  }>
  invoke(channel: 'task:list', sessionId: string): Promise<Task[]>
  invoke(
    channel: 'background-task:list',
    input?: { sessionId?: string }
  ): Promise<{
    success: boolean
    data?: Array<{
      id: string
      pid: number | null
      command: string
      description?: string
      cwd: string
      status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
      exitCode: number | null
      createdAt: string
      startedAt: string | null
      completedAt: string | null
      metadata: Record<string, unknown> | null
    }>
    error?: string
  }>
  invoke(
    channel: 'background-task:get-output',
    input: { taskId: string; afterIndex?: number }
  ): Promise<{
    success: boolean
    data?: {
      task: {
        id: string
        pid: number | null
        command: string
        description?: string
        cwd: string
        status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
        exitCode: number | null
        createdAt: string
        startedAt: string | null
        completedAt: string | null
        metadata: Record<string, unknown> | null
      }
      chunks: Array<{ stream: 'stdout' | 'stderr'; data: string; timestamp: string }>
      nextIndex: number
      outputMeta: {
        total: number
        stdout: number
        stderr: number
        truncated: boolean
      }
    }
    error?: string
  }>
  invoke(channel: 'background-task:stats'): Promise<{
    success: boolean
    data?: {
      total: number
      running: number
      completed: number
      error: number
      cancelled: number
    }
    error?: string
  }>
  invoke(
    channel: 'background-task:cancel',
    input: { taskId: string }
  ): Promise<{ success: boolean; data?: { taskId: string; cancelled: boolean }; error?: string }>
  invoke(channel: 'artifact:list', sessionId: string): Promise<Artifact[]>
  invoke(
    channel: 'artifact:list',
    data: { sessionId: string; includeContent?: boolean }
  ): Promise<Artifact[]>
  invoke(
    channel: 'artifact:download',
    artifactId: string,
    workDir: string
  ): Promise<{ success: boolean; data?: { filePath: string }; error?: string }>
  invoke(
    channel: 'artifact:delete',
    artifactId: string
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'file:read',
    filePath: string,
    sessionId: string
  ): Promise<{ success: boolean; content?: string; mtimeMs?: number; error?: string }>
  invoke(
    channel: 'file:write',
    data: {
      filePath: string
      sessionId: string
      content: string
      expectedMtimeMs?: number
    }
  ): Promise<{
    success: boolean
    mtimeMs?: number
    changeType?: 'created' | 'modified'
    error?: string
    conflict?: {
      currentContent: string
      currentMtimeMs: number
    }
  }>
  invoke(
    channel: 'keychain:list'
  ): Promise<
    { id: string; label: string | null; baseURL: string; apiKey: string; provider: string }[]
  >
  invoke(channel: 'keychain:list-with-models'): Promise<
    Array<{
      id: string
      provider: string
      label: string | null
      baseURL: string
      apiKeyMasked: string
      models: Array<{ id: string; modelName: string; provider: string }>
    }>
  >
  invoke(channel: 'keychain:get-with-models', apiKeyId: string): Promise<
    | {
        id: string
        provider: string
        label: string | null
        baseURL: string
        apiKey: string
        models: Array<{ id: string; modelName: string; provider: string }>
      }
    | null
  >
  invoke(
    channel: 'keychain:set-password',
    data: { id?: string; label?: string; baseURL: string; apiKey: string; provider?: string }
  ): Promise<void>
  invoke(
    channel: 'keychain:delete-password',
    data: { service: string; account: string; id?: string }
  ): Promise<boolean>

  // Browser Channels
  invoke(
    channel: 'browser:create',
    data: { viewId: string; url?: string }
  ): Promise<{ success: boolean; data?: any; error?: string }>
  invoke(
    channel: 'browser:destroy',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:show',
    data: { viewId: string; bounds: { x: number; y: number; width: number; height: number } }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:hide',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:resize',
    data: { viewId: string; bounds: { x: number; y: number; width: number; height: number } }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:navigate',
    data: { viewId: string; url: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:go-back',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:go-forward',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:reload',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:stop',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'browser:capture',
    data: { viewId: string }
  ): Promise<{ success: boolean; data?: string; error?: string }>
  invoke(channel: 'browser:list-tabs'): Promise<{ success: boolean; data?: any[]; error?: string }>
  invoke(
    channel: 'browser:toggle-devtools',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>

  invoke(
    channel: `${string}:get-rules`,
    ...args: unknown[]
  ): Promise<
    Array<{
      pattern: string
      strategy: 'delegate' | 'workforce' | 'direct'
      category?: string
      subagent?: string
      model?: string
      [key: string]: unknown
    }>
  >

  invoke(channel: 'setting:get', key: string): Promise<string | null>
  invoke(channel: 'setting:get', input: { key: string; spaceId?: string }): Promise<string | null>
  invoke(
    channel: 'setting:get-resolved',
    key: string
  ): Promise<SettingResolvedResult>
  invoke(
    channel: 'setting:get-resolved',
    input: { key: string; spaceId?: string }
  ): Promise<SettingResolvedResult>
  invoke(
    channel: 'setting:set',
    input: { key: string; value: unknown; spaceId?: string }
  ): Promise<{ key: string; value: string | null }>
  invoke(channel: 'setting:get-all'): Promise<Record<string, string | null>>
  invoke(
    channel: 'setting:get-all',
    input: { spaceId?: string }
  ): Promise<Record<string, string | null>>
  invoke(channel: 'setting:schema-list'): Promise<SettingSchemaDescriptor[]>

  // Fallback signature for channels without dedicated overloads.
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(
    channel: 'task:status-changed',
    callback: (data: { taskId: string; status: Task['status'] }) => void
  ): () => void

  // Task Continuation Channels
  invoke(channel: 'task-continuation:get-status', sessionId: string): Promise<unknown>
  invoke(channel: 'task-continuation:abort', sessionId: string): Promise<unknown>
  invoke(
    channel: 'task-continuation:set-todos',
    input: {
      sessionId: string
      todos: Array<{
        id: string
        content: string
        status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
        priority: 'high' | 'medium' | 'low'
      }>
    }
  ): Promise<{ success: boolean }>
  invoke(channel: 'task-continuation:get-config'): Promise<{
    success: boolean
    data?: {
      countdownSeconds: number
      idleDedupWindowMs: number
      abortWindowMs: number
    }
    error?: string
  }>
  invoke(
    channel: 'task-continuation:set-config',
    config: Partial<{
      countdownSeconds: number
      idleDedupWindowMs: number
      abortWindowMs: number
    }>
  ): Promise<{
    success: boolean
    data?: {
      countdownSeconds: number
      idleDedupWindowMs: number
      abortWindowMs: number
    }
    error?: string
  }>

  // Provider Cache Channels
  invoke(channel: 'provider-cache:get-stats'): Promise<unknown>
  invoke(channel: 'provider-cache:is-connected', provider?: string): Promise<unknown>
  invoke(channel: 'provider-cache:get-available-models', provider?: string): Promise<unknown>
  invoke(channel: 'provider-cache:set-status', provider: string, status: 'connected' | 'disconnected'): Promise<unknown>

  // Audit Log Channels
  invoke(channel: 'audit-log:query', filters?: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>
  invoke(channel: 'audit-log:get-by-entity', entityType: string, entityId: string): Promise<unknown>
  invoke(channel: 'audit-log:get-by-session', sessionId: string): Promise<unknown>
  invoke(channel: 'audit-log:get-recent', limit?: number): Promise<unknown>
  invoke(channel: 'audit-log:count', filters?: Record<string, unknown>): Promise<unknown>
  invoke(channel: 'audit-log:get-failed', limit?: number): Promise<unknown>
  invoke(channel: 'audit-log:export', format: 'json' | 'csv', filters?: Record<string, unknown>): Promise<unknown>

  // Session Continuity Channels
  invoke(channel: 'session-state:get', sessionId: string): Promise<unknown>
  invoke(channel: 'session-state:checkpoint', sessionId: string): Promise<{ success: boolean; error?: string }>
  invoke(channel: 'session-recovery:plan', sessionId: string): Promise<unknown>
  invoke(channel: 'session-recovery:execute', sessionId: string): Promise<{ success: boolean; error?: string }>
  invoke(channel: 'session-recovery:list'): Promise<unknown>
  invoke(channel: 'session-recovery:resume-prompt', sessionId: string): Promise<string>

  // Updater
  invoke(channel: 'updater:check-for-updates'): Promise<any>
  invoke(channel: 'updater:download-update'): Promise<void>
  invoke(channel: 'updater:quit-and-install'): Promise<void>
  on(channel: 'updater:checking-for-update', callback: () => void): () => void
  on(channel: 'updater:update-available', callback: (info: any) => void): () => void
  on(channel: 'updater:update-not-available', callback: (info: any) => void): () => void
  on(channel: 'updater:error', callback: (error: string) => void): () => void
  on(channel: 'updater:download-progress', callback: (progress: any) => void): () => void
  on(channel: 'updater:update-downloaded', callback: (info: any) => void): () => void

  // Browser Panel Events
  on(channel: 'browser:panel-show', callback: () => void): () => void
  on(
    channel: 'browser:ai-operation',
    callback: (data: {
      toolName: string
      status: 'running' | 'completed' | 'error'
      viewId: string
      opId: string
      args?: Record<string, any>
      timestamp: number
      errorCode?: string
      durationMs?: number
    }) => void
  ): () => void

  // Task Events
  on(
    channel: 'task:status-changed',
    callback: (data: { taskId: string; status: Task['status'] }) => void
  ): () => void
  on(
    channel: 'hook-audit:appended',
    callback: (data: {
      record: {
        id: string
        timestamp: string | Date
        strategy: {
          hookId: string
          hookName: string
          event: string
          priority: number
          enabled: boolean
        }
        execution: {
          sessionId: string
          workspaceDir: string
          userId?: string
          tool?: string
          callId?: string
          messageId?: string
          messageRole?: 'user' | 'assistant' | 'system'
          currentTokens?: number
          maxTokens?: number
          usagePercentage?: number
          filePath?: string
          errorType?: 'not_found' | 'multiple_matches' | 'same_content' | 'unknown'
        }
        result: {
          success: boolean
          duration: number
          error?: string
          returnValuePreview?: string
        }
      }
    }) => void
  ): () => void
  on(
    channel: 'background-task:started',
    callback: (data: {
      task: {
        id: string
        pid: number | null
        command: string
        description?: string
        cwd: string
        status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
        exitCode: number | null
        createdAt: string
        startedAt: string | null
        completedAt: string | null
        metadata: Record<string, unknown> | null
      }
    }) => void
  ): () => void
  on(
    channel: 'background-task:output',
    callback: (data: {
      taskId: string
      stream: 'stdout' | 'stderr'
      data: string
      timestamp: string
    }) => void
  ): () => void
  on(
    channel: 'background-task:completed',
    callback: (data: {
      task: {
        id: string
        pid: number | null
        command: string
        description?: string
        cwd: string
        status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
        exitCode: number | null
        createdAt: string
        startedAt: string | null
        completedAt: string | null
        metadata: Record<string, unknown> | null
      }
      exitCode: number | null
      signal: string | null
    }) => void
  ): () => void
  on(
    channel: 'background-task:cancelled',
    callback: (data: {
      task: {
        id: string
        pid: number | null
        command: string
        description?: string
        cwd: string
        status: 'pending' | 'running' | 'completed' | 'error' | 'interrupt' | 'cancelled' | 'timeout'
        exitCode: number | null
        createdAt: string
        startedAt: string | null
        completedAt: string | null
        metadata: Record<string, unknown> | null
      }
    }) => void
  ): () => void

  // Artifact Events
  on(channel: 'artifact:created', callback: () => void): () => void

  // Message Stream Events
  on(
    channel: 'message:stream-chunk',
    callback: (data: {
      sessionId: string
      content: string
      done: boolean
      type?: 'content' | 'tool_start' | 'tool_end' | 'error' | 'done'
      toolCall?: {
        id: string
        name: string
        arguments?: Record<string, unknown>
        result?: unknown
      }
      error?: {
        message: string
        code?: string
      }
    }) => void
  ): () => void
  on(
    channel: 'message:stream-error',
    callback: (data: { sessionId: string; message: string; code?: string }) => void
  ): () => void
  on(
    channel: 'message:stream-usage',
    callback: (data: {
      sessionId: string
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }) => void
  ): () => void

  // Agent Run Channels
  invoke(channel: 'agent-run:list', taskId: string): Promise<any[]>
  invoke(channel: 'agent-run:get', runId: string): Promise<any>
  invoke(channel: 'agent-run:get-logs', runId: string): Promise<any[]>

  // Workflow Observability Channels
  invoke(channel: 'workflow-observability:get', workflowTaskId: string): Promise<any>
  invoke(channel: 'hook-governance:get'): Promise<{
    initialized: boolean
    stats: {
      total: number
      enabled: number
      disabled: number
      byEvent: Record<string, number>
      totalExecutions: number
      totalErrors: number
    }
    hooks: Array<{
      id: string
      name: string
      event: string
      enabled: boolean
      priority: number
      executionCount: number
      errorCount: number
    }>
    recentExecutions: Array<{
      id: string
      timestamp: string | Date
      strategy: {
        hookId: string
        hookName: string
        event: string
        priority: number
        enabled: boolean
      }
      execution: {
        sessionId: string
        workspaceDir: string
        userId?: string
        tool?: string
        callId?: string
        messageId?: string
        messageRole?: 'user' | 'assistant' | 'system'
        currentTokens?: number
        maxTokens?: number
        usagePercentage?: number
        filePath?: string
        errorType?: 'not_found' | 'multiple_matches' | 'same_content' | 'unknown'
      }
      result: {
        success: boolean
        duration: number
        status?: 'success' | 'error' | 'timeout' | 'circuit_open'
        degraded?: boolean
        error?: string
        returnValuePreview?: string
        circuitOpenUntil?: string | Date
      }
    }>
  }>
  invoke(
    channel: 'hook-governance:set',
    input: {
      hooks: Array<{
        id: string
        enabled?: boolean
        priority?: number
      }>
    }
  ): Promise<{
    success: boolean
    updated: string[]
    skipped: Array<{ id: string; reason: string }>
    status: {
      initialized: boolean
      stats: {
        total: number
        enabled: number
        disabled: number
        byEvent: Record<string, number>
        totalExecutions: number
        totalErrors: number
      }
      hooks: Array<{
        id: string
        name: string
        event: string
        enabled: boolean
        priority: number
        executionCount: number
        errorCount: number
      }>
      recentExecutions: Array<{
        id: string
        timestamp: string | Date
        strategy: {
          hookId: string
          hookName: string
          event: string
          priority: number
          enabled: boolean
        }
        execution: {
          sessionId: string
          workspaceDir: string
          userId?: string
          tool?: string
          callId?: string
          messageId?: string
          messageRole?: 'user' | 'assistant' | 'system'
          currentTokens?: number
          maxTokens?: number
          usagePercentage?: number
          filePath?: string
          errorType?: 'not_found' | 'multiple_matches' | 'same_content' | 'unknown'
        }
        result: {
          success: boolean
          duration: number
          error?: string
          returnValuePreview?: string
        }
      }>
    }
  }>

  // Enhanced Artifact Channels
  invoke(channel: 'artifact:get-diff', artifactId: string): Promise<string | null>
  invoke(
    channel: 'artifact:accept',
    artifactId: string
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'artifact:revert',
    data: { artifactId: string; workDir: string }
  ): Promise<{ success: boolean; error?: string }>
  invoke(
    channel: 'artifact:stats',
    sessionId: string
  ): Promise<{
    total: number
    created: number
    modified: number
    deleted: number
    accepted: number
    pending: number
  }>

  // Fallback for on method
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

declare global {
  interface Window {
    codeall: CodeAllAPI
  }
}

declare module '../../types/domain' {
  export * from '../../../types/domain'
}

import type { Session, Message, Model, Task, Artifact } from '../../types/domain'

interface RoutingRule {
  pattern: string
  strategy: 'delegate' | 'workforce' | 'direct'
  category?: string
  subagent?: string
  model?: string
}

interface CodeAllAPI {
  invoke(channel: 'ping'): Promise<string>
  invoke(
    channel: 'model:create',
    data: {
      provider: string
      modelName: string
      apiKey?: string
      baseURL?: string | null
      config?: Record<string, unknown>
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
        baseURL?: string | null
        config?: Record<string, unknown>
      }
    }
  ): Promise<Model>
  invoke(channel: 'model:delete', id: string): Promise<void>
  invoke(channel: 'session:create', data: { spaceId: string; title?: string }): Promise<Session>
  invoke(channel: 'session:get', id: string): Promise<Session | null>
  invoke(channel: 'session:get-or-create-default', data?: { spaceId?: string }): Promise<Session>
  invoke(channel: 'session:list', spaceId?: string): Promise<Session[]>
  invoke(channel: 'message:send', data: { sessionId: string; content: string }): Promise<Message>
  invoke(channel: 'message:list', sessionId: string): Promise<Message[]>
  invoke(channel: 'router:get-rules'): Promise<RoutingRule[]>
  invoke(channel: 'router:save-rules', rules: RoutingRule[]): Promise<void>
  invoke(channel: 'task:list', sessionId: string): Promise<Task[]>
  invoke(channel: 'artifact:list', sessionId: string): Promise<Artifact[]>
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
  ): Promise<{ success: boolean; content?: string; error?: string }>
  invoke(
    channel: 'keychain:list'
  ): Promise<
    { id: string; label: string | null; baseURL: string; apiKey: string; provider: string }[]
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
  invoke(
    channel: 'browser:toggle-devtools',
    data: { viewId: string }
  ): Promise<{ success: boolean; error?: string }>

  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(
    channel: 'message:stream-chunk',
    callback: (data: { content: string; done: boolean }) => void
  ): () => void
  on(
    channel: 'task:status-changed',
    callback: (data: { taskId: string; status: Task['status'] }) => void
  ): () => void

  // Continuation Channels
  invoke(channel: 'continuation:get-progress'): Promise<{
    todoCompleted: number
    todoTotal: number
    status: 'idle' | 'running' | 'paused'
    lastResumeTime?: Date
  }>
  invoke(channel: 'continuation:trigger-resume'): Promise<void>
  invoke(channel: 'continuation:get-history'): Promise<
    {
      timestamp: Date
      trigger: 'auto' | 'manual'
      result: 'success' | 'failed'
      tasksCompleted: number
    }[]
  >
  on(
    channel: 'continuation:status-update',
    callback: (data: { status: 'idle' | 'running' | 'paused'; progress: number }) => void
  ): () => void

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
}

declare global {
  interface Window {
    codeall: CodeAllAPI
  }
}

declare module '../../types/domain' {
  export * from '../../../types/domain'
}

import type { Session, Message, Model, Task } from '../../types/domain'

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
    data: { name: string; provider: string; apiKey: string; config?: Record<string, unknown> }
  ): Promise<Model>
  invoke(channel: 'model:list'): Promise<Model[]>
  invoke(
    channel: 'model:update',
    data: { id: string; name?: string; apiKey?: string; config?: Record<string, unknown> }
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
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(
    channel: 'message:stream-chunk',
    callback: (data: { content: string; done: boolean }) => void
  ): () => void
  on(
    channel: 'task:status-changed',
    callback: (data: { taskId: string; status: Task['status'] }) => void
  ): () => void
}

declare global {
  interface Window {
    codeall: CodeAllAPI
  }
}

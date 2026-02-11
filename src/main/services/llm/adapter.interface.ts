import type { Message } from '@/types/domain'

export interface LLMConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  maxOutputTokens?: number
  topP?: number
  stopSequences?: string[]
  /** Workspace directory for tool execution */
  workspaceDir?: string
  /** Session ID for tool execution context */
  sessionId?: string
  /** Selected agent code */
  agentCode?: string
  /** Optional external abort signal for request cancellation */
  abortSignal?: AbortSignal

  /** Provider-specific capability toggles */
  thinkingMode?: boolean

  /**
   * Optional runtime knobs (can be stored in Model.config and passed through).
   * Useful for avoiding per-adapter hardcoding and tuning behavior per provider/model.
   */
  timeoutMs?: number
  maxRetries?: number
  baseDelayMs?: number
  maxToolIterations?: number
  /** Fallback max output tokens for providers that require it (e.g., Anthropic) */
  defaultMaxTokens?: number
}

export interface LLMResponse {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
  }
}

/**
 * Streaming chunk event types
 */
export type StreamEventType = 'content' | 'tool_start' | 'tool_end' | 'error' | 'done'

export interface LLMChunk {
  /** The text content delta */
  content: string
  /** Whether this is the final chunk */
  done: boolean
  /** Event type for more granular handling */
  type?: StreamEventType
  /** Tool call information when type is 'tool_start' or 'tool_end' */
  toolCall?: {
    id: string
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
  }
  /** Error information when type is 'error' */
  error?: {
    message: string
    code?: string
  }
}

/**
 * Stream usage statistics (sent at end of stream)
 */
export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface LLMAdapter {
  sendMessage(messages: Message[], config: LLMConfig): Promise<LLMResponse>
  streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk>
}

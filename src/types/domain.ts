/**
 * Core domain models for CodeAll.
 */

/**
 * Space: workspace that isolates sessions and configuration per project.
 */
export interface Space {
  /** UUID */
  id: string
  /** User-defined name */
  name: string
  /** Working directory path */
  workDir: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Session: a full user interaction lifecycle within a space.
 */
export interface Session {
  /** UUID */
  id: string
  /** Owning space */
  spaceId: string
  /** Auto-generated or user-defined title */
  title: string
  createdAt: Date
  updatedAt: Date
  status: 'active' | 'archived'
}

/**
 * Message: a single user or agent input/output message.
 */
export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  /** Tool calls, thoughts, or other metadata */
  metadata?: Record<string, unknown>
}

/**
 * Task: an executable work unit.
 */
export interface Task {
  id: string
  sessionId: string
  /** Supports sub-tasks */
  parentTaskId?: string
  type: 'user' | 'delegated' | 'workforce' | 'workflow' | 'subtask' | 'agent' | 'TODO_ITEM'
  status: 'pending' | 'running' | 'pending_approval' | 'completed' | 'failed' | 'cancelled'
  /** Task description */
  input: string
  /** Task result */
  output?: string
  /** Assigned LLM model */
  assignedModel?: string
  /** Assigned agent type */
  assignedAgent?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  /** Dependencies, priority, etc. */
  metadata?: Record<string, unknown>
}

/**
 * Artifact: files/code/data produced by agents.
 */
export interface Artifact {
  id: string
  sessionId: string
  /** Related task */
  taskId?: string
  type: 'code' | 'file' | 'image' | 'data'
  /** Path relative to space work directory */
  path: string
  /** Inline content for small files */
  content?: string
  size: number
  /** Change type: created, modified, or deleted */
  changeType: 'created' | 'modified' | 'deleted'
  /** Diff content */
  diff?: string
  /** Whether the artifact has been accepted */
  accepted: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Run: an execution record for a task.
 */
export interface Run {
  id: string
  taskId: string
  status: 'running' | 'completed' | 'failed'
  startedAt: Date
  completedAt?: Date
  logs: RunLog[]
  tokenUsage?: { prompt: number; completion: number; total: number }
  /** Estimated cost */
  cost?: number
}

/**
 * RunLog: execution log entry.
 */
export interface RunLog {
  timestamp: Date
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Agent: agent definition.
 */
export interface Agent {
  id: string
  name: string
  type: 'delegate' | 'workforce' | 'subagent'
  /** Supported tools/capabilities */
  capabilities: string[]
  config: Record<string, unknown>
}

/**
 * Model: LLM model configuration.
 */
export interface Model {
  id: string
  provider: string
  /** claude-3-5-sonnet, gpt-4, etc. */
  modelName: string
  /** Encrypted storage */
  apiKey?: string
  /** Link to ApiKey table */
  apiKeyId?: string
  /** Custom endpoint */
  baseURL?: string
  /**
   * Maximum context window size, unit: K tokens.
   * Example: 32 means ~32K tokens.
   */
  contextSize?: number
  config: {
    temperature?: number
    maxTokens?: number
    timeout?: number
    timeoutMs?: number
    maxRetries?: number
    baseDelayMs?: number
    maxToolIterations?: number
    defaultMaxTokens?: number
    /** Explicit OpenAI-compatible protocol selection. */
    apiProtocol?: 'chat/completions' | 'responses'
    /** Provider-specific / capability toggle (e.g., Claude extended thinking). */
    thinkingMode?: boolean
  }
}

/**
 * GodCode Skill System - Type Definitions
 *
 * Skills extend agent capabilities with predefined prompts, tools, and behaviors.
 */

/**
 * Skill trigger definition - when to activate a skill
 */
export interface SkillTrigger {
  /** Keyword patterns that trigger this skill */
  keywords?: string[]
  /** Regex patterns for matching user input */
  patterns?: RegExp[]
  /** Command prefix (e.g., "/commit", "/review") */
  command?: string
}

/**
 * Skill metadata
 */
export interface SkillMetadata {
  /** Skill author */
  author?: string
  /** Version string */
  version?: string
  /** License type */
  license?: string
  /** Compatibility notes */
  compatibility?: string
  /** Builtin skill pack name */
  pack?: string
  /** Builtin skill pack version */
  packVersion?: string
  /** Metadata schema version */
  schemaVersion?: string
  /** Tags for categorization */
  tags?: string[]
  /** Typical usage scenarios */
  scenarios?: string[]
  /** Operational risk level */
  riskLevel?: 'low' | 'medium' | 'high'
  /** Custom metadata */
  [key: string]: unknown
}

/**
 * MCP (Model Context Protocol) configuration for skills
 */
export interface SkillMcpConfig {
  /** MCP server command */
  command: string
  /** Command arguments */
  args?: string[]
  /** Environment variables */
  env?: Record<string, string>
}

/**
 * Skill definition interface
 */
export interface Skill {
  /** Unique skill identifier */
  id: string
  /** Display name */
  name: string
  /** Description for display and agent selection */
  description: string
  /** The prompt template that defines the skill's behavior */
  template: string
  /** Triggers that activate this skill */
  triggers?: SkillTrigger
  /** Tools allowed when this skill is active */
  allowedTools?: string[]
  /** Preferred agent for this skill */
  agent?: string
  /** Preferred model for this skill */
  model?: string
  /** Whether to run as a subtask */
  subtask?: boolean
  /** Hint for skill arguments */
  argumentHint?: string
  /** MCP configuration if skill uses MCP */
  mcpConfig?: SkillMcpConfig
  /** Skill metadata */
  metadata?: SkillMetadata
  /** Whether this is a builtin skill */
  builtin?: boolean
  /** Whether this skill is enabled */
  enabled?: boolean
}

/**
 * Command palette item derived from a skill
 */
export interface SkillCommandItem {
  /** Display label */
  label: string
  /** Slash command (always starts with /) */
  command: string
  /** Short description for command list */
  description: string
  /** Optional argument hint */
  argsHint?: string
}

/**
 * Structured slash-command invocation payload from UI
 */
export interface SkillCommandInvocation {
  /** Slash command entered by the user */
  command: string
  /** User-provided input content that should be bound into the skill template */
  input?: string
  /** Raw slash command text before payload assembly */
  rawInput?: string
}

/**
 * Assembled runtime payload resolved from skill metadata and invocation
 */
export interface SkillRuntimePayload {
  /** Resolved skill identifier */
  id: string
  /** Resolved skill display name */
  name: string
  /** Slash command used for invocation */
  command: string
  /** Original raw slash command text */
  rawInput: string | null
  /** User-provided input bound into the template */
  input: string | null
  /** Final rendered prompt used at runtime */
  renderedPrompt: string
  /** Original skill template */
  template: string
  /** Runtime tool allowlist from skill definition */
  allowedTools: string[] | null
  /** Preferred runtime agent from skill definition */
  agent: string | null
  /** Preferred runtime model from skill definition */
  model: string | null
  /** Whether the skill prefers subtask execution */
  subtask: boolean | null
  /** MCP configuration declared by the skill */
  mcpConfig: SkillMcpConfig | null
}

/**
 * Skill execution context
 */
export interface SkillContext {
  /** Current session ID */
  sessionId: string
  /** Current workspace directory */
  workspaceDir: string
  /** User input that triggered the skill */
  input: string
  /** Arguments extracted from the input */
  args?: string[]
  /** Parent task ID if running as subtask */
  parentTaskId?: string
}

/**
 * Skill execution result
 */
export interface SkillResult {
  /** Whether execution succeeded */
  success: boolean
  /** Output content */
  output?: string
  /** Error message if failed */
  error?: string
  /** Artifacts produced by the skill */
  artifacts?: string[]
}

/**
 * Skill source type
 */
export type SkillSource = 'builtin' | 'user' | 'workspace' | 'plugin'

/**
 * Skill registration entry
 */
export interface SkillRegistration {
  skill: Skill
  source: SkillSource
  loadedAt: Date
}

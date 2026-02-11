/**
 * @license
 * Copyright (c) 2024-2026 opencode-ai
 *
 * This file is adapted from oh-my-opencode
 * Original source: https://github.com/opencode-ai/oh-my-opencode
 * License: SUL-1.0
 *
 * This code is used under the Sustainable Use License for internal/non-commercial purposes only.
 *
 * Modified by CodeAll project.
 */

// Core delegate engine
export { DelegateEngine } from './delegate-engine'
export type { DelegateTaskInput, DelegateTaskResult } from './delegate-engine'

// Categories and agents
export { categories } from './categories'
export { agents } from './agents'
export type { CategoryConfig } from './categories'
export type { AgentConfig } from './agents'

// Category constants and types
export {
  categorizeTools,
  truncateDescription,
  DEFAULT_AGENT_METADATA
} from './category-constants'
export type {
  ToolCategory,
  AgentCategory,
  AgentCost,
  AgentMode,
  DelegationTrigger,
  AgentPromptMetadata,
  AvailableAgent,
  AvailableTool,
  AvailableSkill,
  AvailableCategory
} from './category-constants'

// Category resolver
export { CategoryResolver, categoryResolver } from './category-resolver'
export type { ResolvedAgent, ResolvedCategory } from './category-resolver'

// Delegation protocol
export {
  buildDelegationProtocol,
  serializeDelegationProtocol,
  validateDelegationProtocol,
  createQuickDelegation,
  parseDelegationProtocol,
  DELEGATION_TEMPLATES
} from './delegation-protocol'
export type {
  DelegationSection,
  DelegationProtocol,
  DelegationProtocolInput,
  DelegationValidationResult
} from './delegation-protocol'

// Dynamic prompt builder
export {
  DynamicPromptBuilder,
  dynamicPromptBuilder,
  buildOrchestratorPrompt,
  simpleTokenCounter
} from './dynamic-prompt-builder'
export type { TokenCounter, PromptBuilderConfig } from './dynamic-prompt-builder'

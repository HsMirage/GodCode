/**
 * Copyright (c) 2026 GodCode Team
 * SPDX-License-Identifier: MIT
 *
 * delegate 模块公共导出
 */

// Core delegate engine
export { DelegateEngine } from './delegate-engine'
export type { DelegateTaskInput, DelegateTaskResult } from './delegate-engine'

// Categories and agents
export { categories } from './categories'
export { agents } from './agents'
export {
  resolveAgentRuntimeToolNames,
  resolveCategoryRuntimeToolNames,
  resolveScopedRuntimeToolNames
} from './tool-allowlist'
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

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

import type { AgentPromptMetadata, AgentCategory, AgentCost } from './category-constants'
import { DEFAULT_AGENT_METADATA } from './category-constants'
import { AGENT_DEFINITIONS, CATEGORY_DEFINITIONS } from '@/shared/agent-definitions'
import type { AgentDefinition, CategoryDefinition } from '@/shared/agent-definitions'

/**
 * Agent 解析结果
 */
export interface ResolvedAgent {
  code: string
  name: string
  chineseName: string
  description: string
  tools: string[]
  metadata: AgentPromptMetadata
}

/**
 * Category 解析结果
 */
export interface ResolvedCategory {
  code: string
  name: string
  chineseName: string
  description: string
  defaultTemperature: number
}

/**
 * 分类解析器
 * 负责解析 Agent 和 Category 的元数据
 */
export class CategoryResolver {
  private agentDefinitions: AgentDefinition[]
  private categoryDefinitions: CategoryDefinition[]
  private metadataOverrides: Record<string, Partial<AgentPromptMetadata>>

  constructor(
    agentDefs: AgentDefinition[] = AGENT_DEFINITIONS,
    categoryDefs: CategoryDefinition[] = CATEGORY_DEFINITIONS,
    metadataOverrides: Record<string, Partial<AgentPromptMetadata>> = {}
  ) {
    this.agentDefinitions = agentDefs
    this.categoryDefinitions = categoryDefs
    this.metadataOverrides = metadataOverrides
  }

  /**
   * 解析单个 Agent 的完整元数据
   */
  resolveAgent(code: string): ResolvedAgent | null {
    const def = this.agentDefinitions.find(a => a.code === code)
    if (!def) return null

    const defaultMeta = DEFAULT_AGENT_METADATA[code] || this.createDefaultMetadata(def)
    const overrides = this.metadataOverrides[code] || {}

    return {
      code: def.code,
      name: def.name,
      chineseName: def.chineseName,
      description: def.description,
      tools: def.tools,
      metadata: {
        ...defaultMeta,
        ...overrides
      }
    }
  }

  /**
   * 解析所有可用的 Agents
   */
  resolveAllAgents(): ResolvedAgent[] {
    return this.agentDefinitions
      .map(def => this.resolveAgent(def.code))
      .filter((agent): agent is ResolvedAgent => agent !== null)
  }

  /**
   * 按类别分组解析 Agents
   */
  resolveAgentsByCategory(): Record<AgentCategory, ResolvedAgent[]> {
    const result: Record<AgentCategory, ResolvedAgent[]> = {
      exploration: [],
      specialist: [],
      advisor: [],
      utility: []
    }

    for (const agent of this.resolveAllAgents()) {
      result[agent.metadata.category].push(agent)
    }

    return result
  }

  /**
   * 按成本分组解析 Agents
   */
  resolveAgentsByCost(): Record<AgentCost, ResolvedAgent[]> {
    const result: Record<AgentCost, ResolvedAgent[]> = {
      FREE: [],
      CHEAP: [],
      EXPENSIVE: []
    }

    for (const agent of this.resolveAllAgents()) {
      result[agent.metadata.cost].push(agent)
    }

    return result
  }

  /**
   * 解析单个 Category
   */
  resolveCategory(code: string): ResolvedCategory | null {
    const def = this.categoryDefinitions.find(c => c.code === code)
    if (!def) return null

    return {
      code: def.code,
      name: def.name,
      chineseName: def.chineseName,
      description: def.description,
      defaultTemperature: def.defaultTemperature
    }
  }

  /**
   * 解析所有可用的 Categories
   */
  resolveAllCategories(): ResolvedCategory[] {
    return this.categoryDefinitions
      .map(def => this.resolveCategory(def.code))
      .filter((cat): cat is ResolvedCategory => cat !== null)
  }

  /**
   * 获取探索型 Agents（用于并行搜索）
   */
  getExplorationAgents(): ResolvedAgent[] {
    return this.resolveAllAgents().filter(agent => agent.metadata.category === 'exploration')
  }

  /**
   * 获取顾问型 Agents（用于咨询）
   */
  getAdvisorAgents(): ResolvedAgent[] {
    return this.resolveAllAgents().filter(agent => agent.metadata.category === 'advisor')
  }

  /**
   * 获取具有关键触发器的 Agents
   */
  getAgentsWithKeyTriggers(): ResolvedAgent[] {
    return this.resolveAllAgents().filter(agent => agent.metadata.keyTrigger)
  }

  /**
   * 获取可委托的 Agents（非 utility 类型）
   */
  getDelegatableAgents(): ResolvedAgent[] {
    return this.resolveAllAgents().filter(agent => agent.metadata.category !== 'utility')
  }

  /**
   * 创建默认元数据
   */
  private createDefaultMetadata(def: AgentDefinition): AgentPromptMetadata {
    const category: AgentCategory =
      def.type === 'primary' ? 'utility' : def.tools.length <= 3 ? 'exploration' : 'specialist'

    const cost: AgentCost = def.type === 'primary' ? 'EXPENSIVE' : 'CHEAP'

    return {
      category,
      cost,
      triggers: [],
      promptAlias: def.chineseName
    }
  }

  /**
   * 更新元数据覆盖
   */
  updateMetadataOverrides(overrides: Record<string, Partial<AgentPromptMetadata>>): void {
    this.metadataOverrides = {
      ...this.metadataOverrides,
      ...overrides
    }
  }
}

/**
 * 默认分类解析器实例
 */
export const categoryResolver = new CategoryResolver()

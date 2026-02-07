/**
 * Agent 绑定服务
 * 管理 Agent 与 LLM 模型的绑定配置
 */

import { DatabaseService } from './database'
import { LoggerService } from './logger'
import { SecureStorageService } from './secure-storage.service'
import { Prisma } from '@prisma/client'
import {
  AGENT_DEFINITIONS,
  CATEGORY_DEFINITIONS,
  type AgentDefinition,
  type CategoryDefinition
} from '@/shared/agent-definitions'

type AgentBindingWithModel = Prisma.AgentBindingGetPayload<{ include: { model: true } }>
type CategoryBindingWithModel = Prisma.CategoryBindingGetPayload<{ include: { model: true } }> & {
  systemPrompt: string | null
}

export interface AgentBindingData {
  id: string
  agentCode: string
  agentName: string
  agentType: string
  description: string | null
  modelId: string | null
  modelName?: string | null
  temperature: number
  tools: string[]
  systemPrompt: string | null
  enabled: boolean
}

export interface CategoryBindingData {
  id: string
  categoryCode: string
  categoryName: string
  description: string | null
  modelId: string | null
  modelName?: string | null
  temperature: number
  systemPrompt: string | null
  enabled: boolean
}

export interface UpdateAgentBindingInput {
  modelId?: string | null
  temperature?: number
  tools?: string[]
  systemPrompt?: string | null
  enabled?: boolean
}

export interface UpdateCategoryBindingInput {
  modelId?: string | null
  temperature?: number
  systemPrompt?: string | null
  enabled?: boolean
}

export class BindingService {
  private static instance: BindingService
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private initialized = false

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  static getInstance(): BindingService {
    if (!BindingService.instance) {
      BindingService.instance = new BindingService()
    }
    return BindingService.instance
  }

  /**
   * 初始化默认绑定配置
   * 首次启动时创建所有 Agent 和 Category 的默认记录
   */
  async initializeDefaults(): Promise<void> {
    if (this.initialized) {
      this.logger.info('BindingService already initialized, skipping')
      return
    }

    this.logger.info('Initializing default agent and category bindings')
    this.logger.info(`Agent definitions count: ${AGENT_DEFINITIONS.length}`)
    this.logger.info(`Category definitions count: ${CATEGORY_DEFINITIONS.length}`)

    // 初始化 Agent 绑定
    for (const agent of AGENT_DEFINITIONS) {
      await this.ensureAgentBinding(agent)
    }

    // 初始化 Category 绑定
    for (const category of CATEGORY_DEFINITIONS) {
      await this.ensureCategoryBinding(category)
    }

    this.initialized = true
    this.logger.info('Default bindings initialized')
  }

  private async ensureAgentBinding(agent: AgentDefinition): Promise<void> {
    this.logger.debug(`Checking agent binding: ${agent.code}`)
    const existing = await this.prisma.agentBinding.findUnique({
      where: { agentCode: agent.code }
    })

    if (!existing) {
      this.logger.info(`Creating default binding for agent: ${agent.code} (${agent.name})`)
      await this.prisma.agentBinding.create({
        data: {
          agentCode: agent.code,
          agentName: agent.name,
          agentType: agent.type,
          description: agent.description,
          temperature: agent.defaultTemperature,
          tools: agent.tools,
          enabled: true
        }
      })
      this.logger.debug(`Created default binding for agent: ${agent.code}`)
    }
  }

  private async ensureCategoryBinding(category: CategoryDefinition): Promise<void> {
    const existing = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode: category.code }
    })

    if (!existing) {
      await this.prisma.categoryBinding.create({
        data: {
          categoryCode: category.code,
          categoryName: category.name,
          description: category.description,
          temperature: category.defaultTemperature,
          enabled: true
        }
      })
      this.logger.debug(`Created default binding for category: ${category.code}`)
    }
  }

  // ========== Agent Binding Operations ==========

  async listAgentBindings(): Promise<AgentBindingData[]> {
    const bindings = await this.prisma.agentBinding.findMany({
      include: { model: { include: { apiKeyRef: true } } },
      orderBy: [{ agentType: 'asc' }, { agentCode: 'asc' }]
    })

    return bindings.map((b: AgentBindingWithModel) => ({
      id: b.id,
      agentCode: b.agentCode,
      agentName: b.agentName,
      agentType: b.agentType,
      description: b.description,
      modelId: b.modelId,
      modelName: b.model?.modelName ?? null,
      temperature: b.temperature,
      tools: b.tools,
      systemPrompt: b.systemPrompt,
      enabled: b.enabled
    }))
  }

  async getAgentBinding(agentCode: string): Promise<AgentBindingData | null> {
    const binding = await this.prisma.agentBinding.findUnique({
      where: { agentCode },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding) return null

    return {
      id: binding.id,
      agentCode: binding.agentCode,
      agentName: binding.agentName,
      agentType: binding.agentType,
      description: binding.description,
      modelId: binding.modelId,
      modelName: binding.model?.modelName ?? null,
      temperature: binding.temperature,
      tools: binding.tools,
      systemPrompt: binding.systemPrompt,
      enabled: binding.enabled
    }
  }

  async updateAgentBinding(
    agentCode: string,
    data: UpdateAgentBindingInput
  ): Promise<AgentBindingData> {
    const updated = await this.prisma.agentBinding.update({
      where: { agentCode },
      data: {
        modelId: data.modelId,
        temperature: data.temperature,
        tools: data.tools,
        systemPrompt: data.systemPrompt,
        enabled: data.enabled
      },
      include: { model: { include: { apiKeyRef: true } } }
    })

    this.logger.info(`Updated agent binding: ${agentCode}`, { data })

    return {
      id: updated.id,
      agentCode: updated.agentCode,
      agentName: updated.agentName,
      agentType: updated.agentType,
      description: updated.description,
      modelId: updated.modelId,
      modelName: updated.model?.modelName ?? null,
      temperature: updated.temperature,
      tools: updated.tools,
      systemPrompt: updated.systemPrompt,
      enabled: updated.enabled
    }
  }

  async resetAgentBinding(agentCode: string): Promise<AgentBindingData> {
    const definition = AGENT_DEFINITIONS.find(a => a.code === agentCode)
    if (!definition) {
      throw new Error(`Unknown agent code: ${agentCode}`)
    }

    const updated = await this.prisma.agentBinding.update({
      where: { agentCode },
      data: {
        modelId: null,
        temperature: definition.defaultTemperature,
        tools: definition.tools,
        systemPrompt: null,
        enabled: true
      },
      include: { model: { include: { apiKeyRef: true } } }
    })

    this.logger.info(`Reset agent binding to defaults: ${agentCode}`)

    return {
      id: updated.id,
      agentCode: updated.agentCode,
      agentName: updated.agentName,
      agentType: updated.agentType,
      description: updated.description,
      modelId: updated.modelId,
      modelName: updated.model?.modelName ?? null,
      temperature: updated.temperature,
      tools: updated.tools,
      systemPrompt: updated.systemPrompt,
      enabled: updated.enabled
    }
  }

  // ========== Category Binding Operations ==========

  async listCategoryBindings(): Promise<CategoryBindingData[]> {
    const bindings = (await this.prisma.categoryBinding.findMany({
      include: { model: { include: { apiKeyRef: true } } },
      orderBy: { categoryCode: 'asc' }
    })) as CategoryBindingWithModel[]

    return bindings.map(b => ({
      id: b.id,
      categoryCode: b.categoryCode,
      categoryName: b.categoryName,
      description: b.description,
      modelId: b.modelId,
      modelName: b.model?.modelName ?? null,
      temperature: b.temperature,
      systemPrompt: b.systemPrompt,
      enabled: b.enabled
    }))
  }

  async getCategoryBinding(categoryCode: string): Promise<CategoryBindingData | null> {
    const binding = (await this.prisma.categoryBinding.findUnique({
      where: { categoryCode },
      include: { model: { include: { apiKeyRef: true } } }
    })) as CategoryBindingWithModel | null

    if (!binding) return null

    return {
      id: binding.id,
      categoryCode: binding.categoryCode,
      categoryName: binding.categoryName,
      description: binding.description,
      modelId: binding.modelId,
      modelName: binding.model?.modelName ?? null,
      temperature: binding.temperature,
      systemPrompt: binding.systemPrompt,
      enabled: binding.enabled
    }
  }

  async updateCategoryBinding(
    categoryCode: string,
    data: UpdateCategoryBindingInput
  ): Promise<CategoryBindingData> {
    const updated = (await this.prisma.categoryBinding.update({
      where: { categoryCode },
      data: {
        modelId: data.modelId,
        temperature: data.temperature,
        systemPrompt: data.systemPrompt,
        enabled: data.enabled
      },
      include: { model: { include: { apiKeyRef: true } } }
    })) as CategoryBindingWithModel

    this.logger.info(`Updated category binding: ${categoryCode}`, { data })

    return {
      id: updated.id,
      categoryCode: updated.categoryCode,
      categoryName: updated.categoryName,
      description: updated.description,
      modelId: updated.modelId,
      modelName: updated.model?.modelName ?? null,
      temperature: updated.temperature,
      systemPrompt: updated.systemPrompt,
      enabled: updated.enabled
    }
  }

  async resetCategoryBinding(categoryCode: string): Promise<CategoryBindingData> {
    const definition = CATEGORY_DEFINITIONS.find(c => c.code === categoryCode)
    if (!definition) {
      throw new Error(`Unknown category code: ${categoryCode}`)
    }

    const updated = (await this.prisma.categoryBinding.update({
      where: { categoryCode },
      data: {
        modelId: null,
        temperature: definition.defaultTemperature,
        systemPrompt: null,
        enabled: true
      },
      include: { model: { include: { apiKeyRef: true } } }
    })) as CategoryBindingWithModel

    this.logger.info(`Reset category binding to defaults: ${categoryCode}`)

    return {
      id: updated.id,
      categoryCode: updated.categoryCode,
      categoryName: updated.categoryName,
      description: updated.description,
      modelId: updated.modelId,
      modelName: updated.model?.modelName ?? null,
      temperature: updated.temperature,
      systemPrompt: updated.systemPrompt,
      enabled: updated.enabled
    }
  }

  // ========== Query Helpers ==========

  /**
   * 获取 Agent 的有效模型配置
   * 优先使用绑定的模型，否则返回默认配置
   */
  async getAgentModelConfig(agentCode: string): Promise<{
    model: string
    temperature: number
    apiKey?: string
    baseURL?: string
  } | null> {
    const binding = await this.prisma.agentBinding.findUnique({
      where: { agentCode },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding || !binding.enabled) return null

    const definition = AGENT_DEFINITIONS.find(a => a.code === agentCode)

    if (binding.model) {
      const decryptedKey = binding.model.apiKeyRef?.encryptedKey
        ? SecureStorageService.getInstance().decrypt(binding.model.apiKeyRef.encryptedKey)
        : binding.model.apiKey

      return {
        model: binding.model.modelName,
        temperature: binding.temperature,
        apiKey: decryptedKey ?? undefined,
        baseURL: binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
      }
    }

    // 使用默认模型
    return {
      model: definition?.defaultModel ?? 'claude-3-5-sonnet-20240620',
      temperature: binding.temperature
    }
  }

  /**
   * 获取 Category 的有效模型配置
   */
  async getCategoryModelConfig(categoryCode: string): Promise<{
    model: string
    temperature: number
    apiKey?: string
    baseURL?: string
  } | null> {
    const binding = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding || !binding.enabled) return null

    const definition = CATEGORY_DEFINITIONS.find(c => c.code === categoryCode)

    if (binding.model) {
      const decryptedKey = binding.model.apiKeyRef?.encryptedKey
        ? SecureStorageService.getInstance().decrypt(binding.model.apiKeyRef.encryptedKey)
        : binding.model.apiKey

      return {
        model: binding.model.modelName,
        temperature: binding.temperature,
        apiKey: decryptedKey ?? undefined,
        baseURL: binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
      }
    }

    // 使用默认模型
    return {
      model: definition?.defaultModel ?? 'claude-3-5-sonnet-20240620',
      temperature: binding.temperature
    }
  }
}

/**
 * Agent 绑定服务
 * 管理 Agent 与 LLM 模型的绑定配置
 */

import { DatabaseService } from './database'
import { LoggerService } from './logger'
import { SecureStorageService } from './secure-storage.service'
import { SchemaVersionService } from './schema-version.service'
import { AuditLogService } from './audit-log.service'
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

interface BindingAuditLogContext {
  sessionId?: string
  userId?: string
}

export class BindingService {
  private static instance: BindingService
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private auditLogService = AuditLogService.getInstance()
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

    // One-time hard migration for renamed agent codes. After this, the app only uses the new codes.
    await this.migrateAgentCodeGuiguziToChongmingOnce()

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

  private async migrateAgentCodeGuiguziToChongmingOnce(): Promise<void> {
    const version = '20260208_agentcode_guiguzi_to_chongming'
    const schemaVersion = SchemaVersionService.getInstance()

    if (await schemaVersion.hasVersion(version)) {
      return
    }

    const definition = AGENT_DEFINITIONS.find(a => a.code === 'chongming')
    if (!definition) {
      // If the static definition ever changes, we still prefer to no-op rather than guess.
      this.logger.warn('[BindingService] Missing agent definition for chongming; skipping migration')
      await schemaVersion.setVersion(version, 'Skipped: missing chongming definition')
      return
    }

    const legacyCode = 'guiguzi'
    const newCode = 'chongming'

    const [legacy, current] = await Promise.all([
      this.prisma.agentBinding.findUnique({ where: { agentCode: legacyCode } }),
      this.prisma.agentBinding.findUnique({ where: { agentCode: newCode } })
    ])

    if (!legacy) {
      await schemaVersion.setVersion(version, 'No legacy binding found')
      return
    }

    this.logger.info(`[BindingService] Hard-migrating agent code: ${legacyCode} -> ${newCode}`)

    // Update other references first (best effort; they are not unique).
    await Promise.all([
      this.prisma.run.updateMany({ where: { agentCode: legacyCode }, data: { agentCode: newCode } }),
      this.prisma.task.updateMany({ where: { assignedAgent: legacyCode }, data: { assignedAgent: newCode } })
    ])

    if (!current) {
      // Safe to rename in place.
      await this.prisma.agentBinding.update({
        where: { agentCode: legacyCode },
        data: {
          agentCode: newCode,
          agentName: definition.name,
          agentType: definition.type,
          description: definition.description
        }
      })

      await schemaVersion.setVersion(version, 'Renamed legacy AgentBinding row')
      return
    }

    // Both exist. Merge legacy into current if current looks like default.
    const merged = {
      modelId: current.modelId ?? legacy.modelId,
      temperature:
        current.temperature === definition.defaultTemperature && legacy.temperature !== definition.defaultTemperature
          ? legacy.temperature
          : current.temperature,
      tools:
        JSON.stringify(current.tools) === JSON.stringify(definition.tools) &&
        JSON.stringify(legacy.tools) !== JSON.stringify(definition.tools)
          ? legacy.tools
          : current.tools,
      systemPrompt: current.systemPrompt ?? legacy.systemPrompt,
      enabled: current.enabled === true && legacy.enabled === false ? legacy.enabled : current.enabled
    }

    await this.prisma.agentBinding.update({
      where: { agentCode: newCode },
      data: {
        agentName: definition.name,
        agentType: definition.type,
        description: definition.description,
        modelId: merged.modelId,
        temperature: merged.temperature,
        tools: merged.tools,
        systemPrompt: merged.systemPrompt,
        enabled: merged.enabled
      }
    })

    await this.prisma.agentBinding.delete({ where: { agentCode: legacyCode } })
    await schemaVersion.setVersion(version, 'Merged legacy into current and deleted legacy row')
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
    data: UpdateAgentBindingInput,
    context: BindingAuditLogContext = {}
  ): Promise<AgentBindingData> {
    const previous = await this.prisma.agentBinding.findUnique({
      where: { agentCode },
      include: { model: true }
    })

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

    await this.auditLogService.log({
      action: 'binding.agent.update',
      entityType: 'agentBinding',
      entityId: updated.id,
      sessionId: context.sessionId,
      userId: context.userId,
      metadata: {
        agentCode,
        previous: previous
          ? {
              modelId: previous.modelId,
              temperature: previous.temperature,
              tools: previous.tools,
              systemPrompt: previous.systemPrompt,
              enabled: previous.enabled
            }
          : null,
        next: {
          modelId: updated.modelId,
          temperature: updated.temperature,
          tools: updated.tools,
          systemPrompt: updated.systemPrompt,
          enabled: updated.enabled
        }
      },
      success: true
    })

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

  async resetAgentBinding(
    agentCode: string,
    context: BindingAuditLogContext = {}
  ): Promise<AgentBindingData> {
    const definition = AGENT_DEFINITIONS.find(a => a.code === agentCode)
    if (!definition) {
      throw new Error(`Unknown agent code: ${agentCode}`)
    }

    const previous = await this.prisma.agentBinding.findUnique({
      where: { agentCode },
      include: { model: true }
    })

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

    await this.auditLogService.log({
      action: 'binding.agent.reset',
      entityType: 'agentBinding',
      entityId: updated.id,
      sessionId: context.sessionId,
      userId: context.userId,
      metadata: {
        agentCode,
        previous: previous
          ? {
              modelId: previous.modelId,
              temperature: previous.temperature,
              tools: previous.tools,
              systemPrompt: previous.systemPrompt,
              enabled: previous.enabled
            }
          : null,
        next: {
          modelId: updated.modelId,
          temperature: updated.temperature,
          tools: updated.tools,
          systemPrompt: updated.systemPrompt,
          enabled: updated.enabled
        }
      },
      success: true
    })

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
    data: UpdateCategoryBindingInput,
    context: BindingAuditLogContext = {}
  ): Promise<CategoryBindingData> {
    const previous = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode },
      include: { model: true }
    })

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

    await this.auditLogService.log({
      action: 'binding.category.update',
      entityType: 'categoryBinding',
      entityId: updated.id,
      sessionId: context.sessionId,
      userId: context.userId,
      metadata: {
        categoryCode,
        previous: previous
          ? {
              modelId: previous.modelId,
              temperature: previous.temperature,
              systemPrompt: previous.systemPrompt,
              enabled: previous.enabled
            }
          : null,
        next: {
          modelId: updated.modelId,
          temperature: updated.temperature,
          systemPrompt: updated.systemPrompt,
          enabled: updated.enabled
        }
      },
      success: true
    })

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

  async resetCategoryBinding(
    categoryCode: string,
    context: BindingAuditLogContext = {}
  ): Promise<CategoryBindingData> {
    const definition = CATEGORY_DEFINITIONS.find(c => c.code === categoryCode)
    if (!definition) {
      throw new Error(`Unknown category code: ${categoryCode}`)
    }

    const previous = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode },
      include: { model: true }
    })

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

    await this.auditLogService.log({
      action: 'binding.category.reset',
      entityType: 'categoryBinding',
      entityId: updated.id,
      sessionId: context.sessionId,
      userId: context.userId,
      metadata: {
        categoryCode,
        previous: previous
          ? {
              modelId: previous.modelId,
              temperature: previous.temperature,
              systemPrompt: previous.systemPrompt,
              enabled: previous.enabled
            }
          : null,
        next: {
          modelId: updated.modelId,
          temperature: updated.temperature,
          systemPrompt: updated.systemPrompt,
          enabled: updated.enabled
        }
      },
      success: true
    })

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

  private async getSystemDefaultModelConfig(): Promise<{
    model: string
    provider: string
    apiKey?: string
    baseURL?: string
  } | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'defaultModelId' }
    })

    const modelId = setting?.value?.trim()
    if (!modelId) return null

    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      include: { apiKeyRef: true }
    })

    if (!model) return null

    const secureStorage = SecureStorageService.getInstance()
    const decryptedKey = model.apiKeyRef?.encryptedKey
      ? secureStorage.decrypt(model.apiKeyRef.encryptedKey)
      : model.apiKey
        ? secureStorage.decrypt(model.apiKey)
        : null

    const apiKey = decryptedKey?.trim() || ''
    if (!apiKey) return null

    return {
      model: model.modelName,
      provider: model.provider,
      apiKey,
      baseURL: model.apiKeyRef?.baseURL ?? model.baseURL ?? undefined
    }
  }

  /**
   * 获取 Agent 的有效模型配置
   * 优先使用绑定的模型，否则返回默认配置
   */
  async getAgentModelConfig(agentCode: string): Promise<{
    model: string
    provider: string
    temperature: number
    apiKey?: string
    baseURL?: string
  } | null> {
    const binding = await this.prisma.agentBinding.findUnique({
      where: { agentCode },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding || !binding.enabled) return null

    if (binding.modelId && !binding.model) {
      throw new Error(
        `Agent「${agentCode}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定”重新选择模型。`
      )
    }

    if (binding.model) {
      const secureStorage = SecureStorageService.getInstance()
      const decryptedKey = binding.model.apiKeyRef?.encryptedKey
        ? secureStorage.decrypt(binding.model.apiKeyRef.encryptedKey)
        : binding.model.apiKey
          ? secureStorage.decrypt(binding.model.apiKey)
          : null

      const apiKey = decryptedKey?.trim() || ''
      if (!apiKey) {
        throw new Error(
          `Agent「${agentCode}」已绑定模型「${binding.model.modelName}」但缺少 API Key。` +
            `请到“设置 -> API Keys/模型”补全凭据，或到“设置 -> Agent 绑定”切换模型。`
        )
      }

      return {
        model: binding.model.modelName,
        provider: binding.model.provider,
        temperature: binding.temperature,
        apiKey,
        baseURL: binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
      }
    }

    // Only if the agent has no explicit model binding, fall back to system default.
    const systemDefault = await this.getSystemDefaultModelConfig()
    if (!systemDefault) return null
    return {
      model: systemDefault.model,
      provider: systemDefault.provider,
      temperature: binding.temperature,
      apiKey: systemDefault.apiKey,
      baseURL: systemDefault.baseURL
    }
  }

  /**
   * 获取 Category 的有效模型配置
   */
  async getCategoryModelConfig(categoryCode: string): Promise<{
    model: string
    provider: string
    temperature: number
    apiKey?: string
    baseURL?: string
  } | null> {
    const binding = await this.prisma.categoryBinding.findUnique({
      where: { categoryCode },
      include: { model: { include: { apiKeyRef: true } } }
    })

    if (!binding || !binding.enabled) return null

    if (binding.modelId && !binding.model) {
      throw new Error(
        `任务类别「${categoryCode}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定 -> 任务类别”重新选择模型。`
      )
    }

    if (binding.model) {
      const secureStorage = SecureStorageService.getInstance()
      const decryptedKey = binding.model.apiKeyRef?.encryptedKey
        ? secureStorage.decrypt(binding.model.apiKeyRef.encryptedKey)
        : binding.model.apiKey
          ? secureStorage.decrypt(binding.model.apiKey)
          : null

      const apiKey = decryptedKey?.trim() || ''
      if (!apiKey) {
        throw new Error(
          `任务类别「${categoryCode}」已绑定模型「${binding.model.modelName}」但缺少 API Key。` +
            `请到“设置 -> API Keys/模型”补全凭据，或到“设置 -> Agent 绑定 -> 任务类别”切换模型。`
        )
      }

      return {
        model: binding.model.modelName,
        provider: binding.model.provider,
        temperature: binding.temperature,
        apiKey,
        baseURL: binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
      }
    }

    // Only if the category has no explicit model binding, fall back to system default.
    const systemDefault = await this.getSystemDefaultModelConfig()
    if (!systemDefault) return null
    return {
      model: systemDefault.model,
      provider: systemDefault.provider,
      temperature: binding.temperature,
      apiKey: systemDefault.apiKey,
      baseURL: systemDefault.baseURL
    }
  }
}

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

import { DatabaseService } from '@/main/services/database'
import { LoggerService } from '@/main/services/logger'
import { createLLMAdapter } from '@/main/services/llm/factory'
import { truncateToTokenLimit } from '@/main/services/llm/dynamic-truncator'
import type { Message } from '@/types/domain'
import { categories } from './categories'
import { agents } from './agents'

export interface DelegateTaskInput {
  description: string
  prompt: string
  category?: string
  subagent_type?: string
  parentTaskId?: string
  model?: string
}

export interface DelegateTaskResult {
  taskId: string
  output: string
  success: boolean
}

export class DelegateEngine {
  private prisma = DatabaseService.getInstance().getClient()
  private logger = LoggerService.getInstance().getLogger()

  async delegateTask(input: DelegateTaskInput): Promise<DelegateTaskResult> {
    const {
      description,
      prompt,
      category,
      subagent_type,
      parentTaskId,
      model: overrideModel
    } = input

    let modelConfig: { model: string; temperature: number; provider: string }

    if (overrideModel) {
      modelConfig = {
        model: overrideModel,
        temperature: 0.5,
        provider: this.getProviderFromModel(overrideModel)
      }
    } else if (category) {
      const config = categories[category]
      if (!config) {
        throw new Error(`Unknown category: ${category}`)
      }
      modelConfig = {
        ...config,
        provider: this.getProviderFromModel(config.model)
      }
    } else if (subagent_type) {
      const config = agents[subagent_type]
      if (!config) {
        throw new Error(`Unknown agent type: ${subagent_type}`)
      }
      modelConfig = {
        model: config.model,
        temperature: 0.5,
        provider: this.getProviderFromModel(config.model)
      }
    } else {
      throw new Error('Must provide either category or subagent_type')
    }

    const session = await this.getOrCreateDefaultSession()

    const task = await this.prisma.task.create({
      data: {
        sessionId: session.id,
        type: 'subtask',
        input: description,
        status: 'running',
        metadata: {
          category,
          subagent_type,
          parentTaskId,
          model: modelConfig.model
        }
      }
    })

    this.logger.info('Delegating task', {
      taskId: task.id,
      category,
      subagent_type,
      model: modelConfig.model
    })

    try {
      const model = await this.getModelByProvider(modelConfig.provider)
      if (!model) {
        throw new Error(`No model configured for provider: ${modelConfig.provider}`)
      }

      const adapter = createLLMAdapter(modelConfig.provider, {
        apiKey: model.apiKey || '',
        baseURL: model.baseURL ?? undefined
      })

      const messages: Message[] = [
        {
          id: 'system',
          sessionId: session.id,
          role: 'system',
          content: 'You are a helpful AI assistant.',
          createdAt: new Date(),
          metadata: {}
        },
        {
          id: 'user',
          sessionId: session.id,
          role: 'user',
          content: prompt,
          createdAt: new Date(),
          metadata: {}
        }
      ]

      const response = await adapter.sendMessage(messages, {
        model: modelConfig.model,
        temperature: modelConfig.temperature
      })

      const truncatedOutput = truncateToTokenLimit(response.content, 50000).result

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'completed',
          output: truncatedOutput,
          completedAt: new Date()
        }
      })

      this.logger.info('Task completed', { taskId: task.id })

      return {
        taskId: task.id,
        output: truncatedOutput,
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'failed',
          output: `Error: ${errorMessage}`,
          completedAt: new Date()
        }
      })

      this.logger.error('Task failed', { taskId: task.id, error: errorMessage })

      return {
        taskId: task.id,
        output: errorMessage,
        success: false
      }
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'cancelled',
        completedAt: new Date()
      }
    })

    this.logger.info('Task cancelled', { taskId })
  }

  private getProviderFromModel(_model: string): string {
    return 'openai-compatible'
  }

  private async getModelByProvider(provider: string) {
    return await this.prisma.model.findFirst({
      where: { provider },
      orderBy: { createdAt: 'desc' }
    })
  }

  private async getOrCreateDefaultSession() {
    const existingSession = await this.prisma.session.findFirst({
      orderBy: { createdAt: 'asc' }
    })

    if (existingSession) {
      return existingSession
    }

    const defaultSpace = await this.getOrCreateDefaultSpace()

    return await this.prisma.session.create({
      data: {
        spaceId: defaultSpace.id,
        title: 'Default Session'
      }
    })
  }

  private async getOrCreateDefaultSpace() {
    const existingSpace = await this.prisma.space.findFirst({
      orderBy: { createdAt: 'asc' }
    })

    if (existingSpace) {
      return existingSpace
    }

    return await this.prisma.space.create({
      data: {
        name: 'Default Space',
        workDir: process.cwd()
      }
    })
  }
}

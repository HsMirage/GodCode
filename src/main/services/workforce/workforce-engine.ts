/**
 * @license
 * Copyright (c) 2024-2026 stackframe-projects
 *
 * This file is adapted from eigent
 * Original source: https://github.com/stackframe-projects/eigent
 * License: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Modified by CodeAll project.
 */

import { DelegateEngine } from '../delegate'
import { DatabaseService } from '../database'
import { Prisma } from '@prisma/client'
import { LoggerService } from '../logger'
import { createLLMAdapter } from '../llm/factory'
import { DEFAULT_FALLBACK_CHAINS } from '../llm/model-resolver'
import type { Message } from '@/types/domain'
import { workflowEvents } from './events'
import { getTaskRetryService, type RetryConfig, type RetryState } from './retry'
import { SecureStorageService } from '../secure-storage.service'

export interface SubTask {
  id: string
  description: string
  dependencies: string[]
}

export interface WorkflowResult {
  workflowId: string
  tasks: SubTask[]
  results: Map<string, string>
  success: boolean
  /** Retry states for tasks that were retried */
  retryStates?: Map<string, RetryState>
}

export interface WorkflowOptions {
  /** Task category for routing */
  category?: string
  /** Selected dialog agent code for model/prompt inheritance */
  agentCode?: string
  /** Retry configuration override */
  retryConfig?: Partial<RetryConfig>
  /** Whether to enable retries (default: true) */
  enableRetry?: boolean
}

const MAX_CONCURRENT = 3

export class WorkforceEngine {
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()
  private delegateEngine = new DelegateEngine()

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  async decomposeTask(
    input: string,
    opts: { agentCode?: string; category?: string } = {}
  ): Promise<SubTask[]> {
    this.logger.info('Decomposing task', { input })

    let selectedProvider: string | undefined
    let selectedModel: string | undefined
    let apiKey: string | undefined
    let baseURL: string | undefined
    let temperature = 0.3

    // 1) Prefer the selected dialog agent's bound model (no global default needed).
    if (opts.agentCode) {
      const binding = await this.prisma.agentBinding.findUnique({
        where: { agentCode: opts.agentCode },
        include: { model: { include: { apiKeyRef: true } } }
      })

      if (binding?.enabled && binding.modelId && !binding.model) {
        throw new Error(
          `Agent「${opts.agentCode}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定”重新选择模型。`
        )
      }

      if (binding?.enabled && binding.model) {
        const decryptedKey = binding.model.apiKeyRef?.encryptedKey
          ? SecureStorageService.getInstance().decrypt(binding.model.apiKeyRef.encryptedKey)
          : binding.model.apiKey
            ? SecureStorageService.getInstance().decrypt(binding.model.apiKey)
            : null

        const key = decryptedKey?.trim() || ''
        if (!key) {
          throw new Error(
            `Agent「${opts.agentCode}」已绑定模型「${binding.model.modelName}」但缺少 API Key。` +
              `请到“设置 -> API Keys/模型”补全凭据，或到“设置 -> Agent 绑定”切换模型。`
          )
        }

        selectedProvider = binding.model.provider
        selectedModel = binding.model.modelName
        apiKey = key
        baseURL = binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
        temperature = binding.temperature ?? temperature
      }
    }

    // 2) Otherwise, try category-bound model if provided (e.g. routing categories).
    if (!selectedProvider && opts.category) {
      const binding = await this.prisma.categoryBinding.findUnique({
        where: { categoryCode: opts.category },
        include: { model: { include: { apiKeyRef: true } } }
      })

      if (binding?.enabled && binding.modelId && !binding.model) {
        throw new Error(
          `任务类别「${opts.category}」已绑定模型但模型记录不存在。请到“设置 -> Agent 绑定 -> 任务类别”重新选择模型。`
        )
      }

      if (binding?.enabled && binding.model) {
        const decryptedKey = binding.model.apiKeyRef?.encryptedKey
          ? SecureStorageService.getInstance().decrypt(binding.model.apiKeyRef.encryptedKey)
          : binding.model.apiKey
            ? SecureStorageService.getInstance().decrypt(binding.model.apiKey)
            : null

        const key = decryptedKey?.trim() || ''
        if (!key) {
          throw new Error(
            `任务类别「${opts.category}」已绑定模型「${binding.model.modelName}」但缺少 API Key。` +
              `请到“设置 -> API Keys/模型”补全凭据，或到“设置 -> Agent 绑定 -> 任务类别”切换模型。`
          )
        }

        selectedProvider = binding.model.provider
        selectedModel = binding.model.modelName
        apiKey = key
        baseURL = binding.model.apiKeyRef?.baseURL ?? binding.model.baseURL ?? undefined
        temperature = binding.temperature ?? temperature
      }
    }

    // 3) Otherwise, use any connected provider (supports new ApiKeyRef storage).
    if (!selectedProvider) {
      type ModelRow = {
        provider: string
        modelName: string
        apiKey: string | null
        baseURL: string | null
        apiKeyRef?: { encryptedKey: string; baseURL: string } | null
      }

      const models = await this.prisma.model.findMany({
        where: {
          OR: [{ apiKeyId: { not: null } }, { apiKey: { not: null } }]
        },
        include: { apiKeyRef: true },
        orderBy: { createdAt: 'desc' }
      })

      // Only keep models with usable credentials (apiKeyRef preferred, legacy apiKey fallback).
      const credentialed = (models as ModelRow[])
        .map((m: ModelRow) => {
          const key = m.apiKeyRef?.encryptedKey
            ? SecureStorageService.getInstance().decrypt(m.apiKeyRef.encryptedKey)
            : m.apiKey
              ? SecureStorageService.getInstance().decrypt(m.apiKey)
              : null
          return { model: m, key: key?.trim() || '' }
        })
        .filter((x: { model: ModelRow; key: string }) => x.key.length > 0)

      if (credentialed.length === 0) {
        throw new Error('No model configured for task decomposition')
      }

      // Try to find a match in the orchestrator fallback chain (provider match only).
      for (const entry of DEFAULT_FALLBACK_CHAINS.orchestrator) {
        for (const provider of entry.providers) {
          const found = credentialed.find(
            (m: { model: ModelRow; key: string }) => m.model.provider === provider
          )
          if (found) {
            selectedProvider = provider
            selectedModel = entry.model
            apiKey = found.key
            baseURL = found.model.apiKeyRef?.baseURL ?? found.model.baseURL ?? undefined
            break
          }
        }
        if (selectedProvider) break
      }

      // Fallback to the most recently configured model.
      if (!selectedProvider) {
        const fallback = credentialed[0]
        selectedProvider = fallback.model.provider
        selectedModel = fallback.model.modelName
        apiKey = fallback.key
        baseURL = fallback.model.apiKeyRef?.baseURL ?? fallback.model.baseURL ?? undefined
      }
    }

    this.logger.info('Selected model for decomposition', {
      provider: selectedProvider,
      model: selectedModel,
      viaAgent: opts.agentCode ?? null,
      viaCategory: opts.category ?? null
    })

    const adapter = createLLMAdapter(selectedProvider!, {
      apiKey: apiKey || '',
      baseURL
    })

    const prompt = `Decompose the following task into 3-5 subtasks. For each subtask, identify any dependencies on other subtasks.

Task: ${input}

Return your response as JSON in this exact format:
{
  "subtasks": [
    {
      "id": "task-1",
      "description": "Subtask description",
      "dependencies": []
    },
    {
      "id": "task-2", 
      "description": "Another subtask",
      "dependencies": ["task-1"]
    }
  ]
}

Only return the JSON, no other text.`

    const messages: Message[] = [
      {
        id: 'system',
        sessionId: 'decompose',
        role: 'system',
        content: 'You are a task planning assistant. Always respond with valid JSON.',
        createdAt: new Date(),
        metadata: {}
      },
      {
        id: 'user',
        sessionId: 'decompose',
        role: 'user',
        content: prompt,
        createdAt: new Date(),
        metadata: {}
      }
    ]

    const response = await adapter.sendMessage(messages, {
      model: selectedModel ?? 'claude-3-5-sonnet-20240620',
      temperature
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])
      return parsed.subtasks || []
    } catch (error) {
      this.logger.error('Failed to parse decomposition response', {
        error,
        response: response.content
      })

      return [
        {
          id: 'task-1',
          description: input,
          dependencies: []
        }
      ]
    }
  }

  buildDAG(tasks: SubTask[]): Map<string, string[]> {
    const dag = new Map<string, string[]>()

    for (const task of tasks) {
      dag.set(task.id, task.dependencies || [])
    }

    return dag
  }

  async executeWorkflow(input: string, options?: WorkflowOptions): Promise<WorkflowResult>
  async executeWorkflow(
    input: string,
    sessionId: string,
    options?: WorkflowOptions
  ): Promise<WorkflowResult>
  async executeWorkflow(
    input: string,
    sessionIdOrOptions?: string | WorkflowOptions,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const resolvedSessionId =
      typeof sessionIdOrOptions === 'string' ? sessionIdOrOptions : undefined
    const resolvedOptions =
      typeof sessionIdOrOptions === 'string' ? options : (sessionIdOrOptions ?? {})

    if (!resolvedSessionId) {
      throw new Error('sessionId is required for workflow execution')
    }

    const {
      category = 'unspecified-high',
      agentCode,
      retryConfig,
      enableRetry = true
    } = resolvedOptions
    const retryService = enableRetry ? getTaskRetryService(retryConfig) : null
    const taskRetryStates = new Map<string, RetryState>()

    const workflow = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.task.create({
        data: {
          sessionId: resolvedSessionId,
          type: 'workflow',
          input,
          status: 'running',
          metadata: { category, enableRetry }
        }
      })
    })

    this.logger.info('Executing workflow', { workflowId: workflow.id, input, enableRetry })

    try {
      const subtasks = await this.decomposeTask(input, { agentCode, category })
      const dag = this.buildDAG(subtasks)
      const results = new Map<string, string>()
      const completed = new Set<string>()
      const failed = new Set<string>()
      const inProgress = new Set<string>()

      const executeTask = async (task: SubTask): Promise<void> => {
        inProgress.add(task.id)
        const taskFullId = `${workflow.id}:${task.id}`

        workflowEvents.emit({
          type: 'task:started',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(),
          data: { description: task.description }
        })

        const taskOperation = async () => {
          const result = await this.delegateEngine.delegateTask({
            description: task.description,
            prompt: task.description,
            sessionId: resolvedSessionId,
            category,
            subagent_type: agentCode,
            parentTaskId: workflow.id
          })
          return result
        }

        try {
          let result: { output: string }

          if (retryService) {
            // Execute with retry logic
            const retryResult = await retryService.executeWithRetry(
              taskFullId,
              taskOperation,
              retryConfig
            )

            // Store retry state for reporting
            taskRetryStates.set(task.id, retryResult.state)

            if (!retryResult.success) {
              throw retryResult.error || new Error('Task failed after retries')
            }

            result = retryResult.value!
          } else {
            // Execute without retry
            result = await taskOperation()
          }

          results.set(task.id, result.output)
          completed.add(task.id)
          inProgress.delete(task.id)

          this.logger.info('Subtask completed', {
            workflowId: workflow.id,
            taskId: task.id,
            description: task.description,
            retryAttempts: taskRetryStates.get(task.id)?.attemptNumber ?? 1
          })

          workflowEvents.emit({
            type: 'task:completed',
            workflowId: workflow.id,
            taskId: task.id,
            timestamp: new Date(),
            data: {
              description: task.description,
              output: result.output,
              retryState: taskRetryStates.get(task.id)
            }
          })
        } catch (error) {
          inProgress.delete(task.id)
          failed.add(task.id)

          const errorMessage = error instanceof Error ? error.message : String(error)
          const retryState = taskRetryStates.get(task.id)

          this.logger.error('Subtask failed', {
            workflowId: workflow.id,
            taskId: task.id,
            error: errorMessage,
            attempts: retryState?.attemptNumber ?? 1,
            exhausted: retryState?.status === 'exhausted'
          })

          workflowEvents.emit({
            type: 'task:failed',
            workflowId: workflow.id,
            taskId: task.id,
            timestamp: new Date(),
            data: {
              description: task.description,
              error: errorMessage,
              retryState
            }
          })

          throw error
        }
      }

      const canExecute = (task: SubTask): boolean => {
        const deps = dag.get(task.id) || []
        return deps.every(depId => completed.has(depId))
      }

      while (completed.size < subtasks.length) {
        const ready = subtasks.filter(
          task =>
            !completed.has(task.id) &&
            !inProgress.has(task.id) &&
            !failed.has(task.id) &&
            canExecute(task)
        )

        if (ready.length === 0 && inProgress.size === 0) {
          if (failed.size > 0) {
            throw new Error(`Workflow stopped: ${failed.size} task(s) failed`)
          }
          throw new Error('Deadlock detected: no tasks can proceed')
        }

        const batch = ready.slice(0, MAX_CONCURRENT - inProgress.size)

        if (batch.length > 0) {
          // Execute batch, but don't fail entire workflow on single task failure
          const batchResults = await Promise.allSettled(batch.map(executeTask))

          // Check if any task failed
          const failures = batchResults.filter(r => r.status === 'rejected')
          if (failures.length > 0) {
            // If all tasks in batch failed, throw the first error
            if (failures.length === batch.length) {
              const firstError = (failures[0] as PromiseRejectedResult).reason
              throw firstError
            }
            // Otherwise continue with remaining tasks
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      const finalResult = Array.from(results.values()).join('\n\n---\n\n')

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: 'completed',
          output: finalResult,
          completedAt: new Date(),
          metadata: {
            category,
            enableRetry,
            retryStats: {
              totalTasks: subtasks.length,
              tasksRetried: Array.from(taskRetryStates.values()).filter(s => s.attemptNumber > 1)
                .length
            }
          }
        }
      })

      this.logger.info('Workflow completed', {
        workflowId: workflow.id,
        totalTasks: subtasks.length,
        tasksRetried: Array.from(taskRetryStates.values()).filter(s => s.attemptNumber > 1).length
      })

      workflowEvents.emit({
        type: 'workflow:completed',
        workflowId: workflow.id,
        taskId: workflow.id,
        timestamp: new Date(),
        data: { success: true, taskCount: subtasks.length }
      })

      return {
        workflowId: workflow.id,
        tasks: subtasks,
        results,
        success: true,
        retryStates: taskRetryStates
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: 'failed',
          output: `Error: ${errorMessage}`,
          completedAt: new Date(),
          metadata: {
            category,
            enableRetry,
            retryStats: {
              tasksRetried: Array.from(taskRetryStates.values()).filter(s => s.attemptNumber > 1)
                .length,
              failedTasks: Array.from(taskRetryStates.entries())
                .filter(([, s]) => s.status === 'exhausted')
                .map(([id]) => id)
            }
          }
        }
      })

      this.logger.error('Workflow failed', { workflowId: workflow.id, error: errorMessage })

      throw error
    }
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

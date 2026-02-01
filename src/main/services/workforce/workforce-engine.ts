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
import type { Message } from '@/types/domain'

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
}

const MAX_CONCURRENT = 3

export class WorkforceEngine {
  private prisma = DatabaseService.getInstance().getClient()
  private logger = LoggerService.getInstance().getLogger()
  private delegateEngine = new DelegateEngine()

  async decomposeTask(input: string): Promise<SubTask[]> {
    this.logger.info('Decomposing task', { input })

    const model = await this.prisma.model.findFirst({
      where: { provider: 'anthropic' },
      orderBy: { createdAt: 'desc' }
    })

    if (!model) {
      throw new Error('No model configured for task decomposition')
    }

    const adapter = createLLMAdapter('anthropic', {
      apiKey: model.apiKey || ''
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
      model: 'claude-3-5-sonnet-20240620',
      temperature: 0.3
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

  async executeWorkflow(
    input: string,
    category: string = 'unspecified-high'
  ): Promise<WorkflowResult> {
    const session = await this.getOrCreateDefaultSession()

    const workflow = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.task.create({
        data: {
          sessionId: session.id,
          type: 'workflow',
          input,
          status: 'running',
          metadata: { category }
        }
      })
    })

    this.logger.info('Executing workflow', { workflowId: workflow.id, input })

    try {
      const subtasks = await this.decomposeTask(input)
      const dag = this.buildDAG(subtasks)
      const results = new Map<string, string>()
      const completed = new Set<string>()
      const inProgress = new Set<string>()

      const executeTask = async (task: SubTask): Promise<void> => {
        inProgress.add(task.id)

        try {
          const result = await this.delegateEngine.delegateTask({
            description: task.description,
            prompt: task.description,
            category,
            parentTaskId: workflow.id
          })

          results.set(task.id, result.output)
          completed.add(task.id)
          inProgress.delete(task.id)

          this.logger.info('Subtask completed', {
            workflowId: workflow.id,
            taskId: task.id,
            description: task.description
          })
        } catch (error) {
          inProgress.delete(task.id)
          throw error
        }
      }

      const canExecute = (task: SubTask): boolean => {
        const deps = dag.get(task.id) || []
        return deps.every(depId => completed.has(depId))
      }

      while (completed.size < subtasks.length) {
        const ready = subtasks.filter(
          task => !completed.has(task.id) && !inProgress.has(task.id) && canExecute(task)
        )

        if (ready.length === 0 && inProgress.size === 0) {
          throw new Error('Deadlock detected: no tasks can proceed')
        }

        const batch = ready.slice(0, MAX_CONCURRENT - inProgress.size)

        if (batch.length > 0) {
          await Promise.all(batch.map(executeTask))
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
          completedAt: new Date()
        }
      })

      this.logger.info('Workflow completed', { workflowId: workflow.id })

      return {
        workflowId: workflow.id,
        tasks: subtasks,
        results,
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: 'failed',
          output: `Error: ${errorMessage}`,
          completedAt: new Date()
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

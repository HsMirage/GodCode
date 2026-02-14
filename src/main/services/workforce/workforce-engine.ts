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
import { BoulderStateService } from '../boulder-state.service'
import fs from 'node:fs'
import path from 'node:path'

export interface SubTask {
  id: string
  description: string
  dependencies: string[]
  assignedAgent?: string
  source?: 'decomposed' | 'plan'
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
  /** Optional explicit plan path for plan-driven execution */
  planPath?: string
  /** Abort signal propagated from session stop action */
  abortSignal?: AbortSignal
}

interface WorkflowTaskResolution {
  subtasks: SubTask[]
  source: 'decomposed' | 'plan'
  planPath?: string
  planName?: string
}

const MAX_CONCURRENT = 3
const KNOWN_AGENT_CODES = new Set([
  'fuxi',
  'haotian',
  'kuafu',
  'luban',
  'baize',
  'chongming',
  'leigong',
  'diting',
  'qianliyan',
  'multimodal-looker'
])
const CATEGORY_TO_AGENT: Record<string, string> = {
  'visual-engineering': 'luban',
  zhinv: 'luban',
  writing: 'diting',
  cangjie: 'diting',
  quick: 'qianliyan',
  tianbing: 'qianliyan',
  ultrabrain: 'baize',
  guigu: 'baize',
  artistry: 'luban',
  maliang: 'luban',
  deep: 'kuafu',
  guixu: 'kuafu',
  'unspecified-low': 'qianliyan',
  tudi: 'qianliyan',
  'unspecified-high': 'kuafu',
  dayu: 'kuafu'
}

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
    opts: {
      agentCode?: string
      category?: string
      abortSignal?: AbortSignal
      workspaceDir?: string
      sessionId?: string
    } = {}
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

    const workspaceName = opts.workspaceDir ? path.basename(opts.workspaceDir) : undefined
    const prompt = `Decompose the following task into 3-5 subtasks. For each subtask, identify any dependencies on other subtasks.

STRICT CONTEXT RULES:
- You must stay within the user's request and the current workspace context.
- Never inject unrelated project context or names that are not in the request.
- ${
      workspaceName
        ? `Current workspace name: "${workspaceName}". If you mention a project name, it must match this workspace or the user input.`
        : 'If project name is unclear, use neutral wording like "当前项目" instead of inventing names.'
    }

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
      temperature,
      abortSignal: opts.abortSignal,
      workspaceDir: opts.workspaceDir,
      sessionId: opts.sessionId,
      // Task decomposition must stay pure planning; disable runtime tool execution.
      tools: []
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

  private async resolveWorkflowTasks(
    input: string,
    sessionId: string,
    options: WorkflowOptions,
    workspaceDir: string
  ): Promise<WorkflowTaskResolution> {
    const maybePlanPath = await this.resolvePlanPath(input, sessionId, options, workspaceDir)
    if (options.agentCode === 'kuafu' && this.shouldPreferPlanExecution(input, options.agentCode) && !maybePlanPath) {
      throw new Error(
        '未找到可执行计划文件。请先让伏羲生成计划，或手动指定路径：执行计划 .sisyphus/plans/<plan>.md'
      )
    }
    if (maybePlanPath) {
      try {
        const planSubtasks = this.parsePlanSubtasks(maybePlanPath)
        return {
          subtasks: planSubtasks,
          source: 'plan',
          planPath: maybePlanPath,
          planName: path.basename(maybePlanPath, path.extname(maybePlanPath))
        }
      } catch (error) {
        this.logger.warn('Failed to parse plan file, fallback to decomposition', {
          planPath: maybePlanPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return {
      subtasks: await this.decomposeTask(input, {
        agentCode: options.agentCode,
        category: options.category,
        abortSignal: options.abortSignal,
        workspaceDir,
        sessionId
      }),
      source: 'decomposed'
    }
  }

  private async resolvePlanPath(
    input: string,
    sessionId: string,
    options: WorkflowOptions,
    workspaceDir: string
  ): Promise<string | undefined> {
    const candidates = new Set<string>()

    if (options.planPath) {
      candidates.add(options.planPath)
    }

    const fromInput = this.extractPlanPathFromInput(input)
    if (fromInput) {
      candidates.add(fromInput)
    }

    if (this.shouldPreferPlanExecution(input, options.agentCode)) {
      try {
        const boulder = BoulderStateService.getInstance()
        const state = await boulder.getState()
        const tracked = await boulder.isSessionTracked(sessionId)
        if (tracked && state.active_plan) {
          candidates.add(state.active_plan)
        }
      } catch (error) {
        this.logger.warn('Failed to read boulder state for plan resolution', {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    for (const candidate of candidates) {
      const normalized = this.normalizePlanPath(candidate, workspaceDir)
      if (fs.existsSync(normalized)) {
        return normalized
      }
    }

    return undefined
  }

  private shouldPreferPlanExecution(input: string, agentCode?: string): boolean {
    if (agentCode === 'kuafu') {
      return true
    }

    return /(执行计划|继续计划|run plan|execute plan|resume plan|按计划)/i.test(input)
  }

  private extractPlanPathFromInput(input: string): string | undefined {
    const match = input.match(/(?:[A-Za-z]:)?[^\s"'`]*\.sisyphus[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i)
    return match?.[0]
  }

  private normalizePlanPath(rawPath: string, workspaceDir: string): string {
    const trimmed = rawPath.trim().replace(/^["']|["']$/g, '')
    if (path.isAbsolute(trimmed)) {
      return path.normalize(trimmed)
    }
    return path.resolve(workspaceDir, trimmed)
  }

  private parsePlanSubtasks(planPath: string): SubTask[] {
    const content = fs.readFileSync(planPath, 'utf-8')
    const lines = content.split(/\r?\n/)
    const pending: Array<{
      logicalId: string
      description: string
      rawDependencies: string[]
      assignedAgent?: string
    }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const checkboxMatch = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/)
      if (!checkboxMatch) continue

      const completed = checkboxMatch[1].toLowerCase() === 'x'
      if (completed) continue

      const rawDescription = checkboxMatch[2]
      const normalizedDescription = rawDescription
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const explicitId =
        normalizedDescription.match(/\bTask\s+([0-9]+(?:\.[0-9]+)*)\b/i)?.[1] ??
        normalizedDescription.match(/^([0-9]+(?:\.[0-9]+)*)[:：]/)?.[1]
      const logicalId = explicitId ?? String(pending.length + 1)
      const taskBlockLines: string[] = []

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j]
        if (/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/i.test(nextLine)) {
          break
        }
        if (!nextLine.trim()) {
          continue
        }
        taskBlockLines.push(nextLine)
      }

      const rawDependencies = [normalizedDescription, ...taskBlockLines].flatMap(blockLine =>
        this.extractDependencyIds(blockLine)
      )
      const assignedAgent = this.extractAssignedAgentHint([normalizedDescription, ...taskBlockLines])

      pending.push({
        logicalId,
        description: normalizedDescription,
        rawDependencies: Array.from(new Set(rawDependencies)),
        assignedAgent
      })
    }

    const hasExplicitDependencies = pending.some(task => task.rawDependencies.length > 0)
    const knownIds = new Set(pending.map(task => task.logicalId))

    return pending.map((task, index) => {
      const safeId = task.logicalId.replace(/[^a-zA-Z0-9_.-]/g, '-')
      const explicitDependencies = task.rawDependencies
        .filter(dep => knownIds.has(dep))
        .map(dep => `plan-${dep.replace(/[^a-zA-Z0-9_.-]/g, '-')}`)
      const previous = index > 0 ? pending[index - 1].logicalId.replace(/[^a-zA-Z0-9_.-]/g, '-') : ''
      const dependencies = hasExplicitDependencies
        ? explicitDependencies
        : previous
          ? [`plan-${previous}`]
          : []
      return {
        id: `plan-${safeId}`,
        description: task.description,
        dependencies,
        assignedAgent: task.assignedAgent,
        source: 'plan'
      }
    })
  }

  private extractDependencyIds(text: string): string[] {
    const normalized = text
      .replace(/[*`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const hasDependencyMarker = /(depends on|dependencies|dependency|blocked by|依赖|依赖于|前置|阻塞于|blocked-by|deps?)/i.test(
      normalized
    )
    if (!hasDependencyMarker) {
      return []
    }
    const dependencyPrefix =
      /(depends on|dependencies|dependency|blocked by|依赖|依赖于|前置|阻塞于|blocked-by|deps?)\s*[:：]\s*(.+)$/i
    const prefixMatch = normalized.match(dependencyPrefix)
    const targetText = prefixMatch ? prefixMatch[2] : normalized
    const ids = Array.from(targetText.matchAll(/(?:task\s*)?([0-9]+(?:\.[0-9]+)*)/gi)).map(match => match[1])
    return Array.from(new Set(ids))
  }

  private extractAssignedAgentHint(lines: string[]): string | undefined {
    const normalized = lines
      .map(line => line.replace(/[*`]/g, ' ').trim())
      .filter(Boolean)

    for (const line of normalized) {
      const explicitAgent =
        line.match(/(?:agent|代理|执行者|assignee)\s*[:：=]\s*([a-zA-Z0-9_-]+)/i)?.[1] ||
        line.match(/\[agent\s*[:：=]\s*([a-zA-Z0-9_-]+)\]/i)?.[1]
      if (explicitAgent) {
        const candidate = explicitAgent.toLowerCase()
        if (KNOWN_AGENT_CODES.has(candidate)) {
          return candidate
        }
      }

      const categoryHint =
        line.match(/(?:category|类别)\s*[:：=]\s*([a-zA-Z0-9_-]+)/i)?.[1] ||
        line.match(/task\s*\(\s*category\s*=\s*"([a-zA-Z0-9_-]+)"\s*\)/i)?.[1]
      if (categoryHint) {
        const mapped = CATEGORY_TO_AGENT[categoryHint.toLowerCase()]
        if (mapped) {
          return mapped
        }
      }

      const inlineAgent = Array.from(KNOWN_AGENT_CODES).find(code =>
        new RegExp(`\\b${code}\\b`, 'i').test(line)
      )
      if (inlineAgent) {
        return inlineAgent
      }
    }

    return undefined
  }

  private selectSubagentForTask(task: SubTask, orchestratorAgentCode?: string): string {
    const text = task.description.toLowerCase()

    if (/(校验计划|计划审查|review plan|verify plan)/i.test(text)) {
      return 'leigong'
    }

    if (/(调研|research|官方|开源|benchmark|best practice|对标)/i.test(text)) {
      return 'diting'
    }

    if (/(文档|docs?|readme|api reference|规划文档|spec|specification|设计文档)/i.test(text)) {
      return 'qianliyan'
    }

    if (/(架构|评审|review|审查|debug|诊断|risk|风险)/i.test(text)) {
      return 'baize'
    }

    if (/(搜索|检索|定位|探索|scan|grep|find|context)/i.test(text)) {
      return 'qianliyan'
    }

    if (/(计划|歧义|澄清|clarify|ambigu|pre-plan|分析意图)/i.test(text)) {
      return 'chongming'
    }

    if (/(前端|ui|组件|样式|css|layout|页面|动画)/i.test(text)) {
      return 'luban'
    }

    if (/(后端|api|数据库|schema|migration|service|controller|单测|测试|test|ci|pipeline|deploy)/i.test(text)) {
      return 'kuafu'
    }

    if (/(实现|修复|feature|bug|refactor|重构|集成)/i.test(text)) {
      return orchestratorAgentCode === 'haotian' ? 'kuafu' : 'luban'
    }

    if (orchestratorAgentCode === 'haotian') {
      return 'kuafu'
    }

    return 'luban'
  }

  private buildTaskPrompt(task: SubTask, taskSource: 'decomposed' | 'plan'): string {
    if (taskSource === 'plan') {
      return [
        'TASK:',
        task.description,
        '',
        'EXPECTED OUTCOME:',
        '完成该计划任务并给出可验证结果。',
        '',
        'MUST DO:',
        '- 保持变更最小，遵循现有代码风格。',
        '- 执行必要验证并报告结果。',
        '',
        'MUST NOT DO:',
        '- 不得偏离计划范围。',
        '- 不得忽略失败或跳过验证。'
      ].join('\n')
    }

    return task.description
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
      enableRetry = true,
      abortSignal
    } = resolvedOptions
    const retryService = enableRetry ? getTaskRetryService(retryConfig) : null
    const taskRetryStates = new Map<string, RetryState>()
    const cancellationMessage = 'Workflow cancelled by user'
    const isAbortRequested = (error?: unknown): boolean => {
      if (abortSignal?.aborted) return true
      if (!error || !(error instanceof Error)) return false
      if (error.name === 'AbortError') return true
      return /aborted|abort|cancelled by user|cancelled/i.test(error.message)
    }
    const throwIfAborted = () => {
      if (abortSignal?.aborted) {
        throw new Error(cancellationMessage)
      }
    }

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
      const workspaceDir = await this.resolveWorkspaceDirForSession(resolvedSessionId)
      this.logger.info('[workforce] Resolved session workspace context', {
        workflowId: workflow.id,
        sessionId: resolvedSessionId,
        workspaceDir,
        agentCode
      })
      throwIfAborted()
      const taskResolution = await this.resolveWorkflowTasks(
        input,
        resolvedSessionId,
        resolvedOptions,
        workspaceDir
      )
      throwIfAborted()
      const subtasks = this.appendReviewTaskIfNeeded(
        taskResolution.subtasks.map(task => ({
          ...task,
          assignedAgent: task.assignedAgent ?? this.selectSubagentForTask(task, agentCode)
        })),
        taskResolution.source,
        agentCode
      )
      const dag = this.buildDAG(subtasks)
      const results = new Map<string, string>()
      const completed = new Set<string>()
      const failed = new Set<string>()
      const inProgress = new Set<string>()
      const logicalToPersistedTaskId = new Map<string, string>()

      const executeTask = async (task: SubTask): Promise<void> => {
        throwIfAborted()
        inProgress.add(task.id)
        const taskFullId = `${workflow.id}:${task.id}`
        const assignedAgent = task.assignedAgent ?? this.selectSubagentForTask(task, agentCode)
        const dependencyTaskIds = task.dependencies
          .map(depId => logicalToPersistedTaskId.get(depId))
          .filter((depId): depId is string => Boolean(depId))

        workflowEvents.emit({
          type: 'task:assigned',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(),
          data: {
            description: task.description,
            assignedAgent
          }
        })

        workflowEvents.emit({
          type: 'task:started',
          workflowId: workflow.id,
          taskId: task.id,
          timestamp: new Date(),
          data: { description: task.description, assignedAgent }
        })

        const taskOperation = async () => {
          throwIfAborted()
          const result = await this.delegateEngine.delegateTask({
            description: task.description,
            prompt: this.buildTaskPrompt(task, taskResolution.source),
            sessionId: resolvedSessionId,
            category,
            subagent_type: assignedAgent,
            parentTaskId: workflow.id,
            abortSignal,
            metadata: {
              dependencies: dependencyTaskIds,
              logicalTaskId: task.id,
              logicalDependencies: task.dependencies,
              taskSource: task.source ?? taskResolution.source,
              assignedAgent,
              workflowId: workflow.id,
              planPath: taskResolution.planPath,
              planName: taskResolution.planName
            }
          })
          if (!result.success) {
            throw new Error(result.output || 'Delegate task returned unsuccessful status')
          }
          return result
        }

        try {
          let result: { output: string; taskId: string }

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

          logicalToPersistedTaskId.set(task.id, result.taskId)
          results.set(task.id, result.output)
          completed.add(task.id)
          inProgress.delete(task.id)

          this.logger.info('Subtask completed', {
            workflowId: workflow.id,
            taskId: task.id,
            description: task.description,
            assignedAgent,
            retryAttempts: taskRetryStates.get(task.id)?.attemptNumber ?? 1
          })

          workflowEvents.emit({
            type: 'task:completed',
            workflowId: workflow.id,
            taskId: task.id,
            timestamp: new Date(),
            data: {
              description: task.description,
              assignedAgent,
              persistedTaskId: result.taskId,
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
            assignedAgent,
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
              assignedAgent,
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
        throwIfAborted()
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
          throwIfAborted()
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
            taskSource: taskResolution.source,
            planPath: taskResolution.planPath,
            planName: taskResolution.planName,
            orchestratorAgent: agentCode,
            assignments: subtasks.map(task => ({
              taskId: task.id,
              assignedAgent: task.assignedAgent
            })),
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
      const cancelled = isAbortRequested(error)

      await this.prisma.task.update({
        where: { id: workflow.id },
        data: {
          status: cancelled ? 'cancelled' : 'failed',
          output: cancelled ? 'Cancelled by user' : `Error: ${errorMessage}`,
          completedAt: new Date(),
          metadata: {
            category,
            enableRetry,
            orchestratorAgent: agentCode,
            cancelledByUser: cancelled,
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

      if (cancelled) {
        this.logger.info('Workflow cancelled', { workflowId: workflow.id })
      } else {
        this.logger.error('Workflow failed', { workflowId: workflow.id, error: errorMessage })
      }

      throw error
    }
  }

  private async resolveWorkspaceDirForSession(sessionId: string): Promise<string> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { space: true }
    })
    if (session?.space?.workDir) {
      return session.space.workDir
    }

    throw new Error(`Session workspace not found for workflow: ${sessionId}`)
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

  private appendReviewTaskIfNeeded(
    tasks: SubTask[],
    source: 'decomposed' | 'plan',
    orchestratorAgentCode?: string
  ): SubTask[] {
    if (orchestratorAgentCode !== 'haotian') {
      return tasks
    }

    if (tasks.length <= 1) {
      return tasks
    }

    const reviewTaskId = source === 'plan' ? 'plan-haotian-review' : 'haotian-review'
    if (tasks.some(task => task.id === reviewTaskId)) {
      return tasks
    }

    return [
      ...tasks,
      {
        id: reviewTaskId,
        description: '审查已完成子任务的结果一致性，确认验收标准与风险说明完整。',
        dependencies: tasks.map(task => task.id),
        assignedAgent: 'leigong',
        source
      }
    ]
  }
}

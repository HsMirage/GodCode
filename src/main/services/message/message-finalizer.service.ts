import fs from 'fs'
import path from 'path'
import type { Message as PrismaMessage, PrismaClient } from '@prisma/client'
import { BoulderStateService } from '@/main/services/boulder-state.service'
import { persistAssistantMessage } from './message-persistence.service'
import type { MessageExecutionResult, MessageLogger, MessageRuntimeContext } from './message.types'

function extractPlanPath(content: string): string | undefined {
  const match = content.match(
    /(?:[A-Za-z]:)?[^\s"'`]*(?:\.fuxi|\.sisyphus)[\\/]+plans[\\/]+[^\s"'`<>]+\.md/i
  )
  return match?.[0]
}

function normalizePlanPath(candidate: string, workspaceDir: string): string {
  const trimmed = candidate.trim().replace(/^["']|["']$/g, '')
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed)
  }
  return path.resolve(workspaceDir, trimmed)
}

async function applyFuxiPlanHandoff({
  logger,
  runtimeContext,
  executionResult
}: {
  logger: MessageLogger
  runtimeContext: MessageRuntimeContext
  executionResult: MessageExecutionResult
}): Promise<MessageExecutionResult> {
  const { agentCode, input, workspaceDir } = runtimeContext
  const { assistantContent } = executionResult

  if (agentCode !== 'fuxi' || !assistantContent.trim()) {
    return executionResult
  }

  const detectedPlanPath = extractPlanPath(assistantContent)
  const boulderService = BoulderStateService.getInstance()
  let normalizedPlanPath: string | undefined

  if (detectedPlanPath) {
    normalizedPlanPath = normalizePlanPath(detectedPlanPath, workspaceDir)
  } else {
    try {
      const tracked = await boulderService.isSessionTracked(input.sessionId)
      const state = await boulderService.getState()
      if (tracked && state.active_plan) {
        normalizedPlanPath = normalizePlanPath(state.active_plan, workspaceDir)
      }
    } catch (error) {
      logger.warn('Failed to read boulder state after FuXi planning', {
        sessionId: input.sessionId,
        planPath: detectedPlanPath,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const looksLikePlanOutput =
    /(TL;DR|TODOs|Execution Strategy|Success Criteria|工作目标|执行策略|成功标准|计划|TODO)/i.test(
      assistantContent
    )
  const resolvedPlanPath =
    normalizedPlanPath && fs.existsSync(normalizedPlanPath) ? normalizedPlanPath : undefined

  if (!resolvedPlanPath || (!detectedPlanPath && !looksLikePlanOutput)) {
    return executionResult
  }

  try {
    const state = await boulderService.getState()
    const sessionIds = new Set(state.session_ids || [])
    sessionIds.add(input.sessionId)

    await boulderService.updateState({
      active_plan: resolvedPlanPath,
      plan_name: path.basename(resolvedPlanPath, path.extname(resolvedPlanPath)),
      session_ids: Array.from(sessionIds),
      agent: 'fuxi',
      status: 'in_progress'
    })
  } catch (error) {
    logger.warn('Failed to update boulder state after FuXi planning', {
      sessionId: input.sessionId,
      planPath: resolvedPlanPath,
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return {
    assistantContent: `${assistantContent}\n\n---\n\n✅ 伏羲已完成规划，建议切换到夸父(KuaFu)执行。\n请发送：\`执行计划 ${resolvedPlanPath}\``,
    assistantMetadata: {
      ...(executionResult.assistantMetadata || {}),
      handoffToAgent: 'kuafu',
      planPath: resolvedPlanPath
    }
  }
}

export async function finalizeMessageExecution({
  prisma,
  logger,
  runtimeContext,
  userMessage,
  executionResult,
  streamWasAborted
}: {
  prisma: PrismaClient
  logger: MessageLogger
  runtimeContext: MessageRuntimeContext
  userMessage: PrismaMessage
  executionResult: MessageExecutionResult
  streamWasAborted: boolean
}): Promise<PrismaMessage> {
  if (streamWasAborted && !executionResult.assistantContent.trim()) {
    return userMessage
  }

  const finalizedExecution = await applyFuxiPlanHandoff({
    logger,
    runtimeContext,
    executionResult
  })

  return persistAssistantMessage({
    prisma,
    sessionId: userMessage.sessionId,
    content: finalizedExecution.assistantContent,
    metadata: finalizedExecution.assistantMetadata
  })
}

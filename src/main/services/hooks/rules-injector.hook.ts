import fs from 'fs'
import path from 'path'
import { logger } from '../../../shared/logger'
import { globTool } from '../tools/builtin/glob'
import type { HookConfig, HookContext, MessageInfo } from './types'

const RULES_PATTERN = '.sisyphus/rules/*.md'
const RULES_INJECTED_MARKER = '[WORKSPACE RULES INJECTED]'

async function findRuleFiles(context: HookContext): Promise<string[]> {
  const result = await globTool.execute(
    {
      pattern: RULES_PATTERN,
      path: '.',
      hidden: true,
      limit: 100
    },
    {
      workspaceDir: context.workspaceDir,
      sessionId: context.sessionId,
      userId: context.userId
    }
  )

  if (!result.success) {
    logger.debug('[rules-injector] Failed to glob rules', {
      sessionId: context.sessionId,
      workspaceDir: context.workspaceDir,
      error: result.error
    })
    return []
  }

  const files = result.metadata?.files
  if (!Array.isArray(files)) {
    return []
  }

  return files.filter((file): file is string => typeof file === 'string').sort()
}

function readRuleFile(absolutePath: string): string | null {
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8').trim()
    return content.length > 0 ? content : null
  } catch (error) {
    logger.warn('[rules-injector] Failed to read rule file', {
      path: absolutePath,
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

function buildRulesBlock(context: HookContext, files: string[]): string | null {
  const sections: string[] = []

  for (const relativePath of files) {
    const absolutePath = path.join(context.workspaceDir, relativePath)
    const content = readRuleFile(absolutePath)
    if (!content) {
      continue
    }
    sections.push(`## ${relativePath}\n${content}`)
  }

  if (sections.length === 0) {
    return null
  }

  return `${RULES_INJECTED_MARKER}\n\n${sections.join('\n\n---\n\n')}`
}

export function createRulesInjectorHook(): HookConfig<'onMessageCreate'> {
  return {
    id: 'rules-injector',
    name: 'Rules Injector',
    event: 'onMessageCreate',
    description: 'Injects workspace rules into system prompt from .sisyphus/rules/*.md',
    priority: 5,

    callback: async (
      context: HookContext,
      message: MessageInfo
    ): Promise<{ modifiedContent?: string }> => {
      if (message.role !== 'system') {
        return {}
      }

      if (message.content.includes(RULES_INJECTED_MARKER)) {
        return {}
      }

      const files = await findRuleFiles(context)
      if (files.length === 0) {
        return {}
      }

      const rulesBlock = buildRulesBlock(context, files)
      if (!rulesBlock) {
        return {}
      }

      return {
        modifiedContent: `${message.content}\n\n${rulesBlock}`
      }
    }
  }
}

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

import { AGENT_DEFINITIONS } from '../../../shared/agent-definitions'
import {
  qianliyanPromptTemplate,
  baizePromptTemplate,
  ditingPromptTemplate,
  chongmingPromptTemplate,
  leigongPromptTemplate,
  fuxiPromptTemplate,
  haotianPromptTemplate,
  kuafuPromptTemplate,
  lubanPromptTemplate
} from './prompts'
import type { AgentPromptTemplate } from './prompts/types'

export interface AgentConfig {
  type: 'readonly' | 'executor'
  model: string
  tools?: string[]
  promptTemplate?: AgentPromptTemplate
}

// All prompt templates - build map automatically from agentCode
const ALL_PROMPTS: AgentPromptTemplate[] = [
  qianliyanPromptTemplate,
  baizePromptTemplate,
  ditingPromptTemplate,
  chongmingPromptTemplate,
  leigongPromptTemplate,
  fuxiPromptTemplate,
  haotianPromptTemplate,
  kuafuPromptTemplate,
  lubanPromptTemplate
]

// Auto-build PROMPT_MAP from agentCode field
const PROMPT_MAP: Record<string, AgentPromptTemplate> = Object.fromEntries(
  ALL_PROMPTS.map(p => [p.agentCode, p])
)

function determineAgentType(tools: string[]): 'readonly' | 'executor' {
  return tools.some(t => ['write', 'edit'].includes(t)) ? 'executor' : 'readonly'
}

const agentsRegistry = AGENT_DEFINITIONS.reduce(
  (acc, def) => {
    const type = determineAgentType(def.tools)

    const config: AgentConfig = {
      type,
      model: def.defaultModel,
      tools: def.tools,
      promptTemplate: PROMPT_MAP[def.code]
    }

    acc[def.code] = config

    return acc
  },
  {} as Record<string, AgentConfig>
)

export const agents = agentsRegistry

export function getAgentPromptByCode(code: string): string | undefined {
  return agents[code]?.promptTemplate?.systemPrompt
}

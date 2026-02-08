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

import { AGENT_DEFINITIONS } from '@/shared/agent-definitions'
import {
  explorePromptTemplate,
  oraclePromptTemplate,
  librarianPromptTemplate,
  metisPromptTemplate,
  momusPromptTemplate,
  prometheusPromptTemplate,
  sisyphusPromptTemplate,
  atlasPromptTemplate,
  hephaestusPromptTemplate
} from './prompts'
import type { AgentPromptTemplate } from './prompts/types'

export interface AgentConfig {
  type: 'readonly' | 'executor'
  model: string
  tools?: string[]
  promptTemplate?: AgentPromptTemplate
}

const AGENT_ALIASES: Record<string, string> = {
  explore: 'qianliyan',
  oracle: 'baize',
  librarian: 'diting',
  metis: 'chongming',
  momus: 'leigong',
  prometheus: 'fuxi',
  sisyphus: 'haotian',
  atlas: 'kuafu',
  hephaestus: 'luban'
}

const PROMPT_MAP: Record<string, AgentPromptTemplate> = {
  qianliyan: explorePromptTemplate,
  baize: oraclePromptTemplate,
  diting: librarianPromptTemplate,
  chongming: metisPromptTemplate,
  leigong: momusPromptTemplate,
  fuxi: prometheusPromptTemplate,
  haotian: sisyphusPromptTemplate,
  kuafu: atlasPromptTemplate,
  luban: hephaestusPromptTemplate
}

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

Object.entries(AGENT_ALIASES).forEach(([alias, targetCode]) => {
  if (agentsRegistry[targetCode]) {
    agentsRegistry[alias] = agentsRegistry[targetCode]
  }
})

export const agents = agentsRegistry

export function getAgentPromptByCode(code: string): string | undefined {
  const resolved = AGENT_ALIASES[code] || code
  return agents[resolved]?.promptTemplate?.systemPrompt
}

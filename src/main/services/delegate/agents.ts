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

export interface AgentConfig {
  type: 'readonly' | 'executor'
  model: string
  tools?: string[]
}

export const agents: Record<string, AgentConfig> = {
  luban: {
    type: 'executor',
    model: 'claude-3-5-sonnet-20240620',
    tools: [
      'read',
      'write',
      'edit',
      'grep',
      'glob',
      'browser_navigate',
      'browser_click',
      'browser_fill',
      'browser_snapshot',
      'browser_screenshot',
      'browser_extract'
    ]
  },
  oracle: {
    type: 'readonly',
    model: 'claude-3-5-sonnet-20240620',
    tools: []
  },
  explore: {
    type: 'readonly',
    model: 'claude-3-5-sonnet-20240620',
    tools: ['grep', 'read', 'glob']
  },
  librarian: {
    type: 'readonly',
    model: 'claude-3-5-sonnet-20240620',
    tools: ['context7', 'websearch', 'github-search']
  }
}

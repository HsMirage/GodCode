export interface AgentConfig {
  type: 'readonly' | 'executor'
  model: string
  tools?: string[]
}

export const agents: Record<string, AgentConfig> = {
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

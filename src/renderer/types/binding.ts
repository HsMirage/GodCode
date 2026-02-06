/**
 * Agent 绑定相关类型定义 (前端)
 */

export interface AgentBindingData {
  id: string
  agentCode: string
  agentName: string
  agentType: 'primary' | 'subagent'
  description: string | null
  modelId: string | null
  modelName?: string | null
  temperature: number
  tools: string[]
  systemPrompt: string | null
  enabled: boolean
}

export interface CategoryBindingData {
  id: string
  categoryCode: string
  categoryName: string
  description: string | null
  modelId: string | null
  modelName?: string | null
  temperature: number
  systemPrompt: string | null
  enabled: boolean
}

export interface UpdateAgentBindingInput {
  modelId?: string | null
  temperature?: number
  tools?: string[]
  systemPrompt?: string | null
  enabled?: boolean
}

export interface UpdateCategoryBindingInput {
  modelId?: string | null
  temperature?: number
  systemPrompt?: string | null
  enabled?: boolean
}

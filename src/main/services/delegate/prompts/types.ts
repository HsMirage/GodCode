/**
 * Agent Prompt Template Definition
 */
export interface AgentPromptTemplate {
  /**
   * The unique code of the agent (matches AgentDefinition.code)
   * e.g., 'fuxi', 'haotian'
   */
  agentCode: string

  /**
   * The full system prompt for the agent
   */
  systemPrompt: string

  /**
   * Optional description of what this prompt version is for
   */
  description?: string

  /**
   * Optional version string
   */
  version?: string
}

/**
 * Category Prompt Template Definition
 */
export interface CategoryPromptTemplate {
  /**
   * The unique code of the category (matches CategoryDefinition.code)
   * e.g., 'zhinv', 'tianbing'
   */
  categoryCode: string

  /**
   * The prompt text appended to category-based delegations
   */
  promptAppend: string

  /**
   * Optional description of what this prompt version is for
   */
  description?: string

  /**
   * Optional version string
   */
  version?: string
}

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

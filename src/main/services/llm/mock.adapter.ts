import type { Message } from '@/types/domain'
import type { LLMAdapter, LLMConfig, LLMResponse, LLMChunk } from './adapter.interface'
import type { ToolExecutionContext } from '@/main/services/tools/tool.interface'
import { toolExecutionService } from '@/main/services/tools/tool-execution.service'

// Side effect: register builtin tools
import '@/main/services/tools'

/**
 * Mock LLM Adapter for testing without real API keys.
 * Returns deterministic responses and demonstrates tool execution path.
 */
export class MockLLMAdapter implements LLMAdapter {
  private readonly context: ToolExecutionContext = {
    workspaceDir: process.cwd(),
    sessionId: 'mock-session'
  }

  async sendMessage(messages: Message[], _config: LLMConfig): Promise<LLMResponse> {
    const lastUserMessage = this.getLastUserMessage(messages)
    let content = this.generateCannedResponse(lastUserMessage)

    if (lastUserMessage.toLowerCase().includes('tool:')) {
      const toolOutput = await this.executeFileListTool()
      content += `\n\n[Tool Execution Result]\n${toolOutput}`
    }

    return {
      content,
      usage: {
        prompt_tokens: this.estimateTokens(messages),
        completion_tokens: this.estimateTokens([{ content } as Message])
      }
    }
  }

  async *streamMessage(messages: Message[], config: LLMConfig): AsyncGenerator<LLMChunk> {
    const response = await this.sendMessage(messages, config)
    const words = response.content.split(' ')

    for (let i = 0; i < words.length; i++) {
      const isLast = i === words.length - 1
      yield {
        content: words[i] + (isLast ? '' : ' '),
        done: isLast
      }
    }
  }

  private getLastUserMessage(messages: Message[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content
      }
    }
    return ''
  }

  private generateCannedResponse(userMessage: string): string {
    const msgLower = userMessage.toLowerCase()

    if (msgLower.includes('hello') || msgLower.includes('hi')) {
      return 'Hello! I am the Mock LLM Adapter. I provide deterministic responses for testing.'
    }

    if (msgLower.includes('help')) {
      return 'I can help with testing. Try including "tool:" in your message to trigger file_list execution.'
    }

    if (msgLower.includes('error')) {
      return '[Mock Error Response] This simulates an error scenario for testing purposes.'
    }

    return `[Mock Response] Received: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`
  }

  private async executeFileListTool(): Promise<string> {
    const toolCall = {
      id: 'mock-tool-call-001',
      name: 'file_list',
      arguments: { directory: this.context.workspaceDir }
    }

    const result = await toolExecutionService.executeTool(toolCall, this.context)

    if (result.success) {
      return typeof result.result === 'object' && 'output' in result.result
        ? (result.result as { output: string }).output
        : JSON.stringify(result.result)
    }

    return `Tool execution failed: ${result.error || 'Unknown error'}`
  }

  private static readonly CHARS_PER_TOKEN = 4

  private estimateTokens(messages: Message[] | { content: string }[]): number {
    let totalChars = 0
    for (const msg of messages) {
      totalChars += msg.content?.length || 0
    }
    return Math.ceil(totalChars / MockLLMAdapter.CHARS_PER_TOKEN)
  }
}

export const mockLLMAdapter = new MockLLMAdapter()

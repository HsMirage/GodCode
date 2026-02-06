import { DatabaseService } from './database'
import { LoggerService } from './logger'
import type { Message } from '@/types/domain'

export interface ContextWindow {
  messages: Message[]
  totalTokens: number
  truncated: boolean
}

export class ContextManagerService {
  private _prisma: ReturnType<typeof DatabaseService.prototype.getClient> | null = null
  private logger = LoggerService.getInstance().getLogger()

  private get prisma() {
    if (!this._prisma) {
      this._prisma = DatabaseService.getInstance().getClient()
    }
    return this._prisma
  }

  /**
   * 获取会话的上下文窗口（滑动窗口）
   */
  async getContextWindow(sessionId: string, maxTokens: number = 8000): Promise<ContextWindow> {
    try {
      const allMessages = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' }
      })

      if (allMessages.length === 0) {
        return { messages: [], totalTokens: 0, truncated: false }
      }

      // 从最新消息开始反向选择，直到达到 token 限制
      const selectedMessages: Message[] = []
      let currentTokens = 0
      let truncated = false

      // 系统消息优先保留
      const systemMessages = allMessages.filter((m: Message) => m.role === 'system')
      const otherMessages = allMessages.filter((m: Message) => m.role !== 'system')

      for (const msg of systemMessages) {
        const msgTokens = this.estimateTokens(msg.content)
        if (currentTokens + msgTokens <= maxTokens) {
          selectedMessages.push(msg)
          currentTokens += msgTokens
        }
      }

      for (let i = otherMessages.length - 1; i >= 0; i--) {
        const msg = otherMessages[i]
        const msgTokens = this.estimateTokens(msg.content)

        if (currentTokens + msgTokens <= maxTokens) {
          selectedMessages.unshift(msg)
          currentTokens += msgTokens
        } else {
          truncated = true
          break
        }
      }

      selectedMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

      this.logger.info('Context window created', {
        sessionId,
        totalMessages: allMessages.length,
        selectedMessages: selectedMessages.length,
        totalTokens: currentTokens,
        truncated
      })

      return {
        messages: selectedMessages,
        totalTokens: currentTokens,
        truncated
      }
    } catch (error) {
      this.logger.error('Failed to get context window', error)
      throw error
    }
  }

  /**
   * 生成会话摘要（用于长期记忆）
   */
  async generateSummary(sessionId: string): Promise<string> {
    try {
      const messages = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: 50 // 最多摘要前 50 条消息
      })

      if (messages.length === 0) {
        return ''
      }

      // 简单摘要：提取关键信息
      const userMessages = messages.filter((m: Message) => m.role === 'user')
      const assistantMessages = messages.filter((m: Message) => m.role === 'assistant')

      const summary = `Session Summary (${messages.length} messages):
- User messages: ${userMessages.length}
- Assistant messages: ${assistantMessages.length}
- Topics discussed: [Auto-extracted keywords would go here]
- Created: ${messages[0].createdAt}
- Last updated: ${messages[messages.length - 1].createdAt}`

      this.logger.info('Generated session summary', { sessionId })
      return summary
    } catch (error) {
      this.logger.error('Failed to generate summary', error)
      throw error
    }
  }

  /**
   * 估算文本的 token 数量（粗略估计）
   */
  private estimateTokens(text: string): number {
    // 粗略估计: 1 token ≈ 4 字符（英文），2 字符（中文）
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }

  /**
   * 清理旧消息（保留最近 N 条）
   */
  async cleanupOldMessages(sessionId: string, keepCount: number = 100): Promise<number> {
    try {
      const allMessages = await this.prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      })

      if (allMessages.length <= keepCount) {
        return 0
      }

      const toDelete = allMessages.slice(keepCount).map((m: { id: string }) => m.id)
      const result = await this.prisma.message.deleteMany({
        where: { id: { in: toDelete } }
      })

      this.logger.info('Cleaned up old messages', {
        sessionId,
        deleted: result.count
      })

      return result.count
    } catch (error) {
      this.logger.error('Failed to cleanup old messages', error)
      throw error
    }
  }
}

export const contextManagerService = new ContextManagerService()

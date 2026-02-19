export interface LLMRetryNotification {
  sessionId?: string
  provider: 'openai' | 'anthropic' | 'gemini'
  attempt: number
  delayMs: number
  error: string
  occurredAt: Date
}

type RetryListener = (notification: LLMRetryNotification) => void

class LLMRetryNotifier {
  private listeners = new Set<RetryListener>()

  subscribe(listener: RetryListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(notification: LLMRetryNotification): void {
    for (const listener of this.listeners) {
      listener(notification)
    }
  }
}

export const llmRetryNotifier = new LLMRetryNotifier()

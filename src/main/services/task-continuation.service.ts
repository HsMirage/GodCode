import { logger } from '../../shared/logger'

export interface Todo {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}

export interface SessionState {
  todos: Todo[]
  isRecovering: boolean
  countdownTimer?: ReturnType<typeof setTimeout>
  abortDetectedAt?: number
}

const CONTINUATION_PROMPT = `[SYSTEM REMINDER - TODO CONTINUATION]

Incomplete tasks remain in your todo list. Continue working on the next pending task.

- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done`

const COUNTDOWN_SECONDS = 2

export class TaskContinuationService {
  private sessions = new Map<string, SessionState>()

  getState(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId)
    if (!state) {
      state = { todos: [], isRecovering: false }
      this.sessions.set(sessionId, state)
    }
    return state
  }

  setTodos(sessionId: string, todos: Todo[]): void {
    const state = this.getState(sessionId)
    state.todos = todos
  }

  getIncompleteTodos(sessionId: string): Todo[] {
    const state = this.getState(sessionId)
    return state.todos.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
  }

  shouldContinue(sessionId: string): boolean {
    const state = this.getState(sessionId)
    if (state.isRecovering) return false

    const incomplete = this.getIncompleteTodos(sessionId)
    return incomplete.length > 0
  }

  getContinuationPrompt(sessionId: string): string | null {
    if (!this.shouldContinue(sessionId)) return null

    const state = this.getState(sessionId)
    const incomplete = this.getIncompleteTodos(sessionId)
    const completed = state.todos.filter(t => t.status === 'completed').length

    return `${CONTINUATION_PROMPT}\n\n[Status: ${completed}/${state.todos.length} completed, ${incomplete.length} remaining]`
  }

  markRecovering(sessionId: string): void {
    const state = this.getState(sessionId)
    state.isRecovering = true
    this.cancelCountdown(sessionId)
    logger.info('[TaskContinuation] Session marked as recovering', { sessionId })
  }

  markRecoveryComplete(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state) {
      state.isRecovering = false
      logger.info('[TaskContinuation] Session recovery complete', { sessionId })
    }
  }

  markAborted(sessionId: string): void {
    const state = this.getState(sessionId)
    state.abortDetectedAt = Date.now()
    this.cancelCountdown(sessionId)
    logger.info('[TaskContinuation] Abort detected', { sessionId })
  }

  wasRecentlyAborted(sessionId: string, windowMs = 3000): boolean {
    const state = this.sessions.get(sessionId)
    if (!state?.abortDetectedAt) return false

    const timeSinceAbort = Date.now() - state.abortDetectedAt
    if (timeSinceAbort < windowMs) {
      return true
    }

    state.abortDetectedAt = undefined
    return false
  }

  startCountdown(sessionId: string, onContinue: () => void): void {
    const state = this.getState(sessionId)
    this.cancelCountdown(sessionId)

    const incomplete = this.getIncompleteTodos(sessionId)
    if (incomplete.length === 0) return

    state.countdownTimer = setTimeout(() => {
      this.cancelCountdown(sessionId)
      if (this.shouldContinue(sessionId)) {
        logger.info('[TaskContinuation] Triggering continuation', {
          sessionId,
          incompleteCount: incomplete.length
        })
        onContinue()
      }
    }, COUNTDOWN_SECONDS * 1000)

    logger.info('[TaskContinuation] Countdown started', {
      sessionId,
      seconds: COUNTDOWN_SECONDS,
      incompleteCount: incomplete.length
    })
  }

  cancelCountdown(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state?.countdownTimer) return

    clearTimeout(state.countdownTimer)
    state.countdownTimer = undefined
  }

  cleanup(sessionId: string): void {
    this.cancelCountdown(sessionId)
    this.sessions.delete(sessionId)
    logger.info('[TaskContinuation] Session cleaned up', { sessionId })
  }

  updateTodoStatus(sessionId: string, todoId: string, status: Todo['status']): void {
    const state = this.getState(sessionId)
    const todo = state.todos.find(t => t.id === todoId)
    if (todo) {
      todo.status = status
      logger.info('[TaskContinuation] Todo status updated', {
        sessionId,
        todoId,
        status
      })
    }
  }
}

export const taskContinuationService = new TaskContinuationService()

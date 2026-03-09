import type {
  HookConfig,
  HookContext,
  ToolExecutionInput,
  ToolExecutionOutput,
  MessageInfo
} from './types'

const CONTINUATION_REMINDER = `[SYSTEM REMINDER - TODO CONTINUATION]

Incomplete tasks remain in your todo list. Continue working on the next in_progress item.

- Continue without waiting for permission
- Keep one todo in_progress at a time
- Mark items completed immediately after finishing`

const sessionsNeedingReminder = new Set<string>()

type TodoLike = {
  status?: unknown
}

function isTodoWriteTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/[_-]/g, '')
  return normalized === 'todowrite'
}

function parseTodosFromOutput(output: ToolExecutionOutput): TodoLike[] {
  const fromMetadata = output.metadata?.todos
  if (Array.isArray(fromMetadata)) {
    return fromMetadata as TodoLike[]
  }

  if (!output.output || typeof output.output !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(output.output) as unknown
    if (Array.isArray(parsed)) {
      return parsed as TodoLike[]
    }
    if (parsed && typeof parsed === 'object' && 'todos' in parsed) {
      const nested = (parsed as { todos?: unknown }).todos
      return Array.isArray(nested) ? (nested as TodoLike[]) : []
    }
    return []
  } catch {
    return []
  }
}

function hasInProgressTodo(todos: TodoLike[]): boolean {
  return todos.some(todo => todo?.status === 'in_progress')
}

export function createTodoContinuationToolHook(): HookConfig<'onToolEnd'> {
  return {
    id: 'todo-continuation-flagger',
    name: 'Todo Continuation Flagger',
    event: 'onToolEnd',
    source: 'builtin',
    scope: 'session',
    description: 'Flags sessions for continuation reminder after todowrite with in_progress todos',
    priority: 20,
    callback: async (
      context: HookContext,
      input: ToolExecutionInput,
      output: ToolExecutionOutput
    ): Promise<void> => {
      if (!isTodoWriteTool(input.tool) || !output.success) {
        return
      }

      const todos = parseTodosFromOutput(output)
      if (hasInProgressTodo(todos)) {
        sessionsNeedingReminder.add(context.sessionId)
      }
    }
  }
}

export function createTodoContinuationMessageHook(): HookConfig<'onMessageCreate'> {
  return {
    id: 'todo-continuation-injector',
    name: 'Todo Continuation Injector',
    event: 'onMessageCreate',
    source: 'builtin',
    scope: 'session',
    description: 'Injects one-shot continuation reminder when session is flagged',
    priority: 6,
    callback: async (context: HookContext, _message: MessageInfo): Promise<{ inject?: string }> => {
      if (!sessionsNeedingReminder.has(context.sessionId)) {
        return {}
      }

      sessionsNeedingReminder.delete(context.sessionId)
      return { inject: CONTINUATION_REMINDER }
    }
  }
}

export function createTodoContinuationHooks(): HookConfig[] {
  return [createTodoContinuationToolHook(), createTodoContinuationMessageHook()]
}

export function clearTodoContinuationReminder(sessionId?: string): void {
  if (sessionId) {
    sessionsNeedingReminder.delete(sessionId)
    return
  }
  sessionsNeedingReminder.clear()
}

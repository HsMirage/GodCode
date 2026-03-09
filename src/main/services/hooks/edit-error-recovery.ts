/**
 * 编辑错误恢复 Hook
 *
 * 捕获 Edit 工具的常见错误并注入恢复指令
 */

import type { HookConfig, HookContext, EditErrorInfo, ToolExecutionInput, ToolExecutionOutput } from './types'

/**
 * Edit 工具错误模式
 */
export const EDIT_ERROR_PATTERNS = {
  NOT_FOUND: ['oldstring not found', 'old_string not found', 'string not found in file'],
  MULTIPLE_MATCHES: [
    'oldstring found multiple times',
    'old_string found multiple times',
    'multiple matches found'
  ],
  SAME_CONTENT: [
    'oldstring and newstring must be different',
    'old_string and new_string must be different',
    'no changes to make'
  ]
} as const

/**
 * 编辑错误恢复提示
 */
export const EDIT_ERROR_REMINDERS = {
  NOT_FOUND: `
[EDIT ERROR - STRING NOT FOUND]

The oldString you specified was not found in the file. This usually means:
1. The file content has changed since you last read it
2. Your oldString doesn't match exactly (whitespace, indentation, etc.)
3. The file path might be wrong

IMMEDIATE ACTION REQUIRED:
1. READ the file again to see its current state
2. VERIFY the exact content you want to replace
3. RETRY the edit with the correct oldString

DO NOT guess or assume - read the file first.
`,

  MULTIPLE_MATCHES: `
[EDIT ERROR - MULTIPLE MATCHES]

The oldString you specified appears multiple times in the file.

IMMEDIATE ACTION REQUIRED:
1. READ the file to understand its structure
2. EXPAND your oldString to include more context (surrounding lines)
3. Make the oldString unique enough to match only one location
4. RETRY the edit with a more specific oldString

TIP: Include 2-3 lines before and after the target line to make it unique.
`,

  SAME_CONTENT: `
[EDIT ERROR - NO CHANGES]

The oldString and newString are identical - there's nothing to change.

IMMEDIATE ACTION REQUIRED:
1. VERIFY what changes you actually need to make
2. Ensure newString is different from oldString
3. If no changes are needed, acknowledge this to the user

This might indicate the change was already made in a previous edit.
`,

  UNKNOWN: `
[EDIT ERROR - RECOVERY NEEDED]

An error occurred while editing the file.

IMMEDIATE ACTION REQUIRED:
1. READ the file to see its current state
2. UNDERSTAND what went wrong
3. RETRY with corrected parameters

Always verify file content before attempting edits.
`
} as const

/**
 * 检测错误类型
 */
function detectErrorType(errorMessage: string): EditErrorInfo['errorType'] {
  const lowerMessage = errorMessage.toLowerCase()

  for (const pattern of EDIT_ERROR_PATTERNS.NOT_FOUND) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      return 'not_found'
    }
  }

  for (const pattern of EDIT_ERROR_PATTERNS.MULTIPLE_MATCHES) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      return 'multiple_matches'
    }
  }

  for (const pattern of EDIT_ERROR_PATTERNS.SAME_CONTENT) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      return 'same_content'
    }
  }

  return 'unknown'
}

/**
 * 获取错误恢复消息
 */
function getRecoveryMessage(errorType: EditErrorInfo['errorType']): string {
  switch (errorType) {
    case 'not_found':
      return EDIT_ERROR_REMINDERS.NOT_FOUND
    case 'multiple_matches':
      return EDIT_ERROR_REMINDERS.MULTIPLE_MATCHES
    case 'same_content':
      return EDIT_ERROR_REMINDERS.SAME_CONTENT
    default:
      return EDIT_ERROR_REMINDERS.UNKNOWN
  }
}

/**
 * 创建编辑错误恢复 Hook (onEditError 版本)
 */
export function createEditErrorRecoveryHook(): HookConfig<'onEditError'> {
  return {
    id: 'edit-error-recovery',
    name: 'Edit Error Recovery',
    event: 'onEditError',
    source: 'builtin',
    scope: 'tool',
    description: 'Detects Edit tool errors and injects recovery instructions',
    priority: 10,

    callback: async (
      _context: HookContext,
      error: EditErrorInfo
    ): Promise<{ recovery?: string; injection?: string }> => {
      const recovery = getRecoveryMessage(error.errorType)
      return {
        recovery,
        injection: recovery
      }
    }
  }
}

/**
 * 创建编辑错误恢复 Hook (onToolEnd 版本)
 *
 * 这个版本在工具执行结束后检测错误，适合不使用 onEditError 事件的场景
 */
export function createEditErrorRecoveryToolHook(): HookConfig<'onToolEnd'> {
  return {
    id: 'edit-error-recovery-tool',
    name: 'Edit Error Recovery (Tool)',
    event: 'onToolEnd',
    source: 'builtin',
    scope: 'tool',
    description: 'Detects Edit tool errors from tool output and injects recovery instructions',
    priority: 10,

    callback: async (
      _context: HookContext,
      input: ToolExecutionInput,
      output: ToolExecutionOutput
    ): Promise<{ modifiedOutput?: Partial<ToolExecutionOutput> }> => {
      // 只处理 Edit 工具
      const toolName = input.tool.toLowerCase()
      if (toolName !== 'edit' && toolName !== 'file_edit') {
        return {}
      }

      // 只处理失败的执行
      if (output.success) {
        return {}
      }

      // 检测错误类型
      const errorType = detectErrorType(output.error ?? output.output)
      if (errorType === 'unknown' && !output.error) {
        return {}
      }

      // 获取恢复消息
      const recovery = getRecoveryMessage(errorType)

      return {
        modifiedOutput: {
          output: output.output + '\n' + recovery
        }
      }
    }
  }
}

/**
 * 从工具输出解析编辑错误信息
 */
export function parseEditError(
  toolName: string,
  params: Record<string, unknown>,
  output: ToolExecutionOutput
): EditErrorInfo | null {
  const lowerToolName = toolName.toLowerCase()
  if (lowerToolName !== 'edit' && lowerToolName !== 'file_edit') {
    return null
  }

  if (output.success) {
    return null
  }

  const errorMessage = output.error ?? output.output
  const errorType = detectErrorType(errorMessage)

  return {
    filePath: (params.path ?? params.file_path ?? '') as string,
    errorType,
    errorMessage,
    oldString: (params.old_string ?? params.oldString) as string | undefined,
    newString: (params.new_string ?? params.newString) as string | undefined
  }
}

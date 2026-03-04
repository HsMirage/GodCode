/**
 * Claude Code Hook 适配器
 *
 * 将 Claude Code 的 hook 格式适配到 CodeAll 的 hook 系统
 */

import { spawn } from 'child_process'
import type {
  ClaudeCodeHooksConfig,
  ClaudeCodeMatcherGroup,
  ClaudeCodeHookHandler,
  ClaudeCodeHookInput,
  ClaudeCodeHookOutput,
  PreToolUseInput,
  PostToolUseInput
} from './types'
import { expandCommandEnv, type EnvExpanderOptions } from './env-expander'
import type { HookConfig, OnToolStartCallback, OnToolEndCallback } from '../types'

/**
 * 适配器选项
 */
export interface AdapterOptions {
  /** 项目根目录 */
  projectDir: string
  /** Session ID */
  sessionId: string
  /** 工作目录 */
  workspaceDir: string
  /** transcript 文件路径 */
  transcriptPath?: string
  /** 权限模式 */
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions'
}

/**
 * 命令执行结果
 */
interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * Claude Code Hook 适配器
 *
 * 将 Claude Code 格式的 hooks 转换为 CodeAll 格式
 */
export class ClaudeCodeAdapter {
  private config: ClaudeCodeHooksConfig
  private options: AdapterOptions

  constructor(config: ClaudeCodeHooksConfig, options: AdapterOptions) {
    this.config = config
    this.options = options
  }

  /**
   * 获取所有适配后的 CodeAll hooks
   */
  getAdaptedHooks(): HookConfig[] {
    if (this.config.disableAllHooks) {
      return []
    }

    const hooks: HookConfig[] = []

    // 转换 PreToolUse -> onToolStart
    const preToolUseGroups = this.config.hooks.PreToolUse || []
    for (const group of preToolUseGroups) {
      hooks.push(this.adaptPreToolUse(group))
    }

    // 转换 PostToolUse -> onToolEnd
    const postToolUseGroups = this.config.hooks.PostToolUse || []
    for (const group of postToolUseGroups) {
      hooks.push(this.adaptPostToolUse(group))
    }

    // 转换 PostToolUseFailure -> onToolEnd (with error)
    const postToolUseFailureGroups = this.config.hooks.PostToolUseFailure || []
    for (const group of postToolUseFailureGroups) {
      hooks.push(this.adaptPostToolUseFailure(group))
    }

    return hooks
  }

  /**
   * 适配 PreToolUse hook
   */
  private adaptPreToolUse(group: ClaudeCodeMatcherGroup): HookConfig<'onToolStart'> {
    const matcher = group.matcher ? new RegExp(group.matcher) : null

    const callback: OnToolStartCallback = async (context, input) => {
      // 检查 matcher
      if (matcher && !matcher.test(input.tool)) {
        return
      }

      // 构建 Claude Code 格式的输入
      const hookInput: PreToolUseInput = {
        session_id: this.options.sessionId,
        transcript_path: this.options.transcriptPath || '',
        cwd: this.options.workspaceDir,
        permission_mode: this.options.permissionMode || 'default',
        hook_event_name: 'PreToolUse',
        tool_name: input.tool,
        tool_input: input.params as Record<string, unknown>,
        tool_use_id: input.callId
      }

      // 执行所有 handlers
      for (const handler of group.hooks) {
        const result = await this.executeHandler(handler, hookInput)

        if (result) {
          // 处理决策
          if (result.continue === false) {
            return { skip: true }
          }

          if (result.hookSpecificOutput) {
            const specific = result.hookSpecificOutput as any
            if (specific.hookEventName === 'PreToolUse') {
              if (specific.permissionDecision === 'deny') {
                return { skip: true }
              }
              if (specific.updatedInput) {
                return {
                  modified: {
                    params: { ...input.params, ...specific.updatedInput }
                  }
                }
              }
            }
          }
        }
      }

      return
    }

    return {
      id: `claude-code-pretooluse-${group.matcher || 'all'}`,
      name: `Claude Code PreToolUse (${group.matcher || '*'})`,
      event: 'onToolStart',
      callback,
      priority: 100,
      enabled: true,
      description: `Adapted from Claude Code PreToolUse hook with matcher: ${group.matcher || '*'}`
    }
  }

  /**
   * 适配 PostToolUse hook
   */
  private adaptPostToolUse(group: ClaudeCodeMatcherGroup): HookConfig<'onToolEnd'> {
    const matcher = group.matcher ? new RegExp(group.matcher) : null

    const callback: OnToolEndCallback = async (context, input, output) => {
      // 检查 matcher
      if (matcher && !matcher.test(input.tool)) {
        return
      }

      // 构建 Claude Code 格式的输入
      const hookInput: PostToolUseInput = {
        session_id: this.options.sessionId,
        transcript_path: this.options.transcriptPath || '',
        cwd: this.options.workspaceDir,
        permission_mode: this.options.permissionMode || 'default',
        hook_event_name: 'PostToolUse',
        tool_name: input.tool,
        tool_input: input.params as Record<string, unknown>,
        tool_response: {
          title: output.title,
          output: output.output,
          success: output.success,
          metadata: output.metadata
        },
        tool_use_id: input.callId
      }

      // 执行所有 handlers
      for (const handler of group.hooks) {
        await this.executeHandler(handler, hookInput)
      }

      return
    }

    return {
      id: `claude-code-posttooluse-${group.matcher || 'all'}`,
      name: `Claude Code PostToolUse (${group.matcher || '*'})`,
      event: 'onToolEnd',
      callback,
      priority: 100,
      enabled: true,
      description: `Adapted from Claude Code PostToolUse hook with matcher: ${group.matcher || '*'}`
    }
  }

  /**
   * 适配 PostToolUseFailure hook
   */
  private adaptPostToolUseFailure(group: ClaudeCodeMatcherGroup): HookConfig<'onToolEnd'> {
    const matcher = group.matcher ? new RegExp(group.matcher) : null

    const callback: OnToolEndCallback = async (context, input, output) => {
      // 只处理失败的工具调用
      if (output.success) {
        return
      }

      // 检查 matcher
      if (matcher && !matcher.test(input.tool)) {
        return
      }

      // 构建 Claude Code 格式的输入
      const hookInput = {
        session_id: this.options.sessionId,
        transcript_path: this.options.transcriptPath || '',
        cwd: this.options.workspaceDir,
        permission_mode: this.options.permissionMode || 'default',
        hook_event_name: 'PostToolUseFailure' as const,
        tool_name: input.tool,
        tool_input: input.params as Record<string, unknown>,
        tool_use_id: input.callId,
        error: output.error || 'Unknown error',
        is_interrupt: false
      }

      // 执行所有 handlers
      for (const handler of group.hooks) {
        await this.executeHandler(handler, hookInput)
      }

      return
    }

    return {
      id: `claude-code-posttoolusefailure-${group.matcher || 'all'}`,
      name: `Claude Code PostToolUseFailure (${group.matcher || '*'})`,
      event: 'onToolEnd',
      callback,
      priority: 100,
      enabled: true,
      description: `Adapted from Claude Code PostToolUseFailure hook with matcher: ${group.matcher || '*'}`
    }
  }

  /**
   * 执行 hook handler
   */
  private async executeHandler(
    handler: ClaudeCodeHookHandler,
    input: ClaudeCodeHookInput
  ): Promise<ClaudeCodeHookOutput | null> {
    if (handler.type === 'command') {
      return this.executeCommandHandler(handler, input)
    } else if (handler.type === 'prompt') {
      // Prompt hooks 需要 LLM 支持，暂不实现
      console.warn('Prompt hooks are not yet supported')
      return null
    } else if (handler.type === 'agent') {
      // Agent hooks 需要子代理支持，暂不实现
      console.warn('Agent hooks are not yet supported')
      return null
    }

    return null
  }

  /**
   * 执行命令类型的 handler
   */
  private async executeCommandHandler(
    handler: Extract<ClaudeCodeHookHandler, { type: 'command' }>,
    input: ClaudeCodeHookInput
  ): Promise<ClaudeCodeHookOutput | null> {
    const expanderOptions: EnvExpanderOptions = {
      projectDir: this.options.projectDir,
      customEnv: {
        CLAUDE_CODE_REMOTE: 'false'
      }
    }

    const command = expandCommandEnv(handler.command, expanderOptions)
    const timeout = (handler.timeout || 600) * 1000

    try {
      const result = await this.executeCommand(command, JSON.stringify(input), timeout)

      // 处理退出码
      if (result.exitCode === 2) {
        // 阻塞错误
        return {
          continue: false,
          stopReason: result.stderr || 'Blocked by hook'
        }
      }

      if (result.exitCode !== 0) {
        // 非阻塞错误，继续执行
        return null
      }

      // 尝试解析 JSON 输出
      const stdout = result.stdout.trim()
      if (stdout.startsWith('{')) {
        try {
          return JSON.parse(stdout) as ClaudeCodeHookOutput
        } catch {
          // 解析失败，忽略
        }
      }

      return null
    } catch (error) {
      console.error('Hook command execution failed:', error)
      return null
    }
  }

  /**
   * 执行 shell 命令
   */
  private executeCommand(
    command: string,
    stdin: string,
    timeout: number
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32'
      const shell = isWindows ? 'cmd.exe' : '/bin/sh'
      const shellArgs = isWindows ? ['/c', command] : ['-c', command]

      const proc = spawn(shell, shellArgs, {
        cwd: this.options.workspaceDir,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: this.options.projectDir,
          CLAUDE_CODE_REMOTE: 'false'
        },
        timeout
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      // 发送 stdin
      if (stdin) {
        proc.stdin.write(stdin)
        proc.stdin.end()
      }

      proc.on('close', (exitCode) => {
        resolve({
          exitCode: exitCode || 0,
          stdout,
          stderr
        })
      })

      proc.on('error', (error) => {
        reject(error)
      })
    })
  }
}

/**
 * 创建适配器实例
 */
export function createAdapter(
  config: ClaudeCodeHooksConfig,
  options: AdapterOptions
): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter(config, options)
}

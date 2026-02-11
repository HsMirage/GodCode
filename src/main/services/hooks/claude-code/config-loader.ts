/**
 * Claude Code Hook 配置加载器
 *
 * 从 .claude/hooks 目录或 settings.json 加载 hook 配置
 */

import fs from 'fs/promises'
import path from 'path'
import type {
  ClaudeCodeHooksConfig,
  ClaudeCodeHookEvent,
  ClaudeCodeMatcherGroup,
  ClaudeCodeHookHandler
} from './types'

/**
 * 配置加载选项
 */
export interface ConfigLoaderOptions {
  /** 项目根目录 */
  projectDir: string
  /** 用户主目录 */
  homeDir?: string
}

/**
 * 加载结果
 */
export interface LoadedConfig {
  /** 配置来源 */
  source: 'user' | 'project' | 'local' | 'plugin'
  /** 配置文件路径 */
  filePath: string
  /** 配置内容 */
  config: ClaudeCodeHooksConfig
}

/**
 * 配置加载器
 */
export class ClaudeCodeConfigLoader {
  private projectDir: string
  private homeDir: string

  constructor(options: ConfigLoaderOptions) {
    this.projectDir = options.projectDir
    this.homeDir = options.homeDir || process.env.HOME || process.env.USERPROFILE || ''
  }

  /**
   * 加载所有配置文件
   * 按优先级排序: user < project < local < plugin
   */
  async loadAllConfigs(): Promise<LoadedConfig[]> {
    const configs: LoadedConfig[] = []

    // 1. 用户全局配置 ~/.claude/settings.json
    const userConfig = await this.loadUserConfig()
    if (userConfig) {
      configs.push(userConfig)
    }

    // 2. 项目配置 .claude/settings.json
    const projectConfig = await this.loadProjectConfig()
    if (projectConfig) {
      configs.push(projectConfig)
    }

    // 3. 本地配置 .claude/settings.local.json
    const localConfig = await this.loadLocalConfig()
    if (localConfig) {
      configs.push(localConfig)
    }

    // 4. 插件配置 (暂不实现)

    return configs
  }

  /**
   * 加载用户全局配置
   */
  async loadUserConfig(): Promise<LoadedConfig | null> {
    const filePath = path.join(this.homeDir, '.claude', 'settings.json')
    return this.loadConfigFile(filePath, 'user')
  }

  /**
   * 加载项目配置
   */
  async loadProjectConfig(): Promise<LoadedConfig | null> {
    const filePath = path.join(this.projectDir, '.claude', 'settings.json')
    return this.loadConfigFile(filePath, 'project')
  }

  /**
   * 加载本地配置
   */
  async loadLocalConfig(): Promise<LoadedConfig | null> {
    const filePath = path.join(this.projectDir, '.claude', 'settings.local.json')
    return this.loadConfigFile(filePath, 'local')
  }

  /**
   * 从文件加载配置
   */
  private async loadConfigFile(
    filePath: string,
    source: 'user' | 'project' | 'local' | 'plugin'
  ): Promise<LoadedConfig | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const json = JSON.parse(content)

      // 检查是否包含 hooks 配置
      if (!json.hooks || typeof json.hooks !== 'object') {
        return null
      }

      const config = this.parseConfig(json)
      if (!config) {
        return null
      }

      return {
        source,
        filePath,
        config
      }
    } catch {
      // 文件不存在或解析失败
      return null
    }
  }

  /**
   * 解析配置 JSON
   */
  private parseConfig(json: Record<string, unknown>): ClaudeCodeHooksConfig | null {
    const hooks = json.hooks as Record<string, unknown> | undefined
    if (!hooks) {
      return null
    }

    const result: ClaudeCodeHooksConfig = {
      hooks: {},
      disableAllHooks: json.disableAllHooks === true,
      description: typeof json.description === 'string' ? json.description : undefined
    }

    // 解析每个事件的 hooks
    const validEvents: ClaudeCodeHookEvent[] = [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PermissionRequest',
      'PostToolUse',
      'PostToolUseFailure',
      'Notification',
      'SubagentStart',
      'SubagentStop',
      'Stop',
      'TeammateIdle',
      'TaskCompleted',
      'PreCompact',
      'SessionEnd'
    ]

    for (const event of validEvents) {
      const eventHooks = hooks[event]
      if (Array.isArray(eventHooks)) {
        const matcherGroups = this.parseMatcherGroups(eventHooks)
        if (matcherGroups.length > 0) {
          result.hooks[event] = matcherGroups
        }
      }
    }

    return result
  }

  /**
   * 解析匹配器组数组
   */
  private parseMatcherGroups(groups: unknown[]): ClaudeCodeMatcherGroup[] {
    const result: ClaudeCodeMatcherGroup[] = []

    for (const group of groups) {
      if (typeof group !== 'object' || group === null) {
        continue
      }

      const g = group as Record<string, unknown>
      const hooks = g.hooks

      if (!Array.isArray(hooks)) {
        continue
      }

      const parsedHooks = this.parseHookHandlers(hooks)
      if (parsedHooks.length === 0) {
        continue
      }

      result.push({
        matcher: typeof g.matcher === 'string' ? g.matcher : undefined,
        hooks: parsedHooks
      })
    }

    return result
  }

  /**
   * 解析 hook 处理器数组
   */
  private parseHookHandlers(handlers: unknown[]): ClaudeCodeHookHandler[] {
    const result: ClaudeCodeHookHandler[] = []

    for (const handler of handlers) {
      if (typeof handler !== 'object' || handler === null) {
        continue
      }

      const h = handler as Record<string, unknown>
      const type = h.type

      if (type === 'command' && typeof h.command === 'string') {
        result.push({
          type: 'command',
          command: h.command,
          timeout: typeof h.timeout === 'number' ? h.timeout : undefined,
          async: h.async === true,
          statusMessage: typeof h.statusMessage === 'string' ? h.statusMessage : undefined,
          once: h.once === true ? true : undefined
        })
      } else if (type === 'prompt' && typeof h.prompt === 'string') {
        result.push({
          type: 'prompt',
          prompt: h.prompt,
          model: typeof h.model === 'string' ? h.model : undefined,
          timeout: typeof h.timeout === 'number' ? h.timeout : undefined,
          statusMessage: typeof h.statusMessage === 'string' ? h.statusMessage : undefined,
          once: h.once === true ? true : undefined
        })
      } else if (type === 'agent' && typeof h.prompt === 'string') {
        result.push({
          type: 'agent',
          prompt: h.prompt,
          model: typeof h.model === 'string' ? h.model : undefined,
          timeout: typeof h.timeout === 'number' ? h.timeout : undefined,
          statusMessage: typeof h.statusMessage === 'string' ? h.statusMessage : undefined,
          once: h.once === true ? true : undefined
        })
      }
    }

    return result
  }
}

/**
 * 合并多个配置
 * 后面的配置覆盖前面的
 */
export function mergeConfigs(configs: LoadedConfig[]): ClaudeCodeHooksConfig {
  const result: ClaudeCodeHooksConfig = {
    hooks: {},
    disableAllHooks: false
  }

  for (const { config } of configs) {
    // 如果任何配置禁用了所有 hooks，则禁用
    if (config.disableAllHooks) {
      result.disableAllHooks = true
    }

    // 合并 hooks
    for (const [event, matcherGroups] of Object.entries(config.hooks)) {
      const eventKey = event as ClaudeCodeHookEvent
      if (!result.hooks[eventKey]) {
        result.hooks[eventKey] = []
      }
      result.hooks[eventKey]!.push(...(matcherGroups || []))
    }
  }

  return result
}

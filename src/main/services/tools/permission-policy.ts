/**
 * 工具权限策略
 *
 * 定义工具的执行权限和安全级别
 */

export type ToolPermissionLevel = 'auto' | 'confirm' | 'deny'

export interface ToolPermissionConfig {
  /** 工具名称 */
  name: string
  /** 权限级别 */
  permission: ToolPermissionLevel
  /** 需要确认的原因 */
  confirmReason?: string
  /** 是否为危险操作 */
  dangerous?: boolean
}

/**
 * 默认工具权限配置
 */
const TOOL_PERMISSIONS: Record<string, ToolPermissionConfig> = {
  // 文件读取 - 自动允许
  file_read: {
    name: 'file_read',
    permission: 'auto'
  },
  // 文件列表 - 自动允许
  file_list: {
    name: 'file_list',
    permission: 'auto'
  },
  // 文件写入 - 需要确认
  file_write: {
    name: 'file_write',
    permission: 'confirm',
    confirmReason: 'This tool will modify files in your workspace',
    dangerous: false
  },
  // Grep 搜索 - 自动允许
  grep: {
    name: 'grep',
    permission: 'auto'
  },
  // Glob 搜索 - 自动允许
  glob: {
    name: 'glob',
    permission: 'auto'
  },
  // Bash 执行 - 需要确认
  bash: {
    name: 'bash',
    permission: 'confirm',
    confirmReason: 'This tool will execute shell commands',
    dangerous: true
  },
  // Web 获取 - 自动允许
  webfetch: {
    name: 'webfetch',
    permission: 'auto'
  },
  // Web 搜索 - 自动允许
  websearch: {
    name: 'websearch',
    permission: 'auto'
  },
  // 多模态分析 - 自动允许
  look_at: {
    name: 'look_at',
    permission: 'auto'
  },
  // 浏览器工具 - 需要确认
  browser_navigate: {
    name: 'browser_navigate',
    permission: 'confirm',
    confirmReason: 'This tool will navigate to web pages'
  },
  browser_click: {
    name: 'browser_click',
    permission: 'confirm',
    confirmReason: 'This tool will click elements on web pages'
  },
  browser_fill: {
    name: 'browser_fill',
    permission: 'confirm',
    confirmReason: 'This tool will fill form fields on web pages'
  },
  browser_snapshot: {
    name: 'browser_snapshot',
    permission: 'auto'
  },
  browser_screenshot: {
    name: 'browser_screenshot',
    permission: 'auto'
  },
  browser_extract: {
    name: 'browser_extract',
    permission: 'auto'
  },
  // LSP 工具 - 自动允许
  lsp_diagnostics: {
    name: 'lsp_diagnostics',
    permission: 'auto'
  },
  lsp_goto_definition: {
    name: 'lsp_goto_definition',
    permission: 'auto'
  },
  lsp_find_references: {
    name: 'lsp_find_references',
    permission: 'auto'
  },
  lsp_symbols: {
    name: 'lsp_symbols',
    permission: 'auto'
  }
}

/**
 * 权限策略管理器
 */
export class PermissionPolicy {
  private allowList: Set<string> = new Set()
  private denyList: Set<string> = new Set()
  private customPermissions: Map<string, ToolPermissionConfig> = new Map()

  /**
   * 允许工具执行
   */
  allow(toolName: string): void {
    this.allowList.add(toolName)
    this.denyList.delete(toolName)
  }

  /**
   * 拒绝工具执行
   */
  deny(toolName: string): void {
    this.denyList.add(toolName)
    this.allowList.delete(toolName)
  }

  /**
   * 设置工具权限配置
   */
  setPermission(config: ToolPermissionConfig): void {
    this.customPermissions.set(config.name, config)
  }

  /**
   * 获取工具权限配置
   */
  getPermission(toolName: string): ToolPermissionConfig {
    // 优先使用自定义配置
    const custom = this.customPermissions.get(toolName)
    if (custom) {
      return custom
    }

    // 使用默认配置
    const defaultConfig = TOOL_PERMISSIONS[toolName]
    if (defaultConfig) {
      return defaultConfig
    }

    // 未知工具默认需要确认
    return {
      name: toolName,
      permission: 'confirm',
      confirmReason: 'Unknown tool - confirmation required'
    }
  }

  /**
   * 检查工具是否被允许执行
   */
  isAllowed(toolName: string): boolean {
    if (this.denyList.has(toolName)) return false
    if (this.allowList.size === 0) return true
    return this.allowList.has(toolName)
  }

  /**
   * 检查工具是否需要确认
   */
  requiresConfirmation(toolName: string): boolean {
    const config = this.getPermission(toolName)
    return config.permission === 'confirm'
  }

  /**
   * 检查工具是否为危险操作
   */
  isDangerous(toolName: string): boolean {
    const config = this.getPermission(toolName)
    return config.dangerous ?? false
  }

  /**
   * 获取所有工具权限配置
   */
  getAllPermissions(): ToolPermissionConfig[] {
    const all = new Map<string, ToolPermissionConfig>()

    // 添加默认配置
    for (const [name, config] of Object.entries(TOOL_PERMISSIONS)) {
      all.set(name, config)
    }

    // 覆盖自定义配置
    for (const [name, config] of this.customPermissions) {
      all.set(name, config)
    }

    return Array.from(all.values())
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.allowList.clear()
    this.denyList.clear()
    this.customPermissions.clear()
  }
}

export const defaultPolicy = new PermissionPolicy()

/**
 * 获取工具的安全等级描述
 */
export function getToolSafetyLevel(toolName: string): 'safe' | 'moderate' | 'dangerous' {
  const config = defaultPolicy.getPermission(toolName)

  if (config.dangerous) {
    return 'dangerous'
  }

  if (config.permission === 'confirm') {
    return 'moderate'
  }

  return 'safe'
}

/**
 * 按安全等级分组工具
 */
export function groupToolsBySafety(toolNames: string[]): {
  safe: string[]
  moderate: string[]
  dangerous: string[]
} {
  const result = {
    safe: [] as string[],
    moderate: [] as string[],
    dangerous: [] as string[]
  }

  for (const name of toolNames) {
    const level = getToolSafetyLevel(name)
    result[level].push(name)
  }

  return result
}

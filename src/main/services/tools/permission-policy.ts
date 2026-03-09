/**
 * 工具权限策略
 *
 * 定义工具的执行权限和安全级别
 */

import { logger } from '@/shared/logger'
import { DatabaseService } from '../database'
import { SETTING_KEYS } from '../settings/schema-registry'
import { toolRegistry } from './tool-registry'

export type ToolPermissionLevel = 'auto' | 'confirm' | 'deny'
export type PermissionTemplate = 'safe' | 'balanced' | 'full'
export type PermissionConfigSource = 'default' | 'template' | 'custom' | 'fallback'

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

export interface ToolExecutionPermissionPreview {
  requestedName: string
  resolvedName: string
  template: PermissionTemplate
  permission: ToolPermissionLevel
  source: PermissionConfigSource
  dangerous: boolean
  highRisk: boolean
  highRiskEnforced: boolean
  requiresConfirmation: boolean
  allowedByPolicy: boolean
  allowedWithoutConfirmation: boolean
  reason?: string
  confirmReason?: string
}

export const PERMISSION_TEMPLATES = {
  SAFE: 'safe',
  BALANCED: 'balanced',
  FULL: 'full'
} as const

const AUTO_APPROVE_TOOL_CONFIRMATIONS = true
const HIGH_RISK_CONFIRMATION_REASON = 'High-risk tool requires manual confirmation'

const HIGH_RISK_TOOLS = new Set<string>(['bash', 'file_write'])

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
    dangerous: true
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

const TEMPLATE_PERMISSION_OVERRIDES: Record<PermissionTemplate, Record<string, ToolPermissionConfig>> = {
  safe: {
    file_write: {
      name: 'file_write',
      permission: 'deny',
      confirmReason: 'Safe template denies write operations',
      dangerous: true
    },
    bash: {
      name: 'bash',
      permission: 'deny',
      confirmReason: 'Safe template denies shell execution',
      dangerous: true
    },
    browser_navigate: {
      name: 'browser_navigate',
      permission: 'deny',
      confirmReason: 'Safe template denies active browser interaction'
    },
    browser_click: {
      name: 'browser_click',
      permission: 'deny',
      confirmReason: 'Safe template denies active browser interaction'
    },
    browser_fill: {
      name: 'browser_fill',
      permission: 'deny',
      confirmReason: 'Safe template denies active browser interaction'
    },
    webfetch: {
      name: 'webfetch',
      permission: 'confirm',
      confirmReason: 'Safe template requires confirmation for remote fetch'
    }
  },
  balanced: {},
  full: {
    browser_navigate: {
      name: 'browser_navigate',
      permission: 'auto'
    },
    browser_click: {
      name: 'browser_click',
      permission: 'auto'
    },
    browser_fill: {
      name: 'browser_fill',
      permission: 'auto'
    }
  }
}

function cloneConfig(config: ToolPermissionConfig): ToolPermissionConfig {
  return {
    ...config
  }
}

function isPermissionTemplate(value: unknown): value is PermissionTemplate {
  return value === 'safe' || value === 'balanced' || value === 'full'
}

export function parsePermissionTemplate(value: unknown): PermissionTemplate | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return isPermissionTemplate(normalized) ? normalized : null
}

/**
 * 权限策略管理器
 */
export class PermissionPolicy {
  private allowList: Set<string> = new Set()
  private denyList: Set<string> = new Set()
  private customPermissions: Map<string, ToolPermissionConfig> = new Map()
  private activeTemplate: PermissionTemplate = 'balanced'

  private normalizeToolName(toolName: string): string {
    return toolRegistry.resolveName(toolName.trim())
  }

  private isHighRiskTool(toolName: string): boolean {
    return HIGH_RISK_TOOLS.has(toolName)
  }

  private resolvePermission(toolName: string): {
    config: ToolPermissionConfig
    source: PermissionConfigSource
    highRiskEnforced: boolean
  } {
    const normalizedName = this.normalizeToolName(toolName)

    let source: PermissionConfigSource = 'fallback'
    let selected: ToolPermissionConfig = {
      name: normalizedName,
      permission: 'confirm',
      confirmReason: 'Unknown tool - confirmation required'
    }

    const defaultConfig = TOOL_PERMISSIONS[normalizedName]
    if (defaultConfig) {
      selected = cloneConfig(defaultConfig)
      source = 'default'
    }

    const templateOverride = TEMPLATE_PERMISSION_OVERRIDES[this.activeTemplate][normalizedName]
    if (templateOverride) {
      selected = {
        ...selected,
        ...cloneConfig(templateOverride),
        name: normalizedName
      }
      source = 'template'
    }

    const customConfig = this.customPermissions.get(normalizedName)
    if (customConfig) {
      selected = {
        ...selected,
        ...cloneConfig(customConfig),
        name: normalizedName
      }
      source = 'custom'
    }

    const highRiskEnforced =
      !AUTO_APPROVE_TOOL_CONFIRMATIONS &&
      this.isHighRiskTool(normalizedName) &&
      selected.permission === 'auto'
    if (highRiskEnforced) {
      selected = {
        ...selected,
        name: normalizedName,
        permission: 'confirm',
        confirmReason: selected.confirmReason ?? HIGH_RISK_CONFIRMATION_REASON,
        dangerous: true
      }
    }

    return {
      config: selected,
      source,
      highRiskEnforced
    }
  }

  private computeAllowDecision(
    normalizedName: string,
    permission: ToolPermissionLevel
  ): { allowed: boolean; reason?: string } {
    if (permission === 'deny') {
      return {
        allowed: false,
        reason: 'Permission template or custom policy denies this tool'
      }
    }

    if (this.denyList.has(normalizedName)) {
      return {
        allowed: false,
        reason: 'Tool is blocked by deny list'
      }
    }

    if (this.allowList.size > 0 && !this.allowList.has(normalizedName)) {
      return {
        allowed: false,
        reason: 'Tool is not in allow list'
      }
    }

    return {
      allowed: true
    }
  }

  /**
   * 允许工具执行
   */
  allow(toolName: string): void {
    const normalizedName = this.normalizeToolName(toolName)
    this.allowList.add(normalizedName)
    this.denyList.delete(normalizedName)
  }

  /**
   * 拒绝工具执行
   */
  deny(toolName: string): void {
    const normalizedName = this.normalizeToolName(toolName)
    this.denyList.add(normalizedName)
    this.allowList.delete(normalizedName)
  }

  /**
   * 应用权限模板
   */
  applyTemplate(template: PermissionTemplate): void {
    this.activeTemplate = template
  }

  getActiveTemplate(): PermissionTemplate {
    return this.activeTemplate
  }

  /**
   * 设置工具权限配置
   */
  setPermission(config: ToolPermissionConfig): void {
    const normalizedName = this.normalizeToolName(config.name)
    this.customPermissions.set(normalizedName, {
      ...config,
      name: normalizedName
    })
  }

  /**
   * 获取工具权限配置
   */
  getPermission(toolName: string): ToolPermissionConfig {
    return this.resolvePermission(toolName).config
  }

  getExecutionPreview(toolName: string, requestedName = toolName): ToolExecutionPermissionPreview {
    const normalizedName = this.normalizeToolName(toolName)
    const { config, source, highRiskEnforced } = this.resolvePermission(normalizedName)
    const allowDecision = this.computeAllowDecision(normalizedName, config.permission)
    const permission =
      AUTO_APPROVE_TOOL_CONFIRMATIONS && config.permission === 'confirm' ? 'auto' : config.permission
    const requiresConfirmation = permission === 'confirm'

    return {
      requestedName,
      resolvedName: normalizedName,
      template: this.activeTemplate,
      permission,
      source,
      dangerous: config.dangerous ?? false,
      highRisk: this.isHighRiskTool(normalizedName),
      highRiskEnforced,
      requiresConfirmation,
      allowedByPolicy: allowDecision.allowed,
      allowedWithoutConfirmation: allowDecision.allowed && !requiresConfirmation,
      reason: allowDecision.reason,
      confirmReason: requiresConfirmation ? config.confirmReason : undefined
    }
  }

  /**
   * 检查工具是否被允许执行
   */
  isAllowed(toolName: string): boolean {
    const normalizedName = this.normalizeToolName(toolName)
    const config = this.getPermission(normalizedName)
    return this.computeAllowDecision(normalizedName, config.permission).allowed
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
    const allNames = new Set<string>()

    for (const name of Object.keys(TOOL_PERMISSIONS)) {
      allNames.add(name)
    }

    for (const name of Object.keys(TEMPLATE_PERMISSION_OVERRIDES[this.activeTemplate])) {
      allNames.add(name)
    }

    for (const name of this.customPermissions.keys()) {
      allNames.add(name)
    }

    return Array.from(allNames)
      .sort((a, b) => a.localeCompare(b))
      .map(name => this.getPermission(name))
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.allowList.clear()
    this.denyList.clear()
    this.customPermissions.clear()
    this.activeTemplate = 'balanced'
  }
}

export const defaultPolicy = new PermissionPolicy()

export async function initializePermissionTemplateFromSettings(): Promise<void> {
  try {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    const prisma = dbService.getClient()

    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEYS.PERMISSION_TEMPLATE }
    })

    const parsed = parsePermissionTemplate(setting?.value)
    defaultPolicy.applyTemplate(parsed ?? 'balanced')

    logger.info('[PermissionPolicy] Applied permission template from settings', {
      template: defaultPolicy.getActiveTemplate(),
      source: parsed ? 'stored' : 'default',
      autoApproveToolConfirmations: AUTO_APPROVE_TOOL_CONFIRMATIONS
    })
  } catch (error) {
    logger.warn('[PermissionPolicy] Failed to initialize permission template from settings', {
      error: error instanceof Error ? error.message : String(error)
    })
    defaultPolicy.applyTemplate('balanced')
  }
}

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

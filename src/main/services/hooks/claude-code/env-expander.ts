/**
 * 环境变量展开器
 *
 * 支持 Claude Code 风格的环境变量语法:
 * - $VAR - 简单变量引用
 * - ${VAR} - 带花括号的变量引用
 * - ${VAR:-default} - 带默认值的变量引用
 * - $CLAUDE_PROJECT_DIR - 项目根目录
 * - ${CLAUDE_PLUGIN_ROOT} - 插件根目录
 */

export interface EnvExpanderOptions {
  /** 项目根目录 */
  projectDir?: string
  /** 插件根目录 */
  pluginRoot?: string
  /** 自定义环境变量 */
  customEnv?: Record<string, string>
  /** 是否允许未定义的变量保持原样 */
  keepUndefined?: boolean
}

/**
 * 展开字符串中的环境变量
 *
 * @param input 包含环境变量的字符串
 * @param options 展开选项
 * @returns 展开后的字符串
 *
 * @example
 * expandEnvVariables('$HOME/project', { customEnv: { HOME: '/users/test' } })
 * // 返回: '/users/test/project'
 *
 * @example
 * expandEnvVariables('${CLAUDE_PROJECT_DIR}/.claude/hooks', { projectDir: '/my/project' })
 * // 返回: '/my/project/.claude/hooks'
 *
 * @example
 * expandEnvVariables('${PORT:-3000}', { customEnv: {} })
 * // 返回: '3000'
 */
export function expandEnvVariables(input: string, options: EnvExpanderOptions = {}): string {
  const {
    projectDir,
    pluginRoot,
    customEnv = {},
    keepUndefined = false
  } = options

  // 构建完整的环境变量映射
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...customEnv
  }

  // 添加 Claude Code 特殊变量
  if (projectDir) {
    env['CLAUDE_PROJECT_DIR'] = projectDir
  }
  if (pluginRoot) {
    env['CLAUDE_PLUGIN_ROOT'] = pluginRoot
  }

  let result = input

  // 匹配 ${VAR:-default} 或 ${VAR} 格式
  result = result.replace(/\$\{([^}]+)\}/g, (match, content) => {
    // 检查是否有默认值
    const defaultMatch = content.match(/^([^:]+):-(.*)$/)
    if (defaultMatch) {
      const [, varName, defaultValue] = defaultMatch
      const value = env[varName]
      return value !== undefined && value !== '' ? value : defaultValue
    }

    // 简单变量引用
    const value = env[content]
    if (value !== undefined) {
      return value
    }

    return keepUndefined ? match : ''
  })

  // 匹配 $VAR 格式 (不带花括号)
  // 变量名只能包含字母、数字和下划线，且不能以数字开头
  result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, varName) => {
    const value = env[varName]
    if (value !== undefined) {
      return value
    }

    return keepUndefined ? match : ''
  })

  return result
}

/**
 * 展开命令中的环境变量
 * 处理引号内的变量展开
 *
 * @param command 命令字符串
 * @param options 展开选项
 * @returns 展开后的命令
 */
export function expandCommandEnv(command: string, options: EnvExpanderOptions = {}): string {
  return expandEnvVariables(command, options)
}

/**
 * 检查字符串是否包含环境变量引用
 *
 * @param input 输入字符串
 * @returns 是否包含环境变量
 */
export function hasEnvVariables(input: string): boolean {
  return /\$([A-Za-z_][A-Za-z0-9_]*|\{[^}]+\})/.test(input)
}

/**
 * 提取字符串中的所有环境变量名
 *
 * @param input 输入字符串
 * @returns 变量名数组
 */
export function extractEnvVariableNames(input: string): string[] {
  const names: Set<string> = new Set()

  // 匹配 ${VAR} 或 ${VAR:-default} 格式
  const bracedMatches = input.matchAll(/\$\{([^:}]+)(?::-[^}]*)?\}/g)
  for (const match of bracedMatches) {
    names.add(match[1])
  }

  // 匹配 $VAR 格式
  const simpleMatches = input.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)
  for (const match of simpleMatches) {
    // 排除已经被花括号格式捕获的
    if (!input.includes(`\${${match[1]}`)) {
      names.add(match[1])
    }
  }

  return Array.from(names)
}

/**
 * 验证所有必需的环境变量是否存在
 *
 * @param input 输入字符串
 * @param env 可用的环境变量
 * @returns 缺失的变量名数组
 */
export function findMissingEnvVariables(
  input: string,
  env: Record<string, string | undefined> = process.env
): string[] {
  const varNames = extractEnvVariableNames(input)
  const missing: string[] = []

  for (const name of varNames) {
    // 跳过有默认值的变量
    if (input.includes(`\${${name}:-`)) {
      continue
    }

    // 跳过 Claude 特殊变量（由调用者提供）
    if (name === 'CLAUDE_PROJECT_DIR' || name === 'CLAUDE_PLUGIN_ROOT') {
      continue
    }

    if (env[name] === undefined) {
      missing.push(name)
    }
  }

  return missing
}

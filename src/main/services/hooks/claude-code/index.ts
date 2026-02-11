/**
 * Claude Code Hook 兼容层
 *
 * 提供对 Claude Code hook 配置格式的完整支持，
 * 可以加载和执行 .claude/settings.json 中定义的 hooks
 */

// 类型导出
export type {
  ClaudeCodeHookEvent,
  ClaudeCodeHookType,
  CommandHookHandler,
  PromptHookHandler,
  AgentHookHandler,
  ClaudeCodeHookHandler,
  ClaudeCodeMatcherGroup,
  ClaudeCodeHooksConfig,
  CommonHookInput,
  SessionStartInput,
  UserPromptSubmitInput,
  PreToolUseInput,
  PostToolUseInput,
  PostToolUseFailureInput,
  StopInput,
  SessionEndInput,
  ClaudeCodeHookInput,
  CommonHookOutput,
  PreToolUseDecision,
  PostToolUseDecision,
  TopLevelDecision,
  ClaudeCodeHookOutput
} from './types'

export { CLAUDE_TO_CODEALL_EVENT_MAP } from './types'

// 配置加载器
export {
  ClaudeCodeConfigLoader,
  mergeConfigs,
  type ConfigLoaderOptions,
  type LoadedConfig
} from './config-loader'

// 环境变量展开器
export {
  expandEnvVariables,
  expandCommandEnv,
  hasEnvVariables,
  extractEnvVariableNames,
  findMissingEnvVariables,
  type EnvExpanderOptions
} from './env-expander'

// 适配器
export {
  ClaudeCodeAdapter,
  createAdapter,
  type AdapterOptions
} from './adapter'

/**
 * 便捷函数: 加载并适配 Claude Code hooks
 *
 * @param projectDir 项目根目录
 * @param sessionId Session ID
 * @returns 适配后的 HookConfig 数组
 */
export async function loadClaudeCodeHooks(
  projectDir: string,
  sessionId: string
): Promise<import('../types').HookConfig[]> {
  const { ClaudeCodeConfigLoader, mergeConfigs } = await import('./config-loader')
  const { createAdapter } = await import('./adapter')

  const loader = new ClaudeCodeConfigLoader({ projectDir })
  const configs = await loader.loadAllConfigs()

  if (configs.length === 0) {
    return []
  }

  const mergedConfig = mergeConfigs(configs)

  const adapter = createAdapter(mergedConfig, {
    projectDir,
    sessionId,
    workspaceDir: projectDir
  })

  return adapter.getAdaptedHooks()
}

import { getAgentByCode } from '@/shared/agent-definitions'

const AGENT_CODE_ALIASES: Record<string, string> = {
  explore: 'qianliyan',
  oracle: 'baize',
  librarian: 'diting',
  metis: 'chongming',
  momus: 'leigong',
  prometheus: 'fuxi',
  sisyphus: 'haotian',
  atlas: 'kuafu',
  hephaestus: 'luban'
}

const CATEGORY_CODE_ALIASES: Record<string, string> = {
  'visual-engineering': 'zhinv',
  writing: 'cangjie',
  quick: 'tianbing',
  ultrabrain: 'guigu',
  artistry: 'maliang',
  deep: 'guixu',
  'unspecified-low': 'tudi',
  'unspecified-high': 'dayu'
}

const TOOL_ALIAS_MAP: Record<string, string[]> = {
  read: ['file_read'],
  write: ['file_write'],
  edit: ['file_write'],
  list: ['file_list'],
  bash: ['bash'],
  glob: ['glob'],
  grep: ['grep'],
  webfetch: ['webfetch'],
  websearch: ['websearch'],
  look_at: ['look_at'],
  browser_navigate: ['browser_navigate'],
  browser_click: ['browser_click'],
  browser_fill: ['browser_fill'],
  browser_snapshot: ['browser_snapshot'],
  browser_screenshot: ['browser_screenshot'],
  browser_extract: ['browser_extract'],
  lsp_diagnostics: ['lsp_diagnostics'],
  lsp_goto_definition: ['lsp_goto_definition'],
  lsp_find_references: ['lsp_find_references'],
  lsp_symbols: ['lsp_symbols'],
  context7: ['webfetch', 'websearch'],
  github_search: ['websearch']
}

const CATEGORY_TOOL_PROFILES: Record<string, string[]> = {
  zhinv: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'look_at'],
  cangjie: ['read', 'write', 'edit', 'glob', 'grep', 'webfetch'],
  tianbing: ['read', 'write', 'edit', 'glob', 'grep'],
  guigu: ['read', 'write', 'edit', 'bash', 'glob', 'grep'],
  maliang: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'look_at'],
  guixu: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'webfetch'],
  tudi: ['read', 'write', 'edit', 'glob', 'grep'],
  dayu: ['read', 'write', 'edit', 'bash', 'glob', 'grep']
}

type ResolveToolScopeInput = {
  subagentType?: string
  category?: string
  availableTools?: string[]
}

function normalizeToolNames(toolNames: string[], availableToolNames?: Set<string>): string[] {
  return Array.from(
    new Set(
      toolNames
        .flatMap(toolName => TOOL_ALIAS_MAP[toolName] ?? [toolName])
        .map(name => name.trim())
        .filter(name => name.length > 0 && (!availableToolNames || availableToolNames.has(name)))
    )
  )
}

export function resolveAgentRuntimeToolNames(
  agentCode: string,
  availableToolNames?: Set<string>
): string[] | undefined {
  const resolvedAgentCode = AGENT_CODE_ALIASES[agentCode] || agentCode
  const agentDefinition = getAgentByCode(resolvedAgentCode)
  if (!agentDefinition) {
    return undefined
  }

  if (agentDefinition.tools.length === 0) {
    return []
  }

  return normalizeToolNames(agentDefinition.tools, availableToolNames)
}

export function resolveCategoryRuntimeToolNames(
  categoryCode: string,
  availableToolNames?: Set<string>
): string[] | undefined {
  const normalizedCategory = (CATEGORY_CODE_ALIASES[categoryCode] || categoryCode).toLowerCase()
  const profile = CATEGORY_TOOL_PROFILES[normalizedCategory]
  if (!profile) {
    return undefined
  }

  return normalizeToolNames(profile, availableToolNames)
}

export function resolveScopedRuntimeToolNames(
  input: ResolveToolScopeInput,
  availableToolNames?: Set<string>
): string[] | undefined {
  if (Array.isArray(input.availableTools)) {
    return normalizeToolNames(input.availableTools, availableToolNames)
  }

  if (input.subagentType) {
    return resolveAgentRuntimeToolNames(input.subagentType, availableToolNames)
  }

  if (input.category) {
    return resolveCategoryRuntimeToolNames(input.category, availableToolNames)
  }

  return undefined
}

import {
  getAgentByCode,
  listOpenClawCapabilitiesByAgent,
  listOpenClawCapabilitiesByCategory,
  type OpenClawCapabilityId
} from '@/shared/agent-definitions'

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
  github_search: ['websearch'],
  delegate_task: []
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

const CAPABILITY_TOOL_PROFILE: Record<OpenClawCapabilityId, string[]> = {
  'oc.code.search': ['read', 'glob', 'grep'],
  'oc.code.modify': ['write', 'edit'],
  'oc.task.orchestrate': ['delegate_task'],
  'oc.background.observe': ['bash', 'read', 'grep']
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

function resolveCapabilityTools(capabilityIds: OpenClawCapabilityId[]): string[] {
  return Array.from(new Set(capabilityIds.flatMap(id => CAPABILITY_TOOL_PROFILE[id] ?? [])))
}

export function resolveAgentRuntimeToolNames(
  agentCode: string,
  availableToolNames?: Set<string>
): string[] | undefined {
  const agentDefinition = getAgentByCode(agentCode)
  if (!agentDefinition) {
    return undefined
  }

  const capabilityTools = resolveCapabilityTools(
    listOpenClawCapabilitiesByAgent(agentDefinition.code).map(capability => capability.id)
  )

  const mergedToolNames = Array.from(new Set([...agentDefinition.tools, ...capabilityTools]))
  return normalizeToolNames(mergedToolNames, availableToolNames)
}

export function resolveCategoryRuntimeToolNames(
  categoryCode: string,
  availableToolNames?: Set<string>
): string[] | undefined {
  const normalizedCategory = categoryCode.toLowerCase()
  const profile = CATEGORY_TOOL_PROFILES[normalizedCategory]
  const capabilityTools = resolveCapabilityTools(
    listOpenClawCapabilitiesByCategory(normalizedCategory).map(capability => capability.id)
  )

  if (!profile && capabilityTools.length === 0) {
    return undefined
  }

  const mergedProfile = Array.from(new Set([...(capabilityTools.length > 0 ? capabilityTools : []), ...(profile ?? [])]))
  return normalizeToolNames(mergedProfile, availableToolNames)
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

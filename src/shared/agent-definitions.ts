/**
 * Agent 和 Category 定义常量
 * 基于中国神话/历史人物命名体系
 *
 * 多模型驱动：每个 Agent/Category 可配置独立的 LLM 模型和回退链
 * 参考 oh-my-opencode 的多模型编排架构
 */

export type AgentType = 'primary' | 'subagent'
export type AgentRoutingStrategy = 'direct-enhanced' | 'workforce' | 'direct'
export type PrimaryAgentCanonicalRole = 'planning' | 'orchestration' | 'execution'
export type OpenClawCapabilityId =
  | 'oc.code.search'
  | 'oc.code.modify'
  | 'oc.task.orchestrate'
  | 'oc.background.observe'

export interface PrimaryAgentRoleMapping {
  aliases: string[]
  canonicalRole: PrimaryAgentCanonicalRole
}

/**
 * Agent 模式：控制模型选择行为
 * - 'primary': 尊重用户 UI 选择的模型
 * - 'subagent': 忽略 UI 模型选择
 */
export type AgentMode = 'primary' | 'subagent'

export interface AgentDefinition {
  code: string
  name: string // 中文名(拼音)
  chineseName: string // 纯中文名
  type: AgentType
  /** 模型选择模式：primary 尊重 UI 选择，subagent 忽略 UI 模型选择 */
  mode: AgentMode
  description: string
  defaultStrategy: AgentRoutingStrategy
  defaultTemperature: number
  tools: string[]
  primaryRole?: PrimaryAgentRoleMapping
}

export type AgentPresetId = 'planner' | 'coder' | 'reviewer' | 'researcher' | 'debugger'

export interface AgentPresetDefinition {
  id: AgentPresetId
  label: string
  description: string
  mappedAgentCode: string
  recommendedModelKeywords: string[]
}

export interface CategoryDefinition {
  code: string
  name: string // 中文名(拼音)
  chineseName: string // 纯中文名
  description: string
  defaultStrategy: AgentRoutingStrategy
  defaultTemperature: number
}

export interface OpenClawCapabilityDefinition {
  id: OpenClawCapabilityId
  name: string
  requiredTools: string[]
  constraints: string[]
  ownerRoles: PrimaryAgentCanonicalRole[]
  sourceOfTruth: string[]
  status: 'draft' | 'confirmed'
}

/**
 * 主要智能体定义
 */
export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // Primary Agents (主要智能体) — mode: 'primary' 尊重 UI 模型选择
  {
    code: 'fuxi',
    name: '伏羲(FuXi)',
    chineseName: '伏羲',
    type: 'primary',
    mode: 'primary',
    description: '战略规划器，面试模式创建工作计划',
    defaultStrategy: 'workforce',
    defaultTemperature: 0.3,
    tools: ['read', 'write', 'edit', 'bash', 'webfetch', 'look_at'],
    primaryRole: {
      aliases: ['fuxi'],
      canonicalRole: 'planning'
    }
  },
  {
    code: 'haotian',
    name: '昊天(HaoTian)',
    chineseName: '昊天',
    type: 'primary',
    mode: 'primary',
    description: '主编排器，任务分解、并行委派、TODO工作流',
    defaultStrategy: 'workforce',
    defaultTemperature: 0.3,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'delegate_task', 'look_at'],
    primaryRole: {
      aliases: ['haotian'],
      canonicalRole: 'orchestration'
    }
  },
  {
    code: 'kuafu',
    name: '夸父(KuaFu)',
    chineseName: '夸父',
    type: 'primary',
    mode: 'primary',
    description: '工作计划执行器，任务分发与进度跟踪',
    defaultStrategy: 'workforce',
    defaultTemperature: 0.2,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'delegate_task', 'look_at'],
    primaryRole: {
      aliases: ['kuafu'],
      canonicalRole: 'execution'
    }
  },
  {
    code: 'luban',
    name: '鲁班(LuBan)',
    chineseName: '鲁班',
    type: 'primary',
    mode: 'primary',
    description: '自主深度工作者，深入研究后果断行动',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.2,
    tools: [
      'read',
      'write',
      'edit',
      'bash',
      'glob',
      'grep',
      'webfetch',
      'delegate_task',
      'browser_navigate',
      'browser_click',
      'browser_fill',
      'browser_snapshot',
      'browser_screenshot',
      'browser_extract',
      'look_at'
    ]
  },

  // Subagents (辅助智能体) — mode: 'subagent' 使用自身 fallback chain
  {
    code: 'baize',
    name: '白泽(BaiZe)',
    chineseName: '白泽',
    type: 'subagent',
    mode: 'subagent',
    description: '架构决策、代码审查、调试专家（只读咨询）',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.2,
    tools: ['read', 'glob', 'grep']
  },
  {
    code: 'chongming',
    name: '重明(ChongMing)',
    chineseName: '重明',
    type: 'subagent',
    mode: 'subagent',
    description: '预规划分析，识别隐藏意图和歧义',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.3,
    tools: ['read', 'glob', 'grep']
  },
  {
    code: 'leigong',
    name: '雷公(LeiGong)',
    chineseName: '雷公',
    type: 'subagent',
    mode: 'subagent',
    description: '计划审查，验证清晰度和完整性',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.2,
    tools: ['read']
  },
  {
    code: 'diting',
    name: '谛听(DiTing)',
    chineseName: '谛听',
    type: 'subagent',
    mode: 'subagent',
    description: '文档查找、开源实现、多仓库分析',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.3,
    tools: ['webfetch', 'websearch', 'context7', 'github_search']
  },
  {
    code: 'qianliyan',
    name: '千里眼(QianLiYan)',
    chineseName: '千里眼',
    type: 'subagent',
    mode: 'subagent',
    description: '快速代码库探索、上下文搜索',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.2,
    tools: ['read', 'glob', 'grep']
  },
  {
    code: 'multimodal-looker',
    name: '观象(GuanXiang)',
    chineseName: '观象',
    type: 'subagent',
    mode: 'subagent',
    description: '多模态解析器：专注提取图片/PDF/图表信息，返回结构化结论',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.1,
    tools: []
  }
]

export const PRIMARY_AGENTS = AGENT_DEFINITIONS

export const AGENT_PRESET_DEFINITIONS: AgentPresetDefinition[] = [
  {
    id: 'planner',
    label: 'Planner',
    description: '偏规划与方案拆解，适合需求澄清与执行计划制定',
    mappedAgentCode: 'fuxi',
    recommendedModelKeywords: ['claude-opus', 'claude-sonnet', 'gpt-5']
  },
  {
    id: 'coder',
    label: 'Coder',
    description: '偏实现与快速迭代，适合代码生成与功能落地',
    mappedAgentCode: 'luban',
    recommendedModelKeywords: ['claude-sonnet', 'gpt-5', 'deepseek-coder']
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: '偏审查与风险识别，适合代码评审和质量把关',
    mappedAgentCode: 'baize',
    recommendedModelKeywords: ['claude-opus', 'o3', 'gpt-5']
  },
  {
    id: 'researcher',
    label: 'Researcher',
    description: '偏检索与上下文归纳，适合大仓库探索和资料收集',
    mappedAgentCode: 'qianliyan',
    recommendedModelKeywords: ['claude-sonnet', 'gemini', 'deepseek']
  },
  {
    id: 'debugger',
    label: 'Debugger',
    description: '偏问题定位与根因分析，适合故障排查与回归验证',
    mappedAgentCode: 'baize',
    recommendedModelKeywords: ['claude-opus', 'o3', 'gpt-5']
  }
]

const AGENT_PRESET_MAP: Record<AgentPresetId, AgentPresetDefinition> = AGENT_PRESET_DEFINITIONS.reduce(
  (acc, preset) => {
    acc[preset.id] = preset
    return acc
  },
  {} as Record<AgentPresetId, AgentPresetDefinition>
)

export function getAgentPresetById(id: AgentPresetId): AgentPresetDefinition {
  return AGENT_PRESET_MAP[id]
}

export function listAgentPresets(): AgentPresetDefinition[] {
  return AGENT_PRESET_DEFINITIONS.map(preset => ({
    ...preset,
    recommendedModelKeywords: [...preset.recommendedModelKeywords]
  }))
}

export function getAgentPresetMappedDefinition(presetId: AgentPresetId): AgentDefinition {
  const preset = getAgentPresetById(presetId)
  const mapped = getAgentByCode(preset.mappedAgentCode)
  if (!mapped) {
    throw new Error(`Unknown mapped agent code for preset "${presetId}": ${preset.mappedAgentCode}`)
  }
  return mapped
}


/**
 * 任务类别定义
 */
export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    code: 'zhinv',
    name: '织女(ZhiNv)',
    chineseName: '织女',
    description: '前端/UI/UX、设计、样式、动画',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.7
  },
  {
    code: 'cangjie',
    name: '仓颉(CangJie)',
    chineseName: '仓颉',
    description: '文档、技术写作',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.6
  },
  {
    code: 'tianbing',
    name: '天兵(TianBing)',
    chineseName: '天兵',
    description: '琐碎任务，单文件修改',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.3
  },
  {
    code: 'guigu',
    name: '鬼谷(GuiGu)',
    chineseName: '鬼谷',
    description: '复杂推理任务',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.2
  },
  {
    code: 'maliang',
    name: '马良(MaLiang)',
    chineseName: '马良',
    description: '创意任务',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.8
  },
  {
    code: 'guixu',
    name: '归墟(GuiXu)',
    chineseName: '归墟',
    description: '深度任务',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.2
  },
  {
    code: 'tudi',
    name: '土地(TuDi)',
    chineseName: '土地',
    description: '通用低复杂度任务',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.5
  },
  {
    code: 'dayu',
    name: '大禹(DaYu)',
    chineseName: '大禹',
    description: '通用高复杂度任务',
    defaultStrategy: 'direct-enhanced',
    defaultTemperature: 0.3
  }
]

export const CATEGORY_AGENTS = CATEGORY_DEFINITIONS

export const OPENCLAW_CAPABILITIES: OpenClawCapabilityDefinition[] = [
  {
    id: 'oc.code.search',
    name: '代码读检索',
    requiredTools: ['read', 'glob', 'grep'],
    constraints: ['read-only'],
    ownerRoles: ['planning', 'orchestration', 'execution'],
    sourceOfTruth: [
      'src/main/services/delegate/tool-allowlist.ts',
      'src/main/services/workforce/workforce-engine.ts'
    ],
    status: 'confirmed'
  },
  {
    id: 'oc.code.modify',
    name: '代码写修改',
    requiredTools: ['write', 'edit'],
    constraints: ['mutating'],
    ownerRoles: ['orchestration', 'execution'],
    sourceOfTruth: [
      'src/main/services/delegate/tool-allowlist.ts',
      'src/main/services/delegate/delegate-engine.ts'
    ],
    status: 'confirmed'
  },
  {
    id: 'oc.task.orchestrate',
    name: '任务编排委派',
    requiredTools: ['delegate_task'],
    constraints: ['orchestrating'],
    ownerRoles: ['orchestration'],
    sourceOfTruth: [
      'src/main/services/workforce/workforce-engine.ts',
      'src/main/services/delegate/delegate-engine.ts'
    ],
    status: 'confirmed'
  },
  {
    id: 'oc.background.observe',
    name: '后台任务观测',
    requiredTools: ['bash', 'read', 'grep'],
    constraints: ['observability'],
    ownerRoles: ['orchestration', 'execution'],
    sourceOfTruth: [
      'src/main/ipc/handlers/background-task.ts',
      'src/main/services/tools/background/manager.ts'
    ],
    status: 'confirmed'
  }
]

const AGENT_CAPABILITY_MAP: Record<string, OpenClawCapabilityId[]> = {
  fuxi: ['oc.code.search'],
  haotian: ['oc.code.search', 'oc.code.modify', 'oc.task.orchestrate', 'oc.background.observe'],
  kuafu: ['oc.code.search', 'oc.code.modify', 'oc.task.orchestrate', 'oc.background.observe'],
  luban: ['oc.code.search', 'oc.code.modify', 'oc.task.orchestrate', 'oc.background.observe'],
  baize: ['oc.code.search'],
  chongming: ['oc.code.search'],
  leigong: ['oc.code.search'],
  diting: ['oc.code.search'],
  qianliyan: ['oc.code.search'],
  'multimodal-looker': ['oc.code.search']
}

const CATEGORY_CAPABILITY_MAP: Record<string, OpenClawCapabilityId[]> = {
  zhinv: ['oc.code.search', 'oc.code.modify'],
  cangjie: ['oc.code.search', 'oc.code.modify'],
  tianbing: ['oc.code.search', 'oc.code.modify'],
  guigu: ['oc.code.search', 'oc.code.modify'],
  maliang: ['oc.code.search', 'oc.code.modify'],
  guixu: ['oc.code.search', 'oc.code.modify'],
  tudi: ['oc.code.search', 'oc.code.modify'],
  dayu: ['oc.code.search', 'oc.code.modify', 'oc.background.observe']
}

export function getOpenClawCapabilityById(id: OpenClawCapabilityId): OpenClawCapabilityDefinition | undefined {
  return OPENCLAW_CAPABILITIES.find(capability => capability.id === id)
}

export function listOpenClawCapabilitiesByAgent(agentCode: string): OpenClawCapabilityDefinition[] {
  const normalized = agentCode.trim().toLowerCase()
  const capabilityIds = AGENT_CAPABILITY_MAP[normalized] || []
  return capabilityIds
    .map(id => getOpenClawCapabilityById(id))
    .filter((capability): capability is OpenClawCapabilityDefinition => Boolean(capability))
}

export function listOpenClawCapabilitiesByCategory(categoryCode: string): OpenClawCapabilityDefinition[] {
  const normalized = categoryCode.trim().toLowerCase()
  const capabilityIds = CATEGORY_CAPABILITY_MAP[normalized] || []
  return capabilityIds
    .map(id => getOpenClawCapabilityById(id))
    .filter((capability): capability is OpenClawCapabilityDefinition => Boolean(capability))
}

/**
 * 获取所有 Agent 代码
 */
export function getAgentCodes(): string[] {
  return PRIMARY_AGENTS.map(a => a.code)
}

/**
 * 获取所有 Category 代码
 */
export function getCategoryCodes(): string[] {
  return CATEGORY_AGENTS.map(c => c.code)
}

/**
 * 根据代码获取 Agent 定义
 */
export function getAgentByCode(code: string): AgentDefinition | undefined {
  return PRIMARY_AGENTS.find(a => a.code === code)
}

/**
 * 根据代码获取 Category 定义
 */
export function getCategoryByCode(code: string): CategoryDefinition | undefined {
  return CATEGORY_AGENTS.find(c => c.code === code)
}

/**
 * 获取主要智能体列表
 */
export function getPrimaryAgents(): AgentDefinition[] {
  return PRIMARY_AGENTS.filter(a => a.type === 'primary')
}

/**
 * 获取辅助智能体列表
 */
export function getSubagents(): AgentDefinition[] {
  return PRIMARY_AGENTS.filter(a => a.type === 'subagent')
}

export interface PrimaryAgentRolePolicy {
  alias: string
  canonicalAgent: string
  canonicalRole: PrimaryAgentCanonicalRole
}

const PRIMARY_ROLE_ALIAS_MAP: Record<string, PrimaryAgentRolePolicy> = PRIMARY_AGENTS
  .filter(agent => agent.type === 'primary' && agent.primaryRole)
  .reduce((acc, agent) => {
    const role = agent.primaryRole!
    const aliases = Array.from(new Set(role.aliases.map(alias => alias.trim().toLowerCase())))
    for (const alias of aliases) {
      acc[alias] = {
        alias,
        canonicalAgent: agent.code,
        canonicalRole: role.canonicalRole
      }
    }
    return acc
  }, {} as Record<string, PrimaryAgentRolePolicy>)

export function resolvePrimaryAgentRolePolicy(alias: string): PrimaryAgentRolePolicy | null {
  const normalized = alias.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return PRIMARY_ROLE_ALIAS_MAP[normalized] || null
}

export function listPrimaryAgentRoleAliases(): string[] {
  return Object.keys(PRIMARY_ROLE_ALIAS_MAP)
}

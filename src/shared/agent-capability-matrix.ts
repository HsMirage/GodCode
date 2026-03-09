import {
  AGENT_DEFINITIONS,
  CATEGORY_DEFINITIONS,
  getAgentByCode,
  getCategoryByCode,
  listAgentPresets,
  listOpenClawCapabilitiesByAgent,
  listOpenClawCapabilitiesByCategory,
  type AgentDefinition,
  type CategoryDefinition
} from './agent-definitions'

export type CapabilityBoundaryRiskLevel = 'low' | 'medium' | 'high'

export interface CapabilityBoundary {
  code: string
  scope: 'agent' | 'category'
  label: string
  defaultRole: string
  defaultStrategy: string
  allowedTools: string[]
  forbiddenTools: string[]
  suitableTasks: string[]
  unsuitableTasks: string[]
  riskLevel: CapabilityBoundaryRiskLevel
  recommendedModelKeywords: string[]
  capabilityIds: string[]
}

const ALL_TOOL_NAMES = Array.from(
  new Set(
    AGENT_DEFINITIONS.flatMap(agent => agent.tools).concat([
      'read',
      'write',
      'edit',
      'bash',
      'glob',
      'grep',
      'webfetch',
      'websearch',
      'browser_navigate',
      'browser_click',
      'browser_fill',
      'browser_snapshot',
      'browser_screenshot',
      'browser_extract',
      'delegate_task',
      'look_at',
      'context7',
      'github_search'
    ])
  )
)

const AGENT_TASK_FIT: Record<string, { suitable: string[]; unsuitable: string[] }> = {
  fuxi: {
    suitable: ['需求澄清', '任务规划', '实施路线设计'],
    unsuitable: ['大规模直接改码', '高频工具执行']
  },
  haotian: {
    suitable: ['复杂任务编排', '多子任务协调', '进度与风险控制'],
    unsuitable: ['纯只读调研', '无须编排的简单单点修改']
  },
  kuafu: {
    suitable: ['计划执行推进', '多步骤交付跟踪', '长链路任务推进'],
    unsuitable: ['纯架构咨询', '单文件微改']
  },
  luban: {
    suitable: ['代码实现', '修复问题', '浏览器辅助执行'],
    unsuitable: ['高层规划评审', '纯只读审计']
  },
  baize: {
    suitable: ['架构审查', '风险评审', '调试分析'],
    unsuitable: ['直接写代码', '危险工具执行']
  },
  chongming: {
    suitable: ['需求消歧', '前置分析', '任务预审'],
    unsuitable: ['直接落地实现', '批量文件修改']
  },
  leigong: {
    suitable: ['计划评审', '验收口径检查'],
    unsuitable: ['编码实现', '浏览器/终端操作']
  },
  diting: {
    suitable: ['外部资料检索', '开源实现对比', '文档调研'],
    unsuitable: ['本地代码改动', '高风险本地执行']
  },
  qianliyan: {
    suitable: ['仓库探索', '代码检索', '上下文收集'],
    unsuitable: ['直接写代码', '外部网页主动交互']
  },
  'multimodal-looker': {
    suitable: ['图片/PDF/图表解析', '结构化多模态提取'],
    unsuitable: ['代码改动', '终端执行']
  }
}

const CATEGORY_TASK_FIT: Record<string, { suitable: string[]; unsuitable: string[] }> = {
  zhinv: { suitable: ['前端/UI 改动', '样式与交互优化'], unsuitable: ['后端编排', '高风险 shell'] },
  cangjie: { suitable: ['文档编写', '说明补全'], unsuitable: ['复杂系统编排', '浏览器高风险交互'] },
  tianbing: { suitable: ['单文件微改', '小修小补'], unsuitable: ['跨模块重构', '长链路任务'] },
  guigu: { suitable: ['复杂推理', '分析决策'], unsuitable: ['批量危险写入'] },
  maliang: { suitable: ['创意内容', '文案与表达'], unsuitable: ['严格工程验收任务'] },
  guixu: { suitable: ['深度任务', '需要持续推理的实现'], unsuitable: ['低复杂度快修'] },
  tudi: { suitable: ['通用轻量任务'], unsuitable: ['跨模块高复杂度编排'] },
  dayu: { suitable: ['高复杂度实现', '跨模块任务'], unsuitable: ['纯只读分析'] }
}

function deriveRiskLevel(tools: string[]): CapabilityBoundaryRiskLevel {
  if (tools.some(tool => ['bash', 'browser_navigate', 'browser_click', 'browser_fill', 'write', 'edit'].includes(tool))) {
    return 'high'
  }
  if (tools.some(tool => ['webfetch', 'websearch', 'delegate_task'].includes(tool))) {
    return 'medium'
  }
  return 'low'
}

function forbiddenTools(allowedTools: string[]): string[] {
  const allowedSet = new Set(allowedTools)
  return ALL_TOOL_NAMES.filter(tool => !allowedSet.has(tool))
}

function recommendedKeywordsForAgent(code: string): string[] {
  return Array.from(
    new Set(
      listAgentPresets()
        .filter(preset => preset.mappedAgentCode === code)
        .flatMap(preset => preset.recommendedModelKeywords)
    )
  )
}

function createAgentBoundary(agent: AgentDefinition): CapabilityBoundary {
  const fit = AGENT_TASK_FIT[agent.code] || { suitable: ['通用任务'], unsuitable: ['超出角色边界的任务'] }
  return {
    code: agent.code,
    scope: 'agent',
    label: agent.name,
    defaultRole: agent.primaryRole?.canonicalRole || agent.type,
    defaultStrategy: agent.defaultStrategy,
    allowedTools: [...agent.tools],
    forbiddenTools: forbiddenTools(agent.tools),
    suitableTasks: fit.suitable,
    unsuitableTasks: fit.unsuitable,
    riskLevel: deriveRiskLevel(agent.tools),
    recommendedModelKeywords: recommendedKeywordsForAgent(agent.code),
    capabilityIds: listOpenClawCapabilitiesByAgent(agent.code).map(item => item.id)
  }
}

function createCategoryBoundary(category: CategoryDefinition): CapabilityBoundary {
  const fit = CATEGORY_TASK_FIT[category.code] || { suitable: ['通用任务'], unsuitable: ['超出类别边界的任务'] }
  const capabilities = listOpenClawCapabilitiesByCategory(category.code)
  const allowedTools = Array.from(new Set(capabilities.flatMap(item => item.requiredTools)))
  return {
    code: category.code,
    scope: 'category',
    label: category.name,
    defaultRole: category.description,
    defaultStrategy: category.defaultStrategy,
    allowedTools,
    forbiddenTools: forbiddenTools(allowedTools),
    suitableTasks: fit.suitable,
    unsuitableTasks: fit.unsuitable,
    riskLevel: deriveRiskLevel(allowedTools),
    recommendedModelKeywords: [],
    capabilityIds: capabilities.map(item => item.id)
  }
}

export const AGENT_CAPABILITY_BOUNDARIES = AGENT_DEFINITIONS.map(createAgentBoundary)
export const CATEGORY_CAPABILITY_BOUNDARIES = CATEGORY_DEFINITIONS.map(createCategoryBoundary)

export function getAgentCapabilityBoundary(code: string): CapabilityBoundary | undefined {
  const normalized = code.trim().toLowerCase()
  const direct = AGENT_CAPABILITY_BOUNDARIES.find(item => item.code === normalized)
  if (direct) {
    return direct
  }
  const agent = getAgentByCode(normalized)
  return agent ? createAgentBoundary(agent) : undefined
}

export function getCategoryCapabilityBoundary(code: string): CapabilityBoundary | undefined {
  const normalized = code.trim().toLowerCase()
  const direct = CATEGORY_CAPABILITY_BOUNDARIES.find(item => item.code === normalized)
  if (direct) {
    return direct
  }
  const category = getCategoryByCode(normalized)
  return category ? createCategoryBoundary(category) : undefined
}


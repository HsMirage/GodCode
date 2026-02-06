/**
 * Agent 和 Category 定义常量
 * 基于中国神话/历史人物命名体系
 */

export type AgentType = 'primary' | 'subagent'

export interface AgentDefinition {
  code: string
  name: string // 中文名(拼音)
  chineseName: string // 纯中文名
  type: AgentType
  description: string
  defaultModel: string
  defaultTemperature: number
  tools: string[]
}

export interface CategoryDefinition {
  code: string
  name: string // 中文名(拼音)
  chineseName: string // 纯中文名
  description: string
  defaultModel: string
  defaultTemperature: number
}

/**
 * 主要智能体定义
 */
export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // Primary Agents (主要智能体)
  {
    code: 'fuxi',
    name: '伏羲(FuXi)',
    chineseName: '伏羲',
    type: 'primary',
    description: '战略规划器，面试模式创建工作计划',
    defaultModel: 'claude-3-opus-20240229',
    defaultTemperature: 0.3,
    tools: ['read', 'write', 'edit', 'bash', 'webfetch']
  },
  {
    code: 'haotian',
    name: '昊天(HaoTian)',
    chineseName: '昊天',
    type: 'primary',
    description: '主编排器，任务分解、并行委派、TODO工作流',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.3,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'delegate_task']
  },
  {
    code: 'kuafu',
    name: '夸父(KuaFu)',
    chineseName: '夸父',
    type: 'primary',
    description: '工作计划执行器，任务分发与进度跟踪',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.2,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'delegate_task']
  },
  {
    code: 'luban',
    name: '鲁班(LuBan)',
    chineseName: '鲁班',
    type: 'primary',
    description: '自主深度工作者，深入研究后果断行动',
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.2,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'webfetch', 'delegate_task']
  },

  // Subagents (辅助智能体)
  {
    code: 'baize',
    name: '白泽(BaiZe)',
    chineseName: '白泽',
    type: 'subagent',
    description: '架构决策、代码审查、调试专家（只读咨询）',
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.2,
    tools: ['read', 'glob', 'grep']
  },
  {
    code: 'guiguzi',
    name: '鬼谷子(GuiGuZi)',
    chineseName: '鬼谷子',
    type: 'subagent',
    description: '预规划分析，识别隐藏意图和歧义',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.3,
    tools: ['read', 'glob', 'grep']
  },
  {
    code: 'leigong',
    name: '雷公(LeiGong)',
    chineseName: '雷公',
    type: 'subagent',
    description: '计划审查，验证清晰度和完整性',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.2,
    tools: ['read']
  },
  {
    code: 'diting',
    name: '谛听(DiTing)',
    chineseName: '谛听',
    type: 'subagent',
    description: '文档查找、开源实现、多仓库分析',
    defaultModel: 'claude-3-haiku-20240307',
    defaultTemperature: 0.3,
    tools: ['webfetch', 'websearch', 'context7', 'github_search']
  },
  {
    code: 'qianliyan',
    name: '千里眼(QianLiYan)',
    chineseName: '千里眼',
    type: 'subagent',
    description: '快速代码库探索、上下文搜索',
    defaultModel: 'claude-3-haiku-20240307',
    defaultTemperature: 0.2,
    tools: ['read', 'glob', 'grep']
  }
]

/**
 * 任务类别定义
 */
export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    code: 'zhinu',
    name: '织女(ZhiNv)',
    chineseName: '织女',
    description: '前端/UI/UX、设计、样式、动画',
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.7
  },
  {
    code: 'cangjie',
    name: '仓颉(CangJie)',
    chineseName: '仓颉',
    description: '文档、技术写作',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.6
  },
  {
    code: 'tianbing',
    name: '天兵(TianBing)',
    chineseName: '天兵',
    description: '琐碎任务，单文件修改',
    defaultModel: 'claude-3-haiku-20240307',
    defaultTemperature: 0.3
  },
  {
    code: 'guigu',
    name: '鬼谷(GuiGu)',
    chineseName: '鬼谷',
    description: '复杂推理任务',
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.2
  },
  {
    code: 'maliang',
    name: '马良(MaLiang)',
    chineseName: '马良',
    description: '创意任务',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.8
  },
  {
    code: 'guixu',
    name: '归墟(GuiXu)',
    chineseName: '归墟',
    description: '深度任务',
    defaultModel: 'claude-3-opus-20240229',
    defaultTemperature: 0.2
  },
  {
    code: 'tudi',
    name: '土地(TuDi)',
    chineseName: '土地',
    description: '通用低复杂度任务',
    defaultModel: 'claude-3-haiku-20240307',
    defaultTemperature: 0.5
  },
  {
    code: 'dayu',
    name: '大禹(DaYu)',
    chineseName: '大禹',
    description: '通用高复杂度任务',
    defaultModel: 'claude-3-5-sonnet-20240620',
    defaultTemperature: 0.3
  }
]

/**
 * 获取所有 Agent 代码
 */
export function getAgentCodes(): string[] {
  return AGENT_DEFINITIONS.map((a) => a.code)
}

/**
 * 获取所有 Category 代码
 */
export function getCategoryCodes(): string[] {
  return CATEGORY_DEFINITIONS.map((c) => c.code)
}

/**
 * 根据代码获取 Agent 定义
 */
export function getAgentByCode(code: string): AgentDefinition | undefined {
  return AGENT_DEFINITIONS.find((a) => a.code === code)
}

/**
 * 根据代码获取 Category 定义
 */
export function getCategoryByCode(code: string): CategoryDefinition | undefined {
  return CATEGORY_DEFINITIONS.find((c) => c.code === code)
}

/**
 * 获取主要智能体列表
 */
export function getPrimaryAgents(): AgentDefinition[] {
  return AGENT_DEFINITIONS.filter((a) => a.type === 'primary')
}

/**
 * 获取辅助智能体列表
 */
export function getSubagents(): AgentDefinition[] {
  return AGENT_DEFINITIONS.filter((a) => a.type === 'subagent')
}

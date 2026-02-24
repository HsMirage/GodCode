/**
 * Agent 和 Category 定义常量
 * 基于中国神话/历史人物命名体系
 *
 * 多模型驱动：每个 Agent/Category 可配置独立的 LLM 模型和回退链
 * 参考 oh-my-opencode 的多模型编排架构
 */

export type AgentType = 'primary' | 'subagent'
export type AgentRoutingStrategy = 'direct-enhanced' | 'workforce' | 'direct'

/**
 * Agent 模式：控制模型选择行为
 * - 'primary': 尊重用户 UI 选择的模型，UI 未选时使用自身 fallback chain
 * - 'subagent': 始终使用自身 fallback chain，忽略 UI 模型选择
 */
export type AgentMode = 'primary' | 'subagent'

/**
 * 回退模型条目
 * 当主模型不可用时，按顺序尝试 fallback 列表中的模型
 */
export interface FallbackModelEntry {
  model: string
  provider: string
}

export interface AgentDefinition {
  code: string
  name: string // 中文名(拼音)
  chineseName: string // 纯中文名
  type: AgentType
  /** 模型选择模式：primary 尊重 UI 选择，subagent 使用自身 fallback chain */
  mode: AgentMode
  description: string
  defaultStrategy: AgentRoutingStrategy
  defaultModel: string
  /** 按优先级排序的回退模型列表 */
  fallbackModels: FallbackModelEntry[]
  defaultTemperature: number
  tools: string[]
}

export interface CategoryDefinition {
  code: string
  name: string // 中文名(拼音)
  chineseName: string // 纯中文名
  description: string
  defaultStrategy: AgentRoutingStrategy
  defaultModel: string
  /** 按优先级排序的回退模型列表 */
  fallbackModels: FallbackModelEntry[]
  defaultTemperature: number
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
    defaultModel: 'claude-3-opus-20240229',
    fallbackModels: [
      { model: 'claude-3-5-sonnet-20240620', provider: 'anthropic' },
      { model: 'gpt-4o', provider: 'openai' }
    ],
    defaultTemperature: 0.3,
    tools: ['read', 'write', 'edit', 'bash', 'webfetch', 'look_at']
  },
  {
    code: 'haotian',
    name: '昊天(HaoTian)',
    chineseName: '昊天',
    type: 'primary',
    mode: 'primary',
    description: '主编排器，任务分解、并行委派、TODO工作流',
    defaultStrategy: 'workforce',
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' },
      { model: 'gemini-1.5-pro', provider: 'gemini' }
    ],
    defaultTemperature: 0.3,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'delegate_task', 'look_at']
  },
  {
    code: 'kuafu',
    name: '夸父(KuaFu)',
    chineseName: '夸父',
    type: 'primary',
    mode: 'primary',
    description: '工作计划执行器，任务分发与进度跟踪',
    defaultStrategy: 'workforce',
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' }
    ],
    defaultTemperature: 0.2,
    tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'delegate_task', 'look_at']
  },
  {
    code: 'luban',
    name: '鲁班(LuBan)',
    chineseName: '鲁班',
    type: 'primary',
    mode: 'primary',
    description: '自主深度工作者，深入研究后果断行动',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'gpt-4o',
    fallbackModels: [
      { model: 'claude-3-5-sonnet-20240620', provider: 'anthropic' }
    ],
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
    defaultModel: 'gpt-4o',
    fallbackModels: [
      { model: 'claude-3-opus-20240229', provider: 'anthropic' }
    ],
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
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' }
    ],
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
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' }
    ],
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
    defaultModel: 'claude-3-haiku-20240307',
    fallbackModels: [
      { model: 'gemini-1.5-flash', provider: 'gemini' }
    ],
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
    defaultModel: 'claude-3-haiku-20240307',
    fallbackModels: [
      { model: 'gpt-4o-mini', provider: 'openai' }
    ],
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
    defaultModel: 'gemini-1.5-flash',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' }
    ],
    defaultTemperature: 0.1,
    tools: []
  }
]

export const PRIMARY_AGENTS = AGENT_DEFINITIONS

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
    defaultModel: 'gpt-4o',
    fallbackModels: [
      { model: 'claude-3-5-sonnet-20240620', provider: 'anthropic' },
      { model: 'gemini-1.5-pro', provider: 'gemini' }
    ],
    defaultTemperature: 0.7
  },
  {
    code: 'cangjie',
    name: '仓颉(CangJie)',
    chineseName: '仓颉',
    description: '文档、技术写作',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gemini-1.5-flash', provider: 'gemini' }
    ],
    defaultTemperature: 0.6
  },
  {
    code: 'tianbing',
    name: '天兵(TianBing)',
    chineseName: '天兵',
    description: '琐碎任务，单文件修改',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'claude-3-haiku-20240307',
    fallbackModels: [
      { model: 'gpt-4o-mini', provider: 'openai' }
    ],
    defaultTemperature: 0.3
  },
  {
    code: 'guigu',
    name: '鬼谷(GuiGu)',
    chineseName: '鬼谷',
    description: '复杂推理任务',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'gpt-4o',
    fallbackModels: [
      { model: 'claude-3-opus-20240229', provider: 'anthropic' }
    ],
    defaultTemperature: 0.2
  },
  {
    code: 'maliang',
    name: '马良(MaLiang)',
    chineseName: '马良',
    description: '创意任务',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' },
      { model: 'gemini-1.5-pro', provider: 'gemini' }
    ],
    defaultTemperature: 0.8
  },
  {
    code: 'guixu',
    name: '归墟(GuiXu)',
    chineseName: '归墟',
    description: '深度任务',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'claude-3-opus-20240229',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' }
    ],
    defaultTemperature: 0.2
  },
  {
    code: 'tudi',
    name: '土地(TuDi)',
    chineseName: '土地',
    description: '通用低复杂度任务',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'claude-3-haiku-20240307',
    fallbackModels: [
      { model: 'gpt-4o-mini', provider: 'openai' }
    ],
    defaultTemperature: 0.5
  },
  {
    code: 'dayu',
    name: '大禹(DaYu)',
    chineseName: '大禹',
    description: '通用高复杂度任务',
    defaultStrategy: 'direct-enhanced',
    defaultModel: 'claude-3-5-sonnet-20240620',
    fallbackModels: [
      { model: 'gpt-4o', provider: 'openai' },
      { model: 'claude-3-opus-20240229', provider: 'anthropic' }
    ],
    defaultTemperature: 0.3
  }
]

export const CATEGORY_AGENTS = CATEGORY_DEFINITIONS

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

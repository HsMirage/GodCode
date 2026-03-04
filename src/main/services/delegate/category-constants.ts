/**
 * @license
 * Copyright (c) 2024-2026 opencode-ai
 *
 * This file is adapted from oh-my-opencode
 * Original source: https://github.com/opencode-ai/oh-my-opencode
 * License: SUL-1.0
 *
 * This code is used under the Sustainable Use License for internal/non-commercial purposes only.
 *
 * Modified by CodeAll project.
 */

/**
 * 工具分类定义
 */
export type ToolCategory = 'lsp' | 'ast' | 'search' | 'session' | 'command' | 'browser' | 'other'

/**
 * Agent 分类定义（用于 Prompt 分组）
 */
export type AgentCategory = 'exploration' | 'specialist' | 'advisor' | 'utility'

/**
 * 成本分类（用于工具选择表）
 */
export type AgentCost = 'FREE' | 'CHEAP' | 'EXPENSIVE'

/**
 * Agent 模式定义
 * - primary: 主要智能体，响应用户 UI 选择的模型
 * - subagent: 辅助智能体，使用自身回退链
 */
export type AgentMode = 'primary' | 'subagent'

/**
 * 委托触发器接口
 */
export interface DelegationTrigger {
  /** 工作领域 (如 "前端 UI/UX") */
  domain: string
  /** 何时委托 (如 "仅视觉变化...") */
  trigger: string
}

/**
 * Agent Prompt 元数据
 * 用于动态生成主编排 Prompt 各节
 */
export interface AgentPromptMetadata {
  /** 分类用于 Prompt 节分组 */
  category: AgentCategory

  /** 成本分类用于工具选择表 */
  cost: AgentCost

  /** 委托表的领域触发器 */
  triggers: DelegationTrigger[]

  /** 何时使用此 Agent（用于详细节） */
  useWhen?: string[]

  /** 何时不使用此 Agent */
  avoidWhen?: string[]

  /** 可选的专用 Prompt 节（Markdown）- 用于像白泽这样有特殊节的 Agent */
  dedicatedSection?: string

  /** Prompt 中使用的昵称/别名 (如 "白泽" 而不是 "baize") */
  promptAlias?: string

  /** 应出现在阶段 0 的关键触发器 (如 "涉及外部库 → 触发 diting") */
  keyTrigger?: string
}

/**
 * 可用 Agent 接口（用于动态 Prompt 构建）
 */
export interface AvailableAgent {
  name: string
  code: string
  description: string
  metadata: AgentPromptMetadata
}

/**
 * 可用工具接口
 */
export interface AvailableTool {
  name: string
  category: ToolCategory
}

/**
 * 可用技能接口
 */
export interface AvailableSkill {
  name: string
  description: string
  location: 'user' | 'project' | 'plugin'
}

/**
 * 可用任务类别接口
 */
export interface AvailableCategory {
  code: string
  name: string
  chineseName: string
  description: string
  model?: string
}

/**
 * Agent 定义到 Prompt 元数据的默认映射
 */
export const DEFAULT_AGENT_METADATA: Record<string, AgentPromptMetadata> = {
  // 探索型
  qianliyan: {
    category: 'exploration',
    cost: 'FREE',
    promptAlias: '千里眼',
    keyTrigger: '涉及 2+ 模块 → 后台触发 `qianliyan`',
    triggers: [{ domain: '代码探索', trigger: '查找现有代码库结构、模式和风格' }],
    useWhen: ['需要多角度搜索', '不熟悉的模块结构', '跨层模式发现'],
    avoidWhen: ['确切知道要搜索什么', '单一关键词/模式足够', '已知文件位置']
  },
  diting: {
    category: 'exploration',
    cost: 'CHEAP',
    promptAlias: '谛听',
    keyTrigger: '提及外部库/源 → 后台触发 `diting`',
    triggers: [{ domain: '文档查找', trigger: '不熟悉的包/库、外部实现查询' }],
    useWhen: [
      '如何使用 [库]？',
      '[框架特性] 的最佳实践是什么？',
      '为什么 [外部依赖] 这样表现？',
      '查找 [库] 的使用示例',
      '处理不熟悉的 npm/pip/cargo 包'
    ]
  },

  // 顾问型
  baize: {
    category: 'advisor',
    cost: 'EXPENSIVE',
    promptAlias: '白泽',
    triggers: [
      { domain: '架构决策', trigger: '多系统权衡、不熟悉的模式' },
      { domain: '自我审查', trigger: '完成重要实现后' },
      { domain: '困难调试', trigger: '2+ 次修复尝试失败后' }
    ],
    useWhen: [
      '复杂架构设计',
      '完成重要工作后',
      '2+ 次修复尝试失败',
      '不熟悉的代码模式',
      '安全/性能问题',
      '多系统权衡'
    ],
    avoidWhen: [
      '简单文件操作（使用直接工具）',
      '任何修复的第一次尝试（先自己尝试）',
      '可从已读代码回答的问题',
      '琐碎决策（变量名、格式化）',
      '可从现有代码模式推断的事情'
    ]
  },

  // 专家型
  chongming: {
    category: 'specialist',
    cost: 'CHEAP',
    promptAlias: '重明',
    triggers: [{ domain: '预规划分析', trigger: '识别隐藏意图和歧义' }]
  },
  leigong: {
    category: 'specialist',
    cost: 'CHEAP',
    promptAlias: '雷公',
    triggers: [{ domain: '计划审查', trigger: '验证清晰度和完整性' }]
  },
  'multimodal-looker': {
    category: 'utility',
    cost: 'CHEAP',
    promptAlias: '观象',
    triggers: [{ domain: '多模态解析', trigger: '需要分析图片/PDF/图表并提取信息' }]
  },

  // 实用型
  fuxi: {
    category: 'utility',
    cost: 'EXPENSIVE',
    promptAlias: '伏羲',
    keyTrigger: '计划阶段 owner',
    triggers: [
      { domain: '主 Agent 角色治理', trigger: '规划阶段、需求澄清、计划交接' },
      { domain: '角色映射', trigger: '规划角色 ↔ 伏羲' }
    ]
  },
  haotian: {
    category: 'utility',
    cost: 'EXPENSIVE',
    promptAlias: '昊天',
    keyTrigger: '编排阶段 owner',
    triggers: [
      { domain: '主 Agent 角色治理', trigger: 'dispatch/checkpoint/integration/finalize 编排阶段' },
      { domain: '角色映射', trigger: '编排角色 ↔ 昊天' }
    ]
  },
  kuafu: {
    category: 'utility',
    cost: 'EXPENSIVE',
    promptAlias: '夸父',
    keyTrigger: '执行回执 owner',
    triggers: [
      { domain: '主 Agent 角色治理', trigger: '执行阶段、结构化证据回执、异常回传' },
      { domain: '角色映射', trigger: '执行角色 ↔ 夸父' }
    ]
  },
  luban: {
    category: 'utility',
    cost: 'EXPENSIVE',
    promptAlias: '鲁班',
    triggers: []
  }
}

/**
 * 工具分类映射函数
 * 根据工具名称确定其类别
 */
export function categorizeTools(toolNames: string[]): AvailableTool[] {
  return toolNames.map(name => {
    let category: ToolCategory = 'other'

    if (name.startsWith('lsp_')) {
      category = 'lsp'
    } else if (name.startsWith('ast_')) {
      category = 'ast'
    } else if (name === 'grep' || name === 'glob' || name === 'read' || name === 'file_read') {
      category = 'search'
    } else if (name.startsWith('session_')) {
      category = 'session'
    } else if (name === 'slashcommand') {
      category = 'command'
    } else if (name.startsWith('browser_')) {
      category = 'browser'
    }

    return { name, category }
  })
}

/**
 * 截断描述到指定长度
 */
export function truncateDescription(description: string, maxLength: number = 80): string {
  if (description.length <= maxLength) {
    return description
  }
  return description.slice(0, maxLength - 3) + '...'
}

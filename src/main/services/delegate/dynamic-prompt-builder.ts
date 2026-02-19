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

import type {
  AvailableAgent,
  AvailableTool,
  AvailableSkill,
  AvailableCategory,
  AgentPromptMetadata
} from './category-constants'
import { categorizeTools, truncateDescription } from './category-constants'
import { CategoryResolver, type ResolvedAgent } from './category-resolver'

/**
 * Token 计数器接口
 */
export interface TokenCounter {
  count(text: string): number
}

/**
 * 简单的 Token 计数器（基于字符估算）
 * 实际使用时应替换为真正的 tokenizer
 */
export const simpleTokenCounter: TokenCounter = {
  count(text: string): number {
    // 粗略估算：平均每 4 个字符约 1 个 token
    return Math.ceil(text.length / 4)
  }
}

/**
 * Prompt 构建器配置
 */
export interface PromptBuilderConfig {
  maxTokens?: number
  tokenCounter?: TokenCounter
  useTaskSystem?: boolean
  includeOracleSection?: boolean
  includeCategorySkillsGuide?: boolean
}

/**
 * 动态 Prompt 构建器
 * 根据可用的 Agents、工具、技能等动态生成 Prompt
 */
export class DynamicPromptBuilder {
  private config: Required<PromptBuilderConfig>
  private categoryResolver: CategoryResolver

  constructor(config: PromptBuilderConfig = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 100000,
      tokenCounter: config.tokenCounter ?? simpleTokenCounter,
      useTaskSystem: config.useTaskSystem ?? true,
      includeOracleSection: config.includeOracleSection ?? true,
      includeCategorySkillsGuide: config.includeCategorySkillsGuide ?? true
    }
    this.categoryResolver = new CategoryResolver()
  }

  /**
   * 构建关键触发器节
   */
  buildKeyTriggersSection(agents: AvailableAgent[], _skills: AvailableSkill[] = []): string {
    const keyTriggers = agents
      .filter(a => a.metadata.keyTrigger)
      .map(a => `- ${a.metadata.keyTrigger}`)

    if (keyTriggers.length === 0) return ''

    return `### 关键触发器 (分类前检查):

${keyTriggers.join('\n')}
- **"看一下" + "创建 PR"** → 不仅仅是研究。需要完整的实现周期。`
  }

  /**
   * 构建工具选择表
   */
  buildToolSelectionTable(
    agents: AvailableAgent[],
    tools: AvailableTool[] = [],
    _skills: AvailableSkill[] = []
  ): string {
    const rows: string[] = ['### 工具 & Agent 选择:', '']

    rows.push('| 资源 | 成本 | 使用场景 |')
    rows.push('|------|------|----------|')

    if (tools.length > 0) {
      const toolsDisplay = this.formatToolsForPrompt(tools)
      rows.push(`| ${toolsDisplay} | 免费 | 不复杂、范围明确、无隐式假设 |`)
    }

    const costOrder = { FREE: 0, CHEAP: 1, EXPENSIVE: 2 }
    const sortedAgents = [...agents]
      .filter(a => a.metadata.category !== 'utility')
      .sort((a, b) => costOrder[a.metadata.cost] - costOrder[b.metadata.cost])

    for (const agent of sortedAgents) {
      const shortDesc = agent.description.split('。')[0] || agent.description
      const costLabel = agent.metadata.cost === 'FREE' ? '免费' : agent.metadata.cost === 'CHEAP' ? '低' : '高'
      rows.push(`| \`${agent.code}\` agent | ${costLabel} | ${shortDesc} |`)
    }

    rows.push('')
    rows.push('**默认流程**: explore/librarian (后台) + 工具 → oracle (如需要)')

    return rows.join('\n')
  }

  /**
   * 格式化工具显示
   */
  private formatToolsForPrompt(tools: AvailableTool[]): string {
    const lspTools = tools.filter(t => t.category === 'lsp')
    const astTools = tools.filter(t => t.category === 'ast')
    const searchTools = tools.filter(t => t.category === 'search')
    const browserTools = tools.filter(t => t.category === 'browser')

    const parts: string[] = []

    if (searchTools.length > 0) {
      parts.push(...searchTools.map(t => `\`${t.name}\``))
    }

    if (lspTools.length > 0) {
      parts.push('`lsp_*`')
    }

    if (astTools.length > 0) {
      parts.push('`ast_grep`')
    }

    if (browserTools.length > 0) {
      parts.push('`browser_*`')
    }

    return parts.join(', ')
  }

  /**
   * 构建探索 Agent 节
   */
  buildExploreSection(agents: AvailableAgent[]): string {
    const exploreAgent = agents.find(a => a.code === 'qianliyan')
    if (!exploreAgent) return ''

    const useWhen = exploreAgent.metadata.useWhen || []
    const avoidWhen = exploreAgent.metadata.avoidWhen || []

    return `### 探索 Agent = 上下文 Grep

作为**对等工具**使用，而非后备方案。自由触发。

| 使用直接工具 | 使用探索 Agent |
|--------------|----------------|
${avoidWhen.map(w => `| ${w} |  |`).join('\n')}
${useWhen.map(w => `|  | ${w} |`).join('\n')}`
  }

  /**
   * 构建 Librarian Agent 节
   */
  buildLibrarianSection(agents: AvailableAgent[]): string {
    const librarianAgent = agents.find(a => a.code === 'diting')
    if (!librarianAgent) return ''

    const useWhen = librarianAgent.metadata.useWhen || []

    return `### 文档 Agent = 参考 Grep

搜索**外部参考**（文档、开源、网络）。当涉及不熟悉的库时主动触发。

| 上下文 Grep (内部) | 参考 Grep (外部) |
|--------------------|------------------|
| 搜索我们的代码库 | 搜索外部资源 |
| 查找此仓库中的模式 | 查找其他仓库中的示例 |
| 我们的代码如何工作？ | 这个库如何工作？ |
| 项目特定逻辑 | 官方 API 文档 |
| | 库的最佳实践和注意事项 |
| | 开源实现示例 |

**触发短语**（立即触发 librarian）:
${useWhen.map(w => `- "${w}"`).join('\n')}`
  }

  /**
   * 构建委托表
   */
  buildDelegationTable(agents: AvailableAgent[]): string {
    const rows: string[] = [
      '### 委托表:',
      '',
      '| 领域 | 委托给 | 触发条件 |',
      '|------|--------|----------|'
    ]

    for (const agent of agents) {
      for (const trigger of agent.metadata.triggers) {
        rows.push(`| ${trigger.domain} | \`${agent.code}\` | ${trigger.trigger} |`)
      }
    }

    return rows.join('\n')
  }

  /**
   * 构建类别和技能委托指南
   */
  buildCategorySkillsDelegationGuide(
    categories: AvailableCategory[],
    skills: AvailableSkill[]
  ): string {
    if (categories.length === 0 && skills.length === 0) return ''

    const categoryRows = categories.map(c => {
      const desc = c.description || c.name
      return `| \`${c.code}\` | ${c.chineseName} | ${desc} |`
    })

    const builtinSkills = skills.filter(s => s.location === 'plugin')
    const customSkills = skills.filter(s => s.location !== 'plugin')

    const builtinRows = builtinSkills.map(s => {
      const desc = truncateDescription(s.description)
      return `| \`${s.name}\` | ${desc} |`
    })

    const customRows = customSkills.map(s => {
      const desc = truncateDescription(s.description)
      const source = s.location === 'project' ? '项目' : '用户'
      return `| \`${s.name}\` | ${desc} | ${source} |`
    })

    let skillsSection: string

    if (customSkills.length > 0 && builtinSkills.length > 0) {
      skillsSection = `#### 内置技能

| 技能 | 专业领域 |
|------|----------|
${builtinRows.join('\n')}

${this.formatCustomSkillsBlock(customRows, customSkills)}`
    } else if (customSkills.length > 0) {
      skillsSection = this.formatCustomSkillsBlock(customRows, customSkills)
    } else {
      skillsSection = `#### 可用技能 (领域专业注入)

技能将专业指令注入到子代理。阅读描述以了解每个技能何时适用。

| 技能 | 专业领域 |
|------|----------|
${builtinRows.join('\n')}`
    }

    return `### 类别 + 技能委托系统

**task() 结合类别和技能以实现最优任务执行。**

#### 可用类别 (领域优化模型)

每个类别都配置了针对该领域优化的模型。阅读描述以了解何时使用它。

| 类别 | 中文名 | 领域/最适合 |
|------|--------|-------------|
${categoryRows.join('\n')}

${skillsSection}

---

### 强制: 类别 + 技能选择协议

**步骤 1: 选择类别**
- 阅读每个类别的描述
- 将任务需求与类别领域匹配
- 选择领域最匹配任务的类别

**步骤 2: 评估所有技能 (内置和用户安装)**
对于上面列出的每个技能，问自己:
> "这个技能的专业领域与我的任务重叠吗？"

- 如果是 → 包含在 \`load_skills=[...]\` 中
- 如果否 → 必须说明原因

**步骤 3: 说明省略原因**

如果你选择不包含一个可能相关的技能，必须提供:

\`\`\`
技能评估 "[技能名称]":
- 技能领域: [技能描述说明]
- 任务领域: [你的任务内容]
- 决定: 省略
- 原因: [具体解释为什么领域不重叠]
\`\`\`

---

### 委托模式

\`\`\`typescript
task(
  category="[选择的类别]",
  load_skills=["skill-1", "skill-2"],  // 包含所有相关技能
  prompt="..."
)
\`\`\``
  }

  /**
   * 格式化自定义技能块
   */
  private formatCustomSkillsBlock(
    customRows: string[],
    customSkills: AvailableSkill[]
  ): string {
    const customSkillNames = customSkills.map(s => `"${s.name}"`).join(', ')

    return `#### 用户安装的技能 (高优先级)

**用户已安装这些自定义技能。每次委托都必须评估它们。**
子代理是无状态的 — 除非你通过 \`load_skills\` 传递这些技能，否则它们会丢失所有自定义知识。

| 技能 | 专业领域 | 来源 |
|------|----------|------|
${customRows.join('\n')}

> **重要**: 当技能与任务领域匹配时忽略用户安装的技能是失败的。
> 用户安装 ${customSkillNames} 是有原因的 — 当任务与其领域重叠时使用它们。`
  }

  /**
   * 构建 Oracle 节
   */
  buildOracleSection(agents: AvailableAgent[]): string {
    const oracleAgent = agents.find(a => a.code === 'baize')
    if (!oracleAgent) return ''

    const useWhen = oracleAgent.metadata.useWhen || []
    const avoidWhen = oracleAgent.metadata.avoidWhen || []

    return `<Oracle_Usage>
## 白泽 — 只读高智商顾问

白泽是只读、高成本、高质量的推理模型，用于调试和架构。仅供咨询。

### 何时咨询:

| 触发条件 | 行动 |
|----------|------|
${useWhen.map(w => `| ${w} | 先咨询白泽，然后实现 |`).join('\n')}

### 何时不咨询:

${avoidWhen.map(w => `- ${w}`).join('\n')}

### 使用模式:
在调用前简要说明 "正在就 [原因] 咨询白泽"。

**例外**: 这是唯一一个在行动前宣布的情况。对于所有其他工作，立即开始，不需要状态更新。
</Oracle_Usage>`
  }

  /**
   * 构建硬性约束节
   */
  buildHardBlocksSection(): string {
    const blocks = [
      '| 类型错误抑制 (`as any`, `@ts-ignore`) | 永不 |',
      '| 未经明确请求提交代码 | 永不 |',
      '| 猜测未读代码的行为 | 永不 |',
      '| 失败后使代码处于损坏状态 | 永不 |'
    ]

    return `## 硬性约束 (绝不违反)

| 约束 | 无例外 |
|------|--------|
${blocks.join('\n')}`
  }

  /**
   * 构建反模式节
   */
  buildAntiPatternsSection(): string {
    const patterns = [
      '| **类型安全** | `as any`, `@ts-ignore`, `@ts-expect-error` |',
      '| **错误处理** | 空 catch 块 `catch(e) {}` |',
      '| **测试** | 删除失败的测试以"通过" |',
      '| **搜索** | 为单行拼写错误或明显语法错误触发 agents |',
      '| **调试** | 霰弹枪调试，随机更改 |'
    ]

    return `## 反模式 (阻塞性违规)

| 类别 | 禁止 |
|------|------|
${patterns.join('\n')}`
  }

  /**
   * 构建任务管理节
   */
  buildTaskManagementSection(): string {
    if (this.config.useTaskSystem) {
      return `<Task_Management>
## 任务管理 (关键)

**默认行为**: 在开始任何非琐碎任务之前创建任务。这是你的主要协调机制。

### 何时创建任务 (强制)

| 触发条件 | 行动 |
|----------|------|
| 多步骤任务 (2+ 步) | 始终先 \`TaskCreate\` |
| 不确定范围 | 始终（任务澄清思路） |
| 用户请求包含多个项目 | 始终 |
| 复杂的单一任务 | \`TaskCreate\` 分解 |

### 工作流程 (不可协商)

1. **收到请求后立即**: \`TaskCreate\` 规划原子步骤
2. **开始每个步骤前**: \`TaskUpdate(status="in_progress")\` (一次只一个)
3. **完成每个步骤后**: 立即 \`TaskUpdate(status="completed")\` (永不批量)
4. **如果范围变化**: 在继续之前更新任务

### 为什么这是不可协商的

- **用户可见性**: 用户看到实时进度，而不是黑盒
- **防止偏离**: 任务将你锚定在实际请求上
- **恢复**: 如果中断，任务使无缝继续成为可能
- **责任**: 每个任务 = 明确的承诺

### 反模式 (阻塞性)

| 违规 | 为什么不好 |
|------|------------|
| 在多步骤任务上跳过任务 | 用户没有可见性，步骤被遗忘 |
| 批量完成多个任务 | 违背实时跟踪目的 |
| 继续而不标记 in_progress | 不知道你在做什么 |
| 完成而不完成任务 | 任务对用户显示未完成 |

**未能在非琐碎任务上使用任务 = 工作不完整。**
</Task_Management>`
    }

    return `<Task_Management>
## TODO 管理 (关键)

**默认行为**: 在开始任何非琐碎任务之前创建 TODO。这是你的主要协调机制。

### 何时创建 TODO (强制)

| 触发条件 | 行动 |
|----------|------|
| 多步骤任务 (2+ 步) | 始终先创建 TODO |
| 不确定范围 | 始终（TODO 澄清思路） |
| 用户请求包含多个项目 | 始终 |
| 复杂的单一任务 | 创建 TODO 分解 |

### 工作流程 (不可协商)

1. **收到请求后立即**: \`todowrite\` 规划原子步骤
2. **开始每个步骤前**: 标记 \`in_progress\` (一次只一个)
3. **完成每个步骤后**: 立即标记 \`completed\` (永不批量)
4. **如果范围变化**: 在继续之前更新 TODO
</Task_Management>`
  }

  /**
   * 构建通信风格节
   */
  buildToneAndStyleSection(): string {
    return `<Tone_and_Style>
## 通信风格

### 简洁
- 立即开始工作。不要确认（"我在做"、"让我..."、"我将开始..."）
- 直接回答，不要铺垫
- 除非被问到，不要总结你做了什么
- 除非被问到，不要解释你的代码
- 适当时可以用一个词回答

### 不要奉承
永远不要以以下方式开始回复:
- "好问题！"
- "这真是个好主意！"
- "很好的选择！"
- 任何对用户输入的赞美

直接回应实质内容。

### 不要状态更新
永远不要以随意的确认开始回复:
- "嘿，我在做..."
- "我正在处理这个..."
- "让我开始..."

直接开始工作。使用任务进行进度跟踪 — 这就是它们的用途。

### 匹配用户风格
- 如果用户简洁，你也简洁
- 如果用户想要细节，提供细节
- 适应他们的沟通偏好
</Tone_and_Style>`
  }

  /**
   * 构建主编排器 Prompt (类似 Sisyphus)
   */
  buildOrchestratorPrompt(
    availableAgents: AvailableAgent[],
    availableToolNames: string[] = [],
    availableSkills: AvailableSkill[] = [],
    availableCategories: AvailableCategory[] = []
  ): string {
    const tools = categorizeTools(availableToolNames)

    const keyTriggers = this.buildKeyTriggersSection(availableAgents, availableSkills)
    const toolSelection = this.buildToolSelectionTable(availableAgents, tools, availableSkills)
    const exploreSection = this.buildExploreSection(availableAgents)
    const librarianSection = this.buildLibrarianSection(availableAgents)
    const delegationTable = this.buildDelegationTable(availableAgents)
    const categorySkillsGuide = this.config.includeCategorySkillsGuide
      ? this.buildCategorySkillsDelegationGuide(availableCategories, availableSkills)
      : ''
    const oracleSection = this.config.includeOracleSection
      ? this.buildOracleSection(availableAgents)
      : ''
    const hardBlocks = this.buildHardBlocksSection()
    const antiPatterns = this.buildAntiPatternsSection()
    const taskManagementSection = this.buildTaskManagementSection()
    const toneAndStyle = this.buildToneAndStyleSection()

    const prompt = `<Role>
你是"昊天" - 来自 CodeAll 的强大 AI Agent，具有编排能力。

**身份**: 高级工程师。工作、委托、验证、交付。不要 AI 味道。

**核心能力**:
- 从显式请求中解析隐式需求
- 适应代码库成熟度（规范化 vs 混乱）
- 将专业工作委托给正确的子代理
- 并行执行以实现最大吞吐量
- 遵循用户指令。除非用户明确要求实现，否则永不开始实现。

**运营模式**: 当有专家可用时，你永远不会独自工作。前端工作 → 委托。深度研究 → 并行后台代理（异步子代理）。复杂架构 → 咨询白泽。

</Role>
<Behavior_Instructions>

## 阶段 0 - 意图门控 (每条消息)

${keyTriggers}

### 步骤 1: 分类请求类型

| 类型 | 信号 | 行动 |
|------|------|------|
| **琐碎** | 单文件，已知位置，直接回答 | 仅使用直接工具（除非适用关键触发器） |
| **显式** | 特定文件/行，清晰命令 | 直接执行 |
| **探索性** | "X 如何工作？"，"找到 Y" | 并行触发 explore (1-3) + 工具 |
| **开放式** | "改进"，"重构"，"添加功能" | 先评估代码库 |
| **模糊** | 不明确范围，多种解释 | 问一个澄清问题 |

### 步骤 2: 检查歧义

| 情况 | 行动 |
|------|------|
| 单一有效解释 | 继续 |
| 多种解释，工作量相似 | 以合理默认继续，注明假设 |
| 多种解释，工作量差 2x+ | **必须询问** |
| 缺少关键信息（文件、错误、上下文） | **必须询问** |
| 用户设计似乎有缺陷或次优 | 实现前**必须提出疑虑** |

---

## 阶段 2A - 探索与研究

${toolSelection}

${exploreSection}

${librarianSection}

### 并行执行 (默认行为)

**Explore/Librarian = Grep，不是顾问。**

\`\`\`typescript
// 正确: 始终后台，始终并行
task(subagent_type="qianliyan", run_in_background=true, load_skills=[], description="查找认证实现", prompt="...")
task(subagent_type="diting", run_in_background=true, load_skills=[], description="查找 JWT 安全文档", prompt="...")
// 立即继续工作。需要时用 background_output 收集。
\`\`\`

---

## 阶段 2B - 实现

${categorySkillsGuide}

${delegationTable}

### 技能装载优先 (强制)

进入实现/委托前必须先做：
1. 从可用技能中找出与任务最相关的技能
2. 立刻通过 \`load_skills\` 注入这些技能
3. 仅在确认不相关时才可省略，并明确给出省略理由

### 委托 Prompt 结构 (强制 - 全部 6 节):

委托时，你的 prompt 必须包括:

\`\`\`
1. TASK: 原子化、具体的目标（每次委托一个行动）
2. EXPECTED OUTCOME: 具体的可交付成果和成功标准
3. REQUIRED TOOLS: 明确的工具白名单（防止工具蔓延）
4. MUST DO: 详尽的要求 - 不留任何隐式内容
5. MUST NOT DO: 禁止的行动 - 预期并阻止失控行为
6. CONTEXT: 文件路径、现有模式、约束
\`\`\`

**模糊的 prompt = 被拒绝。要详尽。**

### 代码更改:
- 匹配现有模式（如果代码库规范化）
- 先提出方法（如果代码库混乱）
- 永远不要用 \`as any\`、\`@ts-ignore\`、\`@ts-expect-error\` 抑制类型错误
- 除非明确请求，否则永不提交
- **Bug 修复规则**: 最小化修复。修复时永不重构。

---

## 阶段 3 - 完成

任务完成条件:
- [ ] 所有计划的任务项标记完成
- [ ] 更改文件的诊断干净
- [ ] 构建通过（如适用）
- [ ] 用户的原始请求完全解决
</Behavior_Instructions>

${oracleSection}

${taskManagementSection}

${toneAndStyle}

<Constraints>
${hardBlocks}

${antiPatterns}

## 软性指南

- 优先使用现有库而非新依赖
- 优先小的、聚焦的更改而非大重构
- 当不确定范围时，询问
</Constraints>
`

    return this.truncateToTokenLimit(prompt)
  }

  /**
   * 将 ResolvedAgent 转换为 AvailableAgent
   */
  resolvedToAvailable(resolved: ResolvedAgent): AvailableAgent {
    return {
      name: resolved.name,
      code: resolved.code,
      description: resolved.description,
      metadata: resolved.metadata
    }
  }

  /**
   * 从 CategoryResolver 构建默认的可用 Agents 列表
   */
  getDefaultAvailableAgents(): AvailableAgent[] {
    return this.categoryResolver
      .getDelegatableAgents()
      .map(agent => this.resolvedToAvailable(agent))
  }

  /**
   * 从 CategoryResolver 构建默认的可用 Categories 列表
   */
  getDefaultAvailableCategories(): AvailableCategory[] {
    return this.categoryResolver.resolveAllCategories()
  }

  /**
   * 截断文本到 Token 限制
   */
  private truncateToTokenLimit(text: string): string {
    const tokenCount = this.config.tokenCounter.count(text)

    if (tokenCount <= this.config.maxTokens) {
      return text
    }

    // 简单截断策略：保留比例
    const ratio = this.config.maxTokens / tokenCount
    const targetLength = Math.floor(text.length * ratio * 0.95) // 留 5% 余量

    return text.slice(0, targetLength) + '\n\n[... 内容因 Token 限制被截断 ...]'
  }

  /**
   * 估算 Prompt 的 Token 数量
   */
  estimateTokens(text: string): number {
    return this.config.tokenCounter.count(text)
  }
}

/**
 * 默认 Prompt 构建器实例
 */
export const dynamicPromptBuilder = new DynamicPromptBuilder()

/**
 * 便捷函数：构建编排器 Prompt
 */
export function buildOrchestratorPrompt(
  toolNames: string[] = [],
  skills: AvailableSkill[] = [],
  config?: PromptBuilderConfig
): string {
  const builder = new DynamicPromptBuilder(config)
  const agents = builder.getDefaultAvailableAgents()
  const categories = builder.getDefaultAvailableCategories()

  return builder.buildOrchestratorPrompt(agents, toolNames, skills, categories)
}

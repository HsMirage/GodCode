# OMO 3.4.0 整合方案

## 概述

本文档基于 `omo-3.4.0-analysis-report.md` 分析报告，为 CodeAll 项目制定详细的 Oh-My-OpenCode (OMO) 功能整合方案。

**编制日期**: 2026-02-09
**目标版本**: CodeAll v1.0
**参考版本**: Oh-My-OpenCode 3.4.0

---

## 一、整合目标

### 1.1 核心目标

1. **动态 Prompt 构建系统** - 根据可用 Agent/工具/技能动态生成 Prompt
2. **完善任务分类系统** - 8 个分类 + 模型映射 + prompt_append
3. **结构化委托协议** - 6 节结构化 Prompt 模板
4. **Session 连续性** - 使用 session_id 恢复失败任务

### 1.2 当前状态

CodeAll 已完成的基础工作:

| 模块 | 状态 | 说明 |
|------|------|------|
| Agent 定义 | ✅ 完成 | `shared/agent-definitions.ts` - 9 个 Agent |
| Category 定义 | ✅ 完成 | `shared/agent-definitions.ts` - 8 个 Category |
| Agent Prompts | ✅ 完成 | `delegate/prompts/*.ts` - 9 个 Agent 模板 |
| Category Prompts | ✅ 完成 | `delegate/prompts/categories/*.ts` - 8 个分类模板 |
| 别名映射 | ✅ 完成 | OMO 名称 → CodeAll 拼音码 |
| DelegateEngine | 🔄 基础 | 基本委托逻辑，缺少动态 Prompt |
| 动态 Prompt 构建 | ❌ 缺失 | 需要整合 |
| 委托协议 | ❌ 缺失 | 需要整合 |
| Hooks 框架 | ❌ 缺失 | 需要整合 |
| 技能系统 | ❌ 缺失 | 需要整合 |

---

## 二、阶段规划

### 阶段一：P0 - 核心架构 (1-2 周)

#### 2.1.1 动态 Prompt 构建系统

**目标**: 实现根据可用 Agent/工具/技能/分类动态生成 Prompt

**参考文件**:
- `OMO/src/agents/dynamic-agent-prompt-builder.ts` (433 行)
- `OMO/src/agents/sisyphus.ts` (530 行)

**实现步骤**:

1. **创建动态 Prompt 构建器** (`src/main/services/delegate/dynamic-prompt-builder.ts`)

```typescript
// 核心接口定义
export interface AvailableAgent {
  name: string
  description: string
  metadata: AgentPromptMetadata
}

export interface AvailableTool {
  name: string
  category: 'lsp' | 'ast' | 'search' | 'session' | 'command' | 'other'
}

export interface AvailableSkill {
  name: string
  description: string
  location: 'user' | 'project' | 'plugin'
}

export interface AvailableCategory {
  name: string
  description: string
  model?: string
}

// 导出函数
export function buildKeyTriggersSection(agents: AvailableAgent[]): string
export function buildToolSelectionTable(agents: AvailableAgent[], tools: AvailableTool[]): string
export function buildExploreSection(agents: AvailableAgent[]): string
export function buildLibrarianSection(agents: AvailableAgent[]): string
export function buildDelegationTable(agents: AvailableAgent[]): string
export function buildCategorySkillsDelegationGuide(categories: AvailableCategory[], skills: AvailableSkill[]): string
export function buildOracleSection(agents: AvailableAgent[]): string
export function buildHardBlocksSection(): string
export function buildAntiPatternsSection(): string
```

2. **创建 Agent 元数据接口** (`src/main/services/delegate/prompts/types.ts` 扩展)

```typescript
export interface AgentPromptMetadata {
  category: 'exploration' | 'specialist' | 'advisor' | 'utility'
  cost: 'FREE' | 'CHEAP' | 'EXPENSIVE'
  triggers: DelegationTrigger[]
  useWhen?: string[]
  avoidWhen?: string[]
  dedicatedSection?: string
  promptAlias?: string
  keyTrigger?: string
}

export interface DelegationTrigger {
  domain: string
  trigger: string
}
```

3. **实现主编排器 Prompt 生成函数**

```typescript
export function buildDynamicHaotianPrompt(
  availableAgents: AvailableAgent[],
  availableTools: AvailableTool[],
  availableSkills: AvailableSkill[],
  availableCategories: AvailableCategory[],
  useTaskSystem: boolean = false
): string
```

**需要修改/新增的文件**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/services/delegate/dynamic-prompt-builder.ts` | 新增 | 动态 Prompt 构建器 |
| `src/main/services/delegate/prompts/types.ts` | 修改 | 添加元数据接口 |
| `src/main/services/delegate/agents.ts` | 修改 | 添加 Agent 元数据 |
| `src/main/services/delegate/delegate-engine.ts` | 修改 | 集成动态 Prompt |

**工时估算**: 3-4 天

---

#### 2.1.2 完善任务分类系统

**目标**: 为 8 个分类添加完整的 prompt_append 和模型映射

**参考文件**:
- `OMO/src/tools/delegate-task/constants.ts` (566 行)

**当前状态**:
- `categories.ts` 已有基础配置
- `prompts/categories/*.ts` 已有 8 个分类模板

**需要补充的内容**:

1. **扩展 CategoryConfig 接口**:

```typescript
export interface CategoryConfig {
  model: string
  temperature: number
  variant?: 'xhigh' | 'high' | 'medium' | 'low'
  promptTemplate?: CategoryPromptTemplate
  // 新增字段
  callerWarning?: string  // 调用方警告信息
  selectionGate?: string  // 选择门控条件
}
```

2. **补充 Category Prompt Append 内容**:

| 分类 | promptAppend 要点 |
|------|------------------|
| zhinv (visual) | 设计优先、大胆美学、独特排版、高冲击动画 |
| guigu (ultrabrain) | 代码风格匹配、可读性、战略顾问思维 |
| guixu (deep) | 自主执行、深度探索、目标导向 |
| maliang (artistry) | 突破常规、激进探索、创意优先 |
| tianbing (quick) | 快速执行、最小开销、明确结构要求 |
| cangjie (writing) | 清晰流畅、适当语气、结构组织 |
| tudi (unspecified-low) | 选择门控、中等模型警告 |
| dayu (unspecified-high) | 选择门控、高复杂度验证 |

3. **添加调用方警告 (Caller Warning)**:

快速任务 (tianbing/quick) 使用较弱模型，需要在 prompt 中添加警告:

```typescript
export const QUICK_CALLER_WARNING = `
<Caller_Warning>
THIS CATEGORY USES A LESS CAPABLE MODEL.

Your prompt MUST be:
**EXHAUSTIVELY EXPLICIT** - Leave NOTHING to interpretation:
1. MUST DO: List every required action as atomic, numbered steps
2. MUST NOT DO: Explicitly forbid likely mistakes and deviations
3. EXPECTED OUTPUT: Describe exact success criteria with concrete examples

**PROMPT STRUCTURE (MANDATORY):**
TASK: [One-sentence goal]
MUST DO: [Numbered steps]
MUST NOT DO: [Forbidden actions]
EXPECTED OUTPUT: [Deliverables + verification]
</Caller_Warning>
`
```

**需要修改/新增的文件**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/services/delegate/categories.ts` | 修改 | 扩展 CategoryConfig |
| `src/main/services/delegate/prompts/categories/*.ts` | 修改 | 补充完整 promptAppend |
| `src/main/services/delegate/category-constants.ts` | 新增 | 分类描述和警告常量 |

**工时估算**: 2 天

---

#### 2.1.3 结构化委托协议

**目标**: 实现 6 节结构化 Prompt 模板

**委托 Prompt 结构 (强制 6 节)**:

```
1. TASK: 原子化、具体目标 (一个操作一个委托)
2. EXPECTED OUTCOME: 具体交付物 + 成功标准
3. REQUIRED TOOLS: 明确工具白名单 (防止工具蔓延)
4. MUST DO: 详尽要求 - 不留任何隐含内容
5. MUST NOT DO: 禁止行为 - 预防并阻止越权行为
6. CONTEXT: 文件路径、现有模式、约束条件
```

**实现步骤**:

1. **创建委托协议接口**:

```typescript
// src/main/services/delegate/delegation-protocol.ts

export interface DelegationPrompt {
  task: string           // 原子化任务描述
  expectedOutcome: string // 交付物和成功标准
  requiredTools: string[] // 工具白名单
  mustDo: string[]       // 必须执行的操作
  mustNotDo: string[]    // 禁止的操作
  context: {
    filePaths?: string[]
    existingPatterns?: string
    constraints?: string[]
  }
}

export function formatDelegationPrompt(prompt: DelegationPrompt): string {
  return `
1. TASK:
${prompt.task}

2. EXPECTED OUTCOME:
${prompt.expectedOutcome}

3. REQUIRED TOOLS:
${prompt.requiredTools.join(', ')}

4. MUST DO:
${prompt.mustDo.map((item, i) => `${i + 1}. ${item}`).join('\n')}

5. MUST NOT DO:
${prompt.mustNotDo.map(item => `- ${item}`).join('\n')}

6. CONTEXT:
${prompt.context.filePaths ? `Files: ${prompt.context.filePaths.join(', ')}` : ''}
${prompt.context.existingPatterns || ''}
${prompt.context.constraints ? `Constraints: ${prompt.context.constraints.join(', ')}` : ''}
`
}
```

2. **在 DelegateEngine 中集成委托验证**:

```typescript
// 验证委托 prompt 是否符合 6 节结构
export function validateDelegationPrompt(prompt: string): {
  valid: boolean
  missing: string[]
} {
  const sections = ['TASK:', 'EXPECTED OUTCOME:', 'REQUIRED TOOLS:',
                    'MUST DO:', 'MUST NOT DO:', 'CONTEXT:']
  const missing = sections.filter(s => !prompt.includes(s))
  return {
    valid: missing.length === 0,
    missing
  }
}
```

**需要修改/新增的文件**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/services/delegate/delegation-protocol.ts` | 新增 | 委托协议实现 |
| `src/main/services/delegate/delegate-engine.ts` | 修改 | 集成协议验证 |

**工时估算**: 1-2 天

---

#### 2.1.4 Session 连续性

**目标**: 实现 session_id 恢复机制

**参考**: OMO 的 `executeSyncContinuation` 和 `executeBackgroundContinuation`

**实现步骤**:

1. **扩展 DelegateTaskInput**:

```typescript
export interface DelegateTaskInput {
  // ... 现有字段
  session_id?: string     // 用于恢复会话
  run_in_background?: boolean
  load_skills?: string[]
}
```

2. **实现会话恢复逻辑**:

```typescript
async delegateTask(input: DelegateTaskInput): Promise<DelegateTaskResult> {
  // 如果提供了 session_id，尝试恢复会话
  if (input.session_id) {
    return this.continueSession(input)
  }
  // ... 正常流程
}

private async continueSession(input: DelegateTaskInput): Promise<DelegateTaskResult> {
  const previousTask = await this.prisma.task.findFirst({
    where: { sessionId: input.session_id }
  })

  if (!previousTask) {
    throw new Error(`Session not found: ${input.session_id}`)
  }

  // 恢复上下文，继续执行
  // ...
}
```

**需要修改/新增的文件**:

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/services/delegate/delegate-engine.ts` | 修改 | 添加会话恢复 |
| `prisma/schema.prisma` | 可能修改 | 会话元数据字段 |

**工时估算**: 2 天

---

### 阶段二：P1 - 增强功能 (1 周)

#### 2.2.1 LSP 工具集成

**目标**: 集成语言服务器协议工具

**参考文件**:
- `OMO/src/tools/lsp/` (803 行)

**需要实现的工具**:

| 工具 | 功能 | 优先级 |
|------|------|--------|
| lsp_diagnostics | 诊断信息 | 高 |
| lsp_find_references | 查找引用 | 高 |
| lsp_goto_definition | 跳转定义 | 中 |
| lsp_symbols | 符号搜索 | 中 |
| lsp_rename | 重命名 | 低 |

**实现步骤**:

1. 创建 LSP 客户端服务
2. 实现各 LSP 工具
3. 注册到工具注册表

**需要新增的文件**:

| 文件 | 说明 |
|------|------|
| `src/main/services/tools/lsp/client.ts` | LSP 客户端 |
| `src/main/services/tools/lsp/diagnostics.ts` | 诊断工具 |
| `src/main/services/tools/lsp/references.ts` | 引用查找 |
| `src/main/services/tools/lsp/definition.ts` | 定义跳转 |
| `src/main/services/tools/lsp/symbols.ts` | 符号搜索 |
| `src/main/services/tools/lsp/index.ts` | 统一导出 |

**工时估算**: 3-4 天

---

#### 2.2.2 任务委托增强

**目标**: 增强委托系统的分类配置和验证

**实现内容**:

1. **分类配置系统**:

```typescript
// src/main/services/delegate/category-resolver.ts

export interface ResolvedCategory {
  code: string
  model: string
  variant?: string
  temperature: number
  promptAppend: string
  callerWarning?: string
}

export function resolveCategoryConfig(
  categoryCode: string,
  userOverrides?: Partial<CategoryConfig>
): ResolvedCategory
```

2. **委托结果验证**:

```typescript
export interface DelegationVerification {
  expectedOutcomesMet: boolean
  mustDoCompleted: string[]
  mustNotDoViolated: string[]
  followedCodebasePatterns: boolean
}

export function verifyDelegationResult(
  result: string,
  originalPrompt: DelegationPrompt
): DelegationVerification
```

**工时估算**: 2 天

---

### 阶段三：Hooks 框架 (1 周)

#### 2.3.1 Hooks 基础框架

**目标**: 实现生命周期钩子系统

**Hook 事件类型**:

| 事件 | 时机 | 可阻断 | 用例 |
|------|------|--------|------|
| UserPromptSubmit | chat.message | 是 | 关键词检测、斜杠命令 |
| PreToolUse | tool.execute.before | 是 | 验证/修改输入、注入上下文 |
| PostToolUse | tool.execute.after | 否 | 截断输出、错误恢复 |
| Stop | session.stop | 否 | 自动继续、通知 |
| OnSummarize | Compaction | 否 | 保留状态、注入摘要 |

**实现步骤**:

1. **创建 Hook 接口**:

```typescript
// src/main/services/hooks/types.ts

export type HookEvent =
  | 'user-prompt-submit'
  | 'pre-tool-use'
  | 'post-tool-use'
  | 'stop'
  | 'on-summarize'

export interface HookContext<T = unknown> {
  event: HookEvent
  sessionId: string
  data: T
  metadata?: Record<string, unknown>
}

export interface HookResult<T = unknown> {
  blocked?: boolean
  blockReason?: string
  modifiedData?: T
  injectedContext?: string
}

export interface Hook<T = unknown> {
  name: string
  event: HookEvent
  priority?: number
  handler: (ctx: HookContext<T>) => Promise<HookResult<T>>
}
```

2. **创建 Hook 管理器**:

```typescript
// src/main/services/hooks/manager.ts

export class HookManager {
  private hooks: Map<HookEvent, Hook[]> = new Map()

  register(hook: Hook): void
  unregister(hookName: string): void

  async trigger<T>(
    event: HookEvent,
    context: HookContext<T>
  ): Promise<HookResult<T>>
}
```

3. **实现关键 Hooks**:

| Hook | 功能 | 优先级 |
|------|------|--------|
| context-window-monitor | 监控上下文窗口使用 | 高 |
| edit-error-recovery | 编辑错误恢复 | 高 |
| tool-output-truncator | 工具输出截断 | 中 |
| thinking-block-validator | 验证思考块有效性 | 中 |

**需要新增的文件**:

| 文件 | 说明 |
|------|------|
| `src/main/services/hooks/types.ts` | Hook 类型定义 |
| `src/main/services/hooks/manager.ts` | Hook 管理器 |
| `src/main/services/hooks/context-window-monitor.ts` | 上下文监控 |
| `src/main/services/hooks/edit-error-recovery.ts` | 编辑恢复 |
| `src/main/services/hooks/tool-output-truncator.ts` | 输出截断 |
| `src/main/services/hooks/index.ts` | 统一导出 |

**工时估算**: 3-4 天

---

#### 2.3.2 Claude Code 兼容层

**目标**: 支持 Claude Code settings.json 配置格式

**参考文件**:
- `OMO/src/hooks/claude-code-hooks/`

**实现内容**:

1. 配置加载器 - 解析 settings.json
2. Hook 适配器 - 转换 Claude Code Hook 格式
3. 环境变量扩展 - 支持 `${VAR}` 语法

**需要新增的文件**:

| 文件 | 说明 |
|------|------|
| `src/main/services/hooks/claude-code/config-loader.ts` | 配置加载 |
| `src/main/services/hooks/claude-code/adapter.ts` | Hook 适配 |
| `src/main/services/hooks/claude-code/env-expander.ts` | 环境变量 |

**工时估算**: 2-3 天

---

### 阶段四：高级功能 (2 周)

#### 2.4.1 技能系统

**目标**: 实现可插拔的专业知识注入系统

**参考文件**:
- `OMO/src/features/builtin-skills/`

**可用技能**:

| 技能 | 功能 | 优先级 |
|------|------|--------|
| git-master | Git 操作专家 | 高 |
| frontend-ui-ux | 前端 UI/UX 专业知识 | 高 |
| playwright | Playwright 浏览器自动化 | 中 |

**实现步骤**:

1. **创建技能接口**:

```typescript
// src/main/services/skills/types.ts

export interface Skill {
  name: string
  description: string
  location: 'builtin' | 'user' | 'project'
  content: string
  dependencies?: string[]
}

export interface SkillLoader {
  discover(): Promise<Skill[]>
  load(skillNames: string[]): Promise<string>
}
```

2. **实现技能加载器**:

```typescript
// src/main/services/skills/loader.ts

export class SkillLoaderService {
  async discoverSkills(): Promise<Skill[]>
  async loadSkills(names: string[]): Promise<{
    content: string
    notFound: string[]
  }>
}
```

3. **内置技能实现**:

```typescript
// src/main/services/skills/builtin/git-master.ts
export const gitMasterSkill: Skill = {
  name: 'git-master',
  description: 'Git 操作专家知识',
  location: 'builtin',
  content: `...`
}
```

**需要新增的文件**:

| 文件 | 说明 |
|------|------|
| `src/main/services/skills/types.ts` | 技能类型 |
| `src/main/services/skills/loader.ts` | 技能加载器 |
| `src/main/services/skills/builtin/git-master.ts` | Git 技能 |
| `src/main/services/skills/builtin/frontend-ui-ux.ts` | 前端技能 |
| `src/main/services/skills/index.ts` | 统一导出 |

**工时估算**: 4-5 天

---

#### 2.4.2 后台任务管理

**目标**: 实现并发任务执行系统

**参考文件**:
- `OMO/src/features/background-agent/manager.ts` (1642 行)

**实现内容**:

1. **后台任务管理器**:

```typescript
// src/main/services/background/manager.ts

export interface BackgroundTask {
  id: string
  description: string
  agent: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  sessionId: string
  startTime: Date
  endTime?: Date
  result?: string
}

export class BackgroundManager {
  async spawn(config: TaskConfig): Promise<BackgroundTask>
  async resume(sessionId: string, prompt: string): Promise<BackgroundTask>
  async cancel(taskId: string): Promise<void>
  async cancelAll(): Promise<void>
  async getOutput(taskId: string): Promise<string>
  getRunningTasks(): BackgroundTask[]
}
```

2. **并发控制**:

```typescript
// src/main/services/background/concurrency.ts

export class ConcurrencyController {
  private maxConcurrent: number = 5
  private running: Set<string> = new Set()

  async acquire(taskId: string): Promise<boolean>
  release(taskId: string): void
  canSpawn(): boolean
}
```

3. **工具实现**:

| 工具 | 功能 |
|------|------|
| background_output | 获取后台任务输出 |
| background_cancel | 取消后台任务 |

**需要新增的文件**:

| 文件 | 说明 |
|------|------|
| `src/main/services/background/types.ts` | 类型定义 |
| `src/main/services/background/manager.ts` | 任务管理器 |
| `src/main/services/background/concurrency.ts` | 并发控制 |
| `src/main/services/background/spawner.ts` | 任务生成 |
| `src/main/services/tools/background-output.ts` | 输出工具 |
| `src/main/services/tools/background-cancel.ts` | 取消工具 |

**工时估算**: 5-6 天

---

## 三、代码示例

### 3.1 动态 Prompt 构建器示例

```typescript
// src/main/services/delegate/dynamic-prompt-builder.ts

import { AGENT_DEFINITIONS, CATEGORY_DEFINITIONS } from '@/shared/agent-definitions'

export function categorizeTools(toolNames: string[]): AvailableTool[] {
  return toolNames.map((name) => {
    let category: AvailableTool['category'] = 'other'
    if (name.startsWith('lsp_')) category = 'lsp'
    else if (name.startsWith('ast_grep')) category = 'ast'
    else if (name === 'grep' || name === 'glob') category = 'search'
    else if (name.startsWith('session_')) category = 'session'
    else if (name === 'slashcommand') category = 'command'
    return { name, category }
  })
}

export function buildToolSelectionTable(
  agents: AvailableAgent[],
  tools: AvailableTool[]
): string {
  const rows: string[] = [
    '### 工具和 Agent 选择:',
    '',
    '| 资源 | 成本 | 使用时机 |',
    '|------|------|----------|',
  ]

  // 添加工具行
  if (tools.length > 0) {
    const toolsDisplay = formatToolsForPrompt(tools)
    rows.push(`| ${toolsDisplay} | 免费 | 非复杂、范围明确、无隐含假设 |`)
  }

  // 添加 Agent 行
  const sortedAgents = [...agents]
    .filter(a => a.metadata.category !== 'utility')
    .sort((a, b) => {
      const costOrder = { FREE: 0, CHEAP: 1, EXPENSIVE: 2 }
      return costOrder[a.metadata.cost] - costOrder[b.metadata.cost]
    })

  for (const agent of sortedAgents) {
    const shortDesc = agent.description.split('.')[0] || agent.description
    rows.push(`| \`${agent.name}\` agent | ${agent.metadata.cost} | ${shortDesc} |`)
  }

  return rows.join('\n')
}

export function buildCategorySkillsDelegationGuide(
  categories: AvailableCategory[],
  skills: AvailableSkill[]
): string {
  const categoryRows = categories.map(c => {
    const desc = c.description || c.name
    return `| \`${c.name}\` | ${desc} |`
  })

  return `### 分类 + 技能委托系统

**task() 结合分类和技能实现最优任务执行。**

#### 可用分类 (领域优化模型)

| 分类 | 领域 / 最佳用途 |
|------|-----------------|
${categoryRows.join('\n')}

---

### 必须遵循: 分类 + 技能选择协议

**步骤 1: 选择分类**
- 阅读每个分类的描述
- 将任务需求与分类领域匹配
- 选择最适合任务的分类

**步骤 2: 评估所有技能**
对于上面列出的每个技能，问自己:
> "这个技能的专业领域与我的任务重叠吗?"

- 如果是 → 包含在 \`load_skills=[...]\` 中
- 如果否 → 必须说明原因

---

### 委托模式

\`\`\`typescript
task(
  category="[选定的分类]",
  load_skills=["skill-1", "skill-2"],
  prompt="..."
)
\`\`\``
}
```

### 3.2 委托协议实现示例

```typescript
// src/main/services/delegate/delegation-protocol.ts

export interface DelegationPrompt {
  task: string
  expectedOutcome: string
  requiredTools: string[]
  mustDo: string[]
  mustNotDo: string[]
  context: {
    filePaths?: string[]
    existingPatterns?: string
    constraints?: string[]
  }
}

export function formatDelegationPrompt(prompt: DelegationPrompt): string {
  const sections: string[] = []

  // 1. TASK
  sections.push(`1. TASK:
${prompt.task}`)

  // 2. EXPECTED OUTCOME
  sections.push(`2. EXPECTED OUTCOME:
${prompt.expectedOutcome}`)

  // 3. REQUIRED TOOLS
  sections.push(`3. REQUIRED TOOLS:
${prompt.requiredTools.join(', ') || '无特定要求'}`)

  // 4. MUST DO
  sections.push(`4. MUST DO:
${prompt.mustDo.map((item, i) => `   ${i + 1}. ${item}`).join('\n')}`)

  // 5. MUST NOT DO
  sections.push(`5. MUST NOT DO:
${prompt.mustNotDo.map(item => `   - ${item}`).join('\n')}`)

  // 6. CONTEXT
  const contextParts: string[] = []
  if (prompt.context.filePaths?.length) {
    contextParts.push(`   文件: ${prompt.context.filePaths.join(', ')}`)
  }
  if (prompt.context.existingPatterns) {
    contextParts.push(`   现有模式: ${prompt.context.existingPatterns}`)
  }
  if (prompt.context.constraints?.length) {
    contextParts.push(`   约束: ${prompt.context.constraints.join(', ')}`)
  }
  sections.push(`6. CONTEXT:
${contextParts.join('\n') || '   无额外上下文'}`)

  return sections.join('\n\n')
}

export function validateDelegationPrompt(promptText: string): {
  valid: boolean
  missing: string[]
  warnings: string[]
} {
  const requiredSections = [
    { marker: '1. TASK:', name: 'TASK' },
    { marker: '2. EXPECTED OUTCOME:', name: 'EXPECTED OUTCOME' },
    { marker: '3. REQUIRED TOOLS:', name: 'REQUIRED TOOLS' },
    { marker: '4. MUST DO:', name: 'MUST DO' },
    { marker: '5. MUST NOT DO:', name: 'MUST NOT DO' },
    { marker: '6. CONTEXT:', name: 'CONTEXT' },
  ]

  const missing = requiredSections
    .filter(s => !promptText.includes(s.marker))
    .map(s => s.name)

  const warnings: string[] = []

  // 检查是否过于模糊
  if (promptText.length < 200) {
    warnings.push('Prompt 可能过于简短，考虑添加更多细节')
  }

  // 检查 MUST DO 是否为空
  if (promptText.includes('4. MUST DO:') &&
      !promptText.match(/4\. MUST DO:\s*\n\s*\d+\./)) {
    warnings.push('MUST DO 部分似乎为空')
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings
  }
}
```

### 3.3 Hook 管理器示例

```typescript
// src/main/services/hooks/manager.ts

import { Hook, HookEvent, HookContext, HookResult } from './types'
import { LoggerService } from '@/main/services/logger'

export class HookManager {
  private hooks: Map<HookEvent, Hook[]> = new Map()
  private logger = LoggerService.getInstance().getLogger()

  register(hook: Hook): void {
    const existing = this.hooks.get(hook.event) || []
    existing.push(hook)
    // 按优先级排序 (高优先级先执行)
    existing.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    this.hooks.set(hook.event, existing)

    this.logger.info('Hook registered', {
      name: hook.name,
      event: hook.event,
      priority: hook.priority || 0
    })
  }

  unregister(hookName: string): void {
    for (const [event, hooks] of this.hooks.entries()) {
      const filtered = hooks.filter(h => h.name !== hookName)
      if (filtered.length !== hooks.length) {
        this.hooks.set(event, filtered)
        this.logger.info('Hook unregistered', { name: hookName, event })
      }
    }
  }

  async trigger<T>(
    event: HookEvent,
    context: HookContext<T>
  ): Promise<HookResult<T>> {
    const hooks = this.hooks.get(event) || []

    if (hooks.length === 0) {
      return { blocked: false }
    }

    let currentData = context.data
    let injectedContext = ''

    for (const hook of hooks) {
      try {
        const result = await hook.handler({
          ...context,
          data: currentData
        })

        // 如果 hook 阻断了执行
        if (result.blocked) {
          this.logger.info('Hook blocked execution', {
            hook: hook.name,
            event,
            reason: result.blockReason
          })
          return result
        }

        // 合并修改后的数据
        if (result.modifiedData !== undefined) {
          currentData = result.modifiedData
        }

        // 累积注入的上下文
        if (result.injectedContext) {
          injectedContext += result.injectedContext + '\n'
        }

      } catch (error) {
        this.logger.error('Hook execution failed', {
          hook: hook.name,
          event,
          error: error instanceof Error ? error.message : String(error)
        })
        // 继续执行其他 hooks
      }
    }

    return {
      blocked: false,
      modifiedData: currentData,
      injectedContext: injectedContext.trim() || undefined
    }
  }

  getRegisteredHooks(): Map<HookEvent, string[]> {
    const result = new Map<HookEvent, string[]>()
    for (const [event, hooks] of this.hooks.entries()) {
      result.set(event, hooks.map(h => h.name))
    }
    return result
  }
}

// 单例
let instance: HookManager | null = null

export function getHookManager(): HookManager {
  if (!instance) {
    instance = new HookManager()
  }
  return instance
}
```

---

## 四、风险评估

### 4.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 动态 Prompt 过长导致 Token 超限 | 高 | 中 | 实现 Token 计数和截断策略 |
| LSP 集成兼容性问题 | 中 | 中 | 优先支持主流语言 (TS/JS) |
| Hook 执行顺序导致冲突 | 中 | 低 | 明确优先级规则，添加冲突检测 |
| 后台任务并发导致资源耗尽 | 高 | 低 | 严格并发限制，资源监控 |

### 4.2 进度风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 阶段一延期影响后续阶段 | 高 | 中 | 动态 Prompt 优先，其他可并行 |
| 测试覆盖不足 | 中 | 中 | 每阶段包含测试任务 |
| 文档滞后 | 低 | 高 | 代码注释优先，文档后补 |

---

## 五、测试策略

### 5.1 单元测试

```typescript
// tests/delegate/dynamic-prompt-builder.test.ts

describe('DynamicPromptBuilder', () => {
  describe('buildToolSelectionTable', () => {
    it('should correctly categorize LSP tools', () => {
      const tools = categorizeTools(['lsp_diagnostics', 'lsp_references'])
      expect(tools.every(t => t.category === 'lsp')).toBe(true)
    })

    it('should sort agents by cost', () => {
      // ...
    })
  })

  describe('buildCategorySkillsDelegationGuide', () => {
    it('should include all categories', () => {
      // ...
    })
  })
})
```

### 5.2 集成测试

```typescript
// tests/delegate/delegate-engine.integration.test.ts

describe('DelegateEngine Integration', () => {
  it('should use dynamic prompt for haotian agent', async () => {
    const engine = new DelegateEngine()
    const result = await engine.delegateTask({
      description: 'Test task',
      prompt: 'Test prompt',
      subagent_type: 'haotian'
    })

    // 验证使用了动态 prompt
    expect(result.success).toBe(true)
  })

  it('should validate delegation protocol', async () => {
    // ...
  })
})
```

### 5.3 E2E 测试

```typescript
// tests/e2e/delegation.e2e.test.ts

test('complete delegation workflow', async () => {
  // 1. 用户发送任务请求
  // 2. 主 Agent (昊天) 分析并委托
  // 3. 子 Agent 执行
  // 4. 验证结果
})
```

---

## 六、工时估算汇总

| 阶段 | 任务 | 工时 |
|------|------|------|
| P0 | 动态 Prompt 构建系统 | 3-4 天 |
| P0 | 完善任务分类系统 | 2 天 |
| P0 | 结构化委托协议 | 1-2 天 |
| P0 | Session 连续性 | 2 天 |
| **P0 小计** | | **8-10 天** |
| P1 | LSP 工具集成 | 3-4 天 |
| P1 | 任务委托增强 | 2 天 |
| **P1 小计** | | **5-6 天** |
| P2 | Hooks 基础框架 | 3-4 天 |
| P2 | Claude Code 兼容层 | 2-3 天 |
| **P2 小计** | | **5-7 天** |
| P3 | 技能系统 | 4-5 天 |
| P3 | 后台任务管理 | 5-6 天 |
| **P3 小计** | | **9-11 天** |
| **总计** | | **27-34 天** |

---

## 七、文件清单

### 7.1 新增文件

```
src/main/services/delegate/
├── dynamic-prompt-builder.ts      # 动态 Prompt 构建器
├── delegation-protocol.ts         # 委托协议
├── category-constants.ts          # 分类常量
└── category-resolver.ts           # 分类解析器

src/main/services/hooks/
├── types.ts                       # Hook 类型定义
├── manager.ts                     # Hook 管理器
├── context-window-monitor.ts      # 上下文监控
├── edit-error-recovery.ts         # 编辑恢复
├── tool-output-truncator.ts       # 输出截断
├── claude-code/
│   ├── config-loader.ts           # 配置加载
│   ├── adapter.ts                 # Hook 适配
│   └── env-expander.ts            # 环境变量
└── index.ts                       # 统一导出

src/main/services/tools/lsp/
├── client.ts                      # LSP 客户端
├── diagnostics.ts                 # 诊断工具
├── references.ts                  # 引用查找
├── definition.ts                  # 定义跳转
├── symbols.ts                     # 符号搜索
└── index.ts                       # 统一导出

src/main/services/skills/
├── types.ts                       # 技能类型
├── loader.ts                      # 技能加载器
├── builtin/
│   ├── git-master.ts              # Git 技能
│   └── frontend-ui-ux.ts          # 前端技能
└── index.ts                       # 统一导出

src/main/services/background/
├── types.ts                       # 类型定义
├── manager.ts                     # 任务管理器
├── concurrency.ts                 # 并发控制
├── spawner.ts                     # 任务生成
└── index.ts                       # 统一导出
```

### 7.2 修改文件

```
src/main/services/delegate/
├── agents.ts                      # 添加 Agent 元数据
├── categories.ts                  # 扩展 CategoryConfig
├── delegate-engine.ts             # 集成动态 Prompt、协议验证、会话恢复
└── prompts/
    ├── types.ts                   # 添加元数据接口
    └── categories/*.ts            # 补充完整 promptAppend

src/main/services/tools/
├── registry.ts                    # 注册新工具
└── index.ts                       # 导出新工具

src/shared/
└── agent-definitions.ts           # 可能添加元数据字段

prisma/
└── schema.prisma                  # 可能添加会话元数据
```

---

## 八、后续迭代

### Phase 2 (未来规划)

1. **Metis 预规划分析** - 执行前识别歧义和风险
2. **Momus 计划审核** - 验证计划可执行性
3. **AST-Grep 工具** - 结构化代码搜索/替换
4. **Context Window Recovery** - 上下文窗口限制自动恢复
5. **内置命令模板** - handoff, refactor 等

---

*文档版本: v1.0*
*最后更新: 2026-02-09*

# Oh-My-OpenCode 3.4.0 版本分析报告

## 概述

本报告详细分析了oh-my-opencode 3.4.0版本的更新内容，为GodCode项目整合有价值的功能提供参考。

**分析日期**: 2026-02-09
**OMO版本**: 3.4.0
**分析范围**: `D:\AiWork\GodCode\参考项目\oh-my-opencode-3.4.0\src\`

---

## 一、项目架构概览

### 1.1 目录结构

```
oh-my-opencode-3.4.0/src/
├── agents/               # AI代理系统 (32文件)
├── hooks/                # 生命周期钩子 (163个)
├── features/             # 核心功能模块
├── tools/                # 工具系统 (113个工具)
├── mcp/                  # MCP服务器集成
├── config/               # 配置管理
├── cli/                  # 命令行界面
└── shared/               # 共享工具
```

### 1.2 技术栈

- **运行时**: Bun
- **SDK**: @opencode-ai/sdk, @opencode-ai/plugin
- **AST处理**: @ast-grep/napi
- **MCP**: @modelcontextprotocol/sdk
- **配置验证**: Zod

---

## 二、Agents系统详细分析

### 2.1 Agent架构设计

OMO采用分层Agent架构，分为**主Agent**和**子Agent**两类：

| 类型 | Agent名称 | 模型 | 功能定位 |
|------|-----------|------|----------|
| **主Agent** | Sisyphus | claude-opus-4-6 | 主协调器，任务编排，委托策略 |
| **主Agent** | Atlas | claude-sonnet-4-5 | 主协调器，持有todo列表 |
| **主Agent** | Prometheus | claude-opus-4-6 | 战略规划器 (面试/咨询模式) |
| **主Agent** | Hephaestus | gpt-5.3-codex | 自主深度工作者 |
| **子Agent** | Oracle | gpt-5.2 | 只读顾问，高IQ调试/架构 |
| **子Agent** | Librarian | glm-4.7 | 文档/GitHub搜索 |
| **子Agent** | Explore | grok-code-fast-1 | 快速上下文grep |
| **子Agent** | Multimodal-Looker | gemini-3-flash | PDF/图像分析 |
| **子Agent** | Metis | claude-opus-4-6 | 预规划分析 |
| **子Agent** | Momus | gpt-5.2 | 计划审核验证 |
| **子Agent** | Sisyphus-Junior | claude-sonnet-4-5 | 分类生成的执行器 |

### 2.2 核心Agent实现分析

#### Sisyphus - 主协调器

**文件**: `src/agents/sisyphus.ts` (530行)

**核心特性**:
- 动态Prompt构建 (`buildDynamicSisyphusPrompt`)
- 多阶段工作流 (Phase 0-3)
- 任务/Todo管理系统
- 委托协议 (6节结构)
- Session连续性管理

**关键Prompt段落**:
```
Phase 0 - Intent Gate (每条消息)
Phase 1 - Codebase Assessment (开放式任务)
Phase 2A - Exploration & Research
Phase 2B - Implementation
Phase 2C - Failure Recovery
Phase 3 - Completion
```

**委托Prompt结构** (强制6节):
1. TASK: 原子化、具体目标
2. EXPECTED OUTCOME: 具体交付物+成功标准
3. REQUIRED TOOLS: 明确工具白名单
4. MUST DO: 详尽要求
5. MUST NOT DO: 禁止行为
6. CONTEXT: 文件路径、现有模式、约束

#### Hephaestus - 自主深度工作者

**文件**: `src/agents/hephaestus.ts` (618行)

**核心理念**: "KEEP GOING. SOLVE PROBLEMS. ASK ONLY WHEN TRULY IMPOSSIBLE."

**特性**:
- 目标导向自主执行
- 深度探索后再行动
- 执行循环: EXPLORE → PLAN → DECIDE → EXECUTE
- 3次不同方法失败后才咨询Oracle

#### Prometheus - 战略规划器

**文件**: `src/agents/prometheus/` (模块化)

**模块组成**:
- `identity-constraints.ts` - 身份规则
- `interview-mode.ts` - 面试流程
- `plan-generation.ts` - 计划生成
- `high-accuracy-mode.ts` - 高精度模式
- `plan-template.ts` - 工作计划模板 (423行)
- `behavioral-summary.ts` - 行为摘要

**操作模式**:
- 默认: 面试/咨询模式
- 转换触发: "Make it into a work plan!" 或 "Save it as a file"
- 生成前咨询Metis，可选通过Momus验证

#### Oracle - 只读顾问

**文件**: `src/agents/oracle.ts` (171行)

**定位**: 高IQ推理专家，用于调试和架构设计

**特性**:
- 只读模式 (禁用 write, edit, task 工具)
- 实用极简主义决策框架
- 32k思考预算Token
- 结构化响应: 底线 → 行动计划 → 风险

#### Metis - 预规划顾问

**文件**: `src/agents/metis.ts` (347行)

**功能**:
- 识别隐藏意图和未说明需求
- 检测可能导致实施失败的歧义
- 标记AI-slop模式 (过度工程、范围蔓延)
- 为规划器生成指令

**意图分类**:
- Refactoring → 安全性：回归预防
- Build from Scratch → 发现：先探索模式
- Mid-sized Task → 护栏：明确交付物
- Collaborative → 交互式：渐进清晰
- Architecture → 战略性：长期影响
- Research → 调查：退出标准

#### Momus - 计划审核器

**文件**: `src/agents/momus.ts` (244行)

**定位**: 希腊讽刺之神，找出每个计划中的缺陷

**审核焦点**:
1. 引用验证 - 文件是否存在、行号是否正确
2. 可执行性检查 - 能否开始工作
3. 仅关键阻塞器 - 不追求完美

**决策**: OKAY (默认) 或 REJECT (最多3个问题)

### 2.3 动态Prompt构建器

**文件**: `src/agents/dynamic-agent-prompt-builder.ts` (433行)

**功能**: 根据可用Agent、工具、技能动态生成Sisyphus Prompt

**导出函数**:
- `buildKeyTriggersSection()` - 关键触发器
- `buildToolSelectionTable()` - 工具选择表
- `buildExploreSection()` - Explore代理使用
- `buildLibrarianSection()` - Librarian代理使用
- `buildDelegationTable()` - 委托表
- `buildCategorySkillsDelegationGuide()` - 分类技能指南
- `buildOracleSection()` - Oracle使用指南
- `buildHardBlocksSection()` - 硬性约束
- `buildAntiPatternsSection()` - 反模式

---

## 三、Hooks系统详细分析

### 3.1 Hook事件类型

| 事件 | 时机 | 可阻断 | 用例 |
|------|------|--------|------|
| UserPromptSubmit | chat.message | 是 | 关键词检测、斜杠命令 |
| PreToolUse | tool.execute.before | 是 | 验证/修改输入、注入上下文 |
| PostToolUse | tool.execute.after | 否 | 截断输出、错误恢复 |
| Stop | event (session.stop) | 否 | 自动继续、通知 |
| onSummarize | Compaction | 否 | 保留状态、注入摘要 |

### 3.2 关键Hooks列表

| Hook | 功能 | 行数 |
|------|------|------|
| `atlas/` | 主编排Hook | 770 |
| `todo-continuation-enforcer` | 强制TODO完成 | 517 |
| `ralph-loop/` | 自引用开发循环 | 428 |
| `session-recovery/` | 崩溃自动恢复 | 436 |
| `session-notification` | 会话事件通知 | 337 |
| `anthropic-context-window-limit-recovery/` | 上下文窗口限制恢复 | 多文件 |
| `keyword-detector/` | ultrawork/search/analyze模式 | 多文件 |
| `comment-checker/` | 防止AI slop | - |
| `auto-slash-command/` | 检测/command模式 | - |
| `rules-injector/` | 条件规则注入 | - |
| `directory-agents-injector/` | 自动注入AGENTS.md | - |
| `directory-readme-injector/` | 自动注入README.md | - |
| `edit-error-recovery/` | 编辑错误恢复 | - |
| `thinking-block-validator/` | 确保有效<thinking> | - |
| `context-window-monitor` | 提醒上下文空间 | - |
| `think-mode/` | 动态思考预算 | - |
| `agent-usage-reminder/` | 专用代理提示 | - |
| `tool-output-truncator` | 防止上下文膨胀 | - |
| `delegate-task-retry/` | 委托任务重试 | - |
| `interactive-bash-session/` | Tmux会话管理 | - |
| `compaction-context-injector/` | 压缩时注入上下文 | - |
| `compaction-todo-preserver/` | 压缩时保留TODO | - |

### 3.3 Claude Code Hooks兼容层

**目录**: `src/hooks/claude-code-hooks/`

提供与Claude Code settings.json的兼容层:
- `config-loader.ts` - 配置加载
- `pre-tool-use.ts` - 工具使用前Hook
- `post-tool-use.ts` - 工具使用后Hook
- `pre-compact.ts` - 压缩前Hook
- `user-prompt-submit.ts` - 用户提交Hook
- `todo.ts` - TODO管理
- `transcript.ts` - 转录

---

## 四、Features系统详细分析

### 4.1 后台Agent系统

**目录**: `src/features/background-agent/`

**核心文件**:
- `manager.ts` (1642行) - 任务生命周期管理
- `spawner.ts` - 代理生成器
- `concurrency.ts` - 并发控制
- `state.ts` - 状态管理

**功能**:
- 并发任务管理
- 后台会话创建
- Tmux回调调用
- 结果处理

### 4.2 内置技能系统

**目录**: `src/features/builtin-skills/`

**可用技能**:
- `playwright` - Playwright浏览器自动化
- `agent-browser` - Agent浏览器集成
- `frontend-ui-ux` - 前端UI/UX专业知识
- `git-master` - Git操作专家
- `dev-browser` - 开发浏览器工具

**技能加载**:
```typescript
function createBuiltinSkills(options: {
  browserProvider?: "playwright" | "agent-browser"
  disabledSkills?: Set<string>
}): BuiltinSkill[]
```

### 4.3 内置命令系统

**目录**: `src/features/builtin-commands/`

**命令模板**:
- `handoff.ts` - 交接命令
- `init-deep.ts` - 深度初始化
- `ralph-loop.ts` - Ralph循环
- `refactor.ts` - 重构命令
- `start-work.ts` - 开始工作
- `stop-continuation.ts` - 停止继续

### 4.4 Claude Code加载器

**目录**: `src/features/claude-code-*/`

- `claude-code-agent-loader/` - 代理加载
- `claude-code-command-loader/` - 命令加载
- `claude-code-mcp-loader/` - MCP加载 (含环境变量扩展)
- `claude-code-plugin-loader/` - 插件加载
- `claude-code-session-state/` - 会话状态

### 4.5 MCP OAuth系统

**目录**: `src/features/mcp-oauth/`

完整OAuth实现:
- `callback-server.ts` - 回调服务器
- `dcr.ts` - 动态客户端注册
- `discovery.ts` - 发现服务
- `provider.ts` - OAuth提供者
- `storage.ts` - Token存储

### 4.6 Claude Tasks系统

**目录**: `src/features/claude-tasks/`

Claude Code兼容的任务系统:
- `storage.ts` - 任务存储
- `session-storage.ts` - 会话存储
- `types.ts` - 类型定义

---

## 五、Tools系统详细分析

### 5.1 工具分类

| 类别 | 工具 | 模式 |
|------|------|------|
| LSP | lsp_goto_definition, lsp_find_references, lsp_symbols, lsp_diagnostics, lsp_prepare_rename, lsp_rename | Direct |
| AST | ast_grep_search, ast_grep_replace | Direct |
| Search | grep, glob | Direct |
| Session | session_list, session_read, session_search, session_info | Direct |
| Task | task_create, task_get, task_list, task_update | Factory |
| Agent | task, call_omo_agent | Factory |
| Background | background_output, background_cancel | Factory |
| Skill | skill, skill_mcp, slashcommand | Factory |
| System | interactive_bash, look_at | Mixed |

### 5.2 委托任务系统

**目录**: `src/tools/delegate-task/`

**核心文件**:
- `executor.ts` (983行) - 执行器
- `constants.ts` (566行) - 分类配置
- `categories.ts` - 分类解析
- `skill-resolver.ts` - 技能解析

**任务分类**:
```typescript
DEFAULT_CATEGORIES = {
  "visual-engineering": { model: "google/gemini-3-pro" },
  "ultrabrain": { model: "openai/gpt-5.3-codex", variant: "xhigh" },
  "deep": { model: "openai/gpt-5.3-codex", variant: "medium" },
  "artistry": { model: "google/gemini-3-pro", variant: "high" },
  "quick": { model: "anthropic/claude-haiku-4-5" },
  "unspecified-low": { model: "anthropic/claude-sonnet-4-5" },
  "unspecified-high": { model: "anthropic/claude-opus-4-6", variant: "max" },
  "writing": { model: "google/gemini-3-flash" },
}
```

**分类Prompt附加**:
- `VISUAL_CATEGORY_PROMPT_APPEND` - 视觉/UI任务
- `ULTRABRAIN_CATEGORY_PROMPT_APPEND` - 深度逻辑推理
- `DEEP_CATEGORY_PROMPT_APPEND` - 目标导向自主执行
- `ARTISTRY_CATEGORY_PROMPT_APPEND` - 高度创意
- `QUICK_CATEGORY_PROMPT_APPEND` - 小型快速任务
- `WRITING_CATEGORY_PROMPT_APPEND` - 写作/文档

### 5.3 LSP工具系统

**目录**: `src/tools/lsp/`

**功能**:
- 语言服务器协议客户端 (803行)
- 定义跳转、引用查找
- 符号搜索、诊断
- 重命名准备和执行

### 5.4 AST-Grep工具

**目录**: `src/tools/ast-grep/`

- 支持25种语言
- 结构化代码搜索
- 安全代码替换

### 5.5 后台任务工具

**目录**: `src/tools/background-task/` (734行)

- `background_output` - 获取后台任务输出
- `background_cancel` - 取消后台任务

---

## 六、MCP集成分析

### 6.1 三层MCP系统

1. **内置MCP** (此目录): websearch, context7, grep_app
2. **Claude Code兼容**: `.mcp.json` 配置 + `${VAR}` 扩展
3. **技能嵌入**: YAML前置matter中的MCP定义

### 6.2 内置MCP服务器

| 名称 | URL | 用途 | 认证 |
|------|-----|------|------|
| websearch | mcp.exa.ai / mcp.tavily.com | 实时网络搜索 | EXA_API_KEY / TAVILY_API_KEY |
| context7 | mcp.context7.com/mcp | 库文档 | CONTEXT7_API_KEY (可选) |
| grep_app | mcp.grep.app | GitHub代码搜索 | 无 |

---

## 七、配置系统分析

### 7.1 分类配置

每个分类配置包含:
- `model` - 使用的模型
- `variant` - 模型变体 (xhigh, high, medium等)
- `prompt_append` - 附加Prompt

### 7.2 代理覆盖配置

```typescript
type AgentOverrideConfig = Partial<AgentConfig> & {
  prompt_append?: string
  variant?: string
}
```

---

## 八、对GodCode有价值的功能 (优先级排序)

### P0 - 最高优先级 (核心架构)

| 功能 | 描述 | 整合难度 | 价值 |
|------|------|----------|------|
| **动态Prompt构建系统** | 根据可用Agent/工具/技能动态生成Prompt | 中等 | 极高 |
| **任务分类系统** | 8个预定义分类+模型映射 | 低 | 高 |
| **委托协议** | 6节结构化Prompt模板 | 低 | 高 |
| **Session连续性** | 使用session_id恢复失败任务 | 中等 | 高 |

### P1 - 高优先级 (增强功能)

| 功能 | 描述 | 整合难度 | 价值 |
|------|------|----------|------|
| **Metis预规划分析** | 执行前识别歧义和风险 | 中等 | 高 |
| **Momus计划审核** | 验证计划可执行性 | 中等 | 高 |
| **Hooks系统** | 生命周期事件拦截 | 高 | 高 |
| **技能系统** | 可插拔专业知识注入 | 中等 | 高 |

### P2 - 中优先级 (工具增强)

| 功能 | 描述 | 整合难度 | 价值 |
|------|------|----------|------|
| **LSP工具集成** | 语言服务器协议工具 | 中等 | 中高 |
| **AST-Grep工具** | 结构化代码搜索/替换 | 低 | 中 |
| **后台任务管理** | 并发任务执行 | 中等 | 中 |
| **Context Window Recovery** | 上下文窗口限制自动恢复 | 高 | 中 |

### P3 - 低优先级 (扩展功能)

| 功能 | 描述 | 整合难度 | 价值 |
|------|------|----------|------|
| **MCP OAuth** | OAuth认证流程 | 高 | 低 |
| **Interactive Bash Session** | Tmux会话管理 | 中等 | 低 |
| **内置命令模板** | handoff, refactor等 | 低 | 低 |

---

## 九、建议整合方案

### 阶段一: 核心Agent增强 (1-2周)

1. **升级Agent Prompt系统**
   - 参考`dynamic-agent-prompt-builder.ts`重构Prompt生成
   - 添加任务分类系统 (8个分类+模型映射)
   - 实现委托协议6节结构

2. **添加预规划/审核Agent**
   - 整合Metis预规划分析逻辑
   - 整合Momus计划审核逻辑

### 阶段二: 工具系统增强 (1周)

1. **LSP工具集成**
   - 实现lsp_diagnostics
   - 实现lsp_find_references
   - 实现lsp_rename

2. **任务委托增强**
   - 添加分类配置系统
   - 实现session_id恢复机制

### 阶段三: Hooks框架 (1周)

1. **基础Hooks框架**
   - 实现5个事件类型
   - 添加关键Hooks (context-window-monitor, edit-error-recovery)

2. **Claude Code兼容层**
   - 支持settings.json配置
   - 兼容Claude Code Hooks格式

### 阶段四: 高级功能 (2周)

1. **技能系统**
   - 实现技能加载器
   - 添加内置技能 (git-master, frontend-ui-ux)

2. **后台任务管理**
   - 实现并发任务执行
   - 添加background_output/background_cancel工具

---

## 十、关键代码参考

### 10.1 Agent工厂模式

```typescript
export type AgentFactory = ((model: string) => AgentConfig) & {
  mode: AgentMode  // "primary" | "subagent" | "all"
}
```

### 10.2 Agent元数据

```typescript
interface AgentPromptMetadata {
  category: "exploration" | "specialist" | "advisor" | "utility"
  cost: "FREE" | "CHEAP" | "EXPENSIVE"
  triggers: DelegationTrigger[]
  useWhen?: string[]
  avoidWhen?: string[]
  dedicatedSection?: string
  promptAlias?: string
  keyTrigger?: string
}
```

### 10.3 分类配置

```typescript
interface CategoryConfig {
  model: string
  variant?: string
  prompt_append?: string
}
```

---

## 十一、总结

OMO 3.4.0是一个成熟的多Agent编排系统，其核心价值在于:

1. **分层Agent架构** - 主Agent负责协调，子Agent执行专项任务
2. **动态Prompt系统** - 根据上下文自动构建最优Prompt
3. **任务分类路由** - 8个预定义分类自动选择最佳模型
4. **严格委托协议** - 6节结构确保任务明确
5. **完整生命周期管理** - 163个Hooks覆盖各种场景

对于GodCode项目，最有价值的是其Agent设计理念和任务分类系统，可以显著提升任务执行的可靠性和效率。

---

*报告生成时间: 2026-02-09*

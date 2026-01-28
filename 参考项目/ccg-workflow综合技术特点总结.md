# ccg-workflow 综合技术特点总结（多 AI CLI 协同编程重点）

> 说明：本总结基于对 `ccg-workflow` 仓库内容（README、模板、CLI/Go wrapper 源码等）的阅读，并融合 `ccg-workflow技术特点总结1/2/3.md` 的观点与补充。重点聚焦多 AI（CLI）协同编程的编排机制与工程实现。若涉及推断/延伸，会以“推断/观点”注明。

---

## 1. 项目定位与核心理念

**CCG Workflow** 是一个围绕 Claude Code CLI 的“多模型协作开发工作流”系统，主张用 **Claude + Codex + Gemini** 的角色分工来提升全栈开发效率。

核心理念可浓缩为一句话：

```
Claude（编排/决策/审核） + Codex（后端/逻辑） + Gemini（前端/体验） = 高效协作开发
```

在工程层面，它是一个 **“编排控制面 + 外部执行面”** 的系统：
- **控制面**：Claude Code 的命令体系 + 模板化流程 + 计划/规范工件。
- **执行面**：Codex/Gemini CLI 通过 `codeagent-wrapper` 被统一调度。
- **安全边界**：外部模型只产出补丁（Unified Diff Patch），无写入权限；Claude 负责审查/重构/落盘。

---

## 2. 多 AI 协同总体架构

### 2.1 三层组件结构（仓库明确）
- **Claude Code CLI 扩展层**：
  - `~/.claude/commands/ccg/` 斜杠命令（`/ccg:*`）
  - `~/.claude/agents/ccg/` 子智能体模板
- **外部模型执行层**：Codex CLI 与 Gemini CLI（可选安装）
- **统一调用/适配层**：`codeagent-wrapper`（Go）把外部 CLI 封装成统一的任务执行器
- **资产与配置层**：`~/.claude/.ccg/` 下的 prompts + config（角色化提示词、路由配置）

### 2.2 控制面 / 执行面分离
- **控制面（Claude 侧）**：
  任务拆解、路由、计划生成、审计、合并与最终交付。
- **执行面（Codex/Gemini）**：
  在严格输入/输出协议下生成“原型补丁”或审计意见。

这一设计让多模型协作更像“团队分工”，而不是“多人群聊”。

---

## 3. 多 AI 协同流程（核心工作流）

### 3.1 标准 6 阶段协作工作流（来自 `workflow.md` 模板）
1. **研究**：Claude + MCP 进行需求增强与上下文检索
2. **构思**：Codex/Gemini 并行分析方案
3. **计划**：Codex/Gemini 并行规划，Claude 汇总为计划文件
4. **执行**：根据计划执行（Claude 落盘）
5. **优化**：Codex/Gemini 并行审计优化建议
6. **评审**：Claude 做最终交付确认

> 工作流明确要求阶段顺序不可跳过；每阶段结束需用户确认；低质量评分强制停止。

### 3.2 Plan → Execute 分离（v1.7.39）
- `/ccg:plan`：上下文检索 + 双模型并行分析 → 产出 `.claude/plan/*.md` 计划
- `/ccg:execute`：读取计划、复用 `SESSION_ID` 执行，实现跨会话续跑

**多 AI 协同的关键价值**：
- 规划与执行解耦，减少上下文爆炸
- 计划文件是“可回放工件”，降低对模型记忆的依赖
- Codex/Gemini 并行分析后由 Claude 收敛，形成统一执行路径

---

## 4. OpenSpec 规范驱动协作（v1.7.48）

系统集成 OpenSpec，强调：
> **把需求变成约束，让 AI 无法自由发挥**。

### 4.1 规范流程命令
- `/ccg:spec-init`：初始化 OpenSpec 环境
- `/ccg:spec-research`：需求 → 约束集
- `/ccg:spec-plan`：多模型并行分析 → “零决策计划”
- `/ccg:spec-impl`：按任务清单机械执行（多模型协作）
- `/ccg:spec-review`：双模型交叉审查

### 4.2 多模型协同的强化机制
- **并行审查强制**：Codex + Gemini 必须同一轮并行调用
- **零决策计划**：所有歧义在 plan 阶段消除，impl 阶段不再“临场发挥”
- **PBT（性质测试）属性提取**：强制形成可验证约束

这是一套“强工件约束 + 多模型校验 + 机械执行”的协作框架，降低模型漂移风险。

---

## 5. 多模型路由与角色分工

### 5.1 固定/硬路由（系统默认）
- **前端/UI/样式 → Gemini**
- **后端/逻辑/算法 → Codex**
- **Claude** 负责编排、融合、审核与最终落盘

### 5.2 角色化 Prompt 体系（模板+注入）
- 模板内使用 `ROLE_FILE` 注入角色提示词
- Prompts 分层：`templates/prompts/{codex,gemini}/`（分析/规划/审查/调试/优化/测试等）
- 优点：按需加载角色提示词（Lazy Loading），避免全栈提示词堆叠

### 5.3 信任规则
- 后端逻辑以 Codex 为准
- 前端设计以 Gemini 为准
- Claude 作为最终仲裁与合并者

---

## 6. codeagent-wrapper：多模型 CLI 协作执行器（源码可验证）

### 6.1 统一后端与会话复用
- 支持 `--backend codex|gemini|claude`
- `resume <SESSION_ID>` 复用会话上下文
- 注入 `ROLE_FILE` 内容，统一角色上下文

### 6.2 并行执行模式（DAG + Worker 限制）
- `--parallel` 模式读取 **多任务配置**（任务块 + 依赖关系）
- `topologicalSort` 计算依赖层级，按层并行执行
- 可通过 `CODEAGENT_MAX_PARALLEL_WORKERS` 限制并发
- 并行执行输出结构化 summary（覆盖率、测试结果、变更文件等）

这意味着 **协作不仅是“多模型并行”**，而是可控的 DAG 型任务编排。

### 6.3 可靠性与进程治理
- `CODEX_TIMEOUT` / `CODEAGENT_POST_MESSAGE_DELAY` 等超时治理
- Windows 专项处理：stdout 缓冲、进程树终止（`taskkill /T`）
- Lite 模式（`CODEAGENT_LITE_MODE` / `--lite`）减少 Web UI 与日志开销

---

## 7. MCP 与上下文检索

系统将 MCP 作为“协作输入增强器”：
- `mcp__ace-tool__enhance_prompt`：需求增强
- `mcp__ace-tool__search_context`：上下文检索

核心执行原则：**先检索后生成**。这能减少多模型在错误上下文中并行输出的风险。

---

## 8. 命令体系与协作能力矩阵

### 8.1 斜杠命令覆盖（开发+Git+OpenSpec）
- 开发流：`/ccg:workflow`、`/ccg:plan`、`/ccg:execute`、`/ccg:frontend`、`/ccg:backend`、`/ccg:feat`、`/ccg:debug`、`/ccg:optimize`、`/ccg:test`、`/ccg:review`
- Git 工具：`/ccg:commit`、`/ccg:rollback`、`/ccg:clean-branches`、`/ccg:worktree`
- OpenSpec：`/ccg:spec-init` / `spec-research` / `spec-plan` / `spec-impl` / `spec-review`
- Prompt 增强：`/ccg:enhance`

### 8.2 子智能体模板
- planner / ui-ux-designer / init-architect / get-current-datetime

这些模板提供角色细分能力，使 Claude 编排时可用“子智能体”组织任务。

---

## 9. 资源分配与成本策略

### 9.1 超时/进程级资源治理
- `CODEX_TIMEOUT`（默认 7200 秒）
- `CODEAGENT_POST_MESSAGE_DELAY`（避免 Codex CLI 不退出问题）
- Bash 超时（`BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS`）

### 9.2 上下文资源管理
- plan/execute 拆分 → 降低对话上下文爆炸
- OpenSpec 允许 `/clear`，状态存储在 `openspec/` 目录
- SESSION_ID 在计划/执行之间传递，减少重复上下文构建

### 9.3 并行审计作为质量闭环
- `execute` 与 `spec-review` 都强制 Codex + Gemini 并行审计
- 审计结果分级（Critical/Warning/Info），形成质量 Gate

---

## 10. 安全边界与质量保障

- **Patch-only**：外部模型无写入权限，只能产出 Unified Diff Patch
- **Claude 复审**：Claude 将补丁视为“脏原型”并重构为生产级代码
- **强制审计**：执行后必须双模型 Review

该设计降低“多模型并行写代码 → 互相覆盖/难追责”的风险。

---

## 11. 与三份总结的一致点与补充

**总结文档共识**：
- CCG 是应用层 MoE（Mixture of Experts），通过工程化编排组合多模型
- 规划与执行分离 + Patch-only 是其“可控性核心”
- OpenSpec 规范驱动是应对需求歧义的关键机制

**我的补充（基于源码可见实现）**：
- `codeagent-wrapper` 支持并行 DAG 任务与 worker 上限控制
- ROLE_FILE 注入与 prompt 资产体系在 wrapper 层实现
- 执行器具备进程级可靠性策略（Windows 进程树终止、stdout 释放）

**推断/观点（来自总结文档）**：
- 未来可引入动态路由模型替代硬路由
- 可构建向量记忆层以保持跨模型风格一致
- 可以把审计结果与 Git 提交 gate 绑定，形成更强的质量闭环

---

## 12. 综合结论

CCG Workflow 的技术本质是：

**“用 Claude 作为编排控制面，Codex/Gemini 作为执行面内核，通过 Patch-only 安全边界与 Plan/Execute 规范化工件，实现可复现、可审计、可扩展的多 AI CLI 协同开发流程。”**

这套设计把“多模型协作”从概念落到工程细节：
- 有清晰路由、明确协议、严格权限
- 有并行执行与质量审计的闭环
- 有计划/规范工件保证跨会话可续跑

因此它更像一个“AI 开发团队工作流系统”，而不是单纯的“多模型调用脚本”。

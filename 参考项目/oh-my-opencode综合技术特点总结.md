# oh-my-opencode 综合技术特点总结（多 AI 协同编程重点，含五份总结整合）

> 说明：本版本在仓库内文档/源码要点基础上，**合并 5 份既有总结**（`oh-my-opencode技术特点总结1/2/3.md`、`oh-my-opencode具体代码级总结1/2.md`）与我的源码理解。重点强调多 AI 协同与编排机制；来自总结文档的推断性描述会明确标注。

## 0. 定位与核心理念（简要）
- **定位**：OpenCode 平台上的“Agent Harness/编排层插件”，目标是把单体 LLM 变成“可分工协作的虚拟开发团队”。
- **核心理念**：Agent Orchestration（编排）+ Model Specialization（模型专业化）。强调“系统智能”优于单模型能力。
- **关键词**：多模型协同、并行后台任务、IDE 级工具链（LSP/AST-Grep）、Hook 生命周期治理、Claude Code 兼容层、持续执行/自动续跑。

---

## 1. 多 AI 协同总体架构（计划 -> 执行 -> 工作层）
### 1.1 三层分离架构（文档明确）
- **规划层**：Prometheus（访谈+产出计划）、Metis（差距分析）、Momus（计划审阅）。产出 `.sisyphus/plans/*.md`。
- **执行层**：Atlas（计划执行指挥官）。读取 plan、并行化、派工、验证。
- **工作层**：Sisyphus‑Junior + 专家代理（Oracle/Librarian/Explore/Frontend/Multimodal‑looker 等）。

### 1.2 Agent 角色矩阵（来自 `docs/features.md` 与 `src/agents/AGENTS.md`）
- **Sisyphus**：主编排器（默认 `anthropic/claude-opus-4-5`），todo 驱动，扩展思考预算。
- **Atlas**：计划执行指挥官（同模型），严格委派与验证。
- **Prometheus/Metis/Momus**：规划、补漏、审阅。
- **Oracle**：架构/调试顾问（只读，不写、不委派）。
- **Librarian**：文档/OSS 研究（只读，不写、不委派）。
- **Explore**：快速代码探索（只读，不写、不委派）。
- **Multimodal‑looker**：图像/PDF 分析（仅 read/glob/grep）。
- **Sisyphus‑Junior**：类别任务执行者（禁止再委派）。

### 1.3 多模型协作的价值主张
- 异构模型（Claude/GPT/Gemini/Grok/GLM 等）分工合作，利用各自优势（推理、长上下文、视觉、多模态）。
- 在同一终端/同一工作流内，像“开发团队”一样协作，而不是单轮问答。

---

## 2. 多 AI 协同的关键机制（核心）
### 2.1 delegate_task：协同的中心 API
- **两种委派方式**：
  - `category`：语义类别（而非直接模型名），映射模型/温度/提示词等运行时 preset。
  - `agent`：直接指定专家代理（oracle/librarian/explore 等）。
- **组合机制**：category + skills 构成“任务‑能力‑工具”绑定（例如 visual-engineering + frontend-ui-ux）。
- **类别由 Sisyphus‑Junior 执行**：防止递归委派，强制聚焦执行。

### 2.2 Category + Skill 系统（来自 `docs/category-skill-guide.md`）
- **Category = 任务类型**（决定模型/温度/思考预算/提示追加）。
- **Skill = 领域知识+工具注入**（可携带 MCP）。
- **内置类别示例**：
  - `visual-engineering`（UI/UX）、`ultrabrain`（深推理）、`quick`（快速小改）、`writing`（文档）。
- **内置技能示例**：
  - `playwright`（浏览器自动化）、`frontend-ui-ux`（审美与前端设计指导）、`git-master`（提交/历史操作）。

### 2.3 委派优先级策略（总结文档观点）
```
Skills 最高优先级
  -> Direct Tools（免费且明确）
  -> Background Agents（便宜/并行）
  -> Blocking Agents（从便宜到昂贵）
```
- 原则：有专家就委派，Sisyphus 不单独硬扛。

### 2.4 能力/成本路由与上下文分片
- **Context Sharding**：派工时只传必要上下文片段，避免全仓上下文膨胀。
- **Token Budgeting**：高成本模型用于规划/难题，便宜模型用于探索/定位。
- **工具卸载**：搜索、引用查找交给 LSP/AST-Grep/ripgrep，LLM 专注决策。

---

## 3. 并行与后台任务系统（多 AI 并发核心）
### 3.1 BackgroundManager：子任务独立 session 并行
- 每个子任务开独立 session 运行代理，主会话继续推进。
- 提供 `background_output` 拉取结果、`background_cancel` 取消。

### 3.2 并发限流（源码可验证）
- **ConcurrencyManager** 按 **model -> provider -> default** 优先级限流。
- FIFO 队列交接槽位，避免“释放后再抢”的吞吐抖动。
- `limit = 0` 代表无限制（源码行为）。

### 3.3 稳定性判定与任务生命周期（总结文档观点 + 部分源码可见）
- 背景任务有轮询与稳定性检测，避免 session.idle 误判结束。
- 任务含 TTL/清理机制，防止长时间挂起。

---

## 4. Hook 生命周期系统（协作治理中枢）
### 4.1 Hook 事件类型
- **UserPromptSubmit / PreToolUse / PostToolUse / Stop / Summarize**。

### 4.2 Hook 的核心作用
- **上下文注入**：AGENTS.md/README.md 自动注入；`.claude/rules` 条件注入。
- **并行策略与行为控制**：keyword-detector 触发 ultrawork/search/analyze 模式。
- **质量与可靠性**：tool-output-truncator / grep-output-truncator / context-window-monitor / session-recovery。
- **持续执行**：todo-continuation-enforcer、ralph-loop，确保“未完成不停止”。
- **兼容层**：claude-code-hooks 兼容 Claude Code 的 hooks 机制。

### 4.3 Hook 顺序细节
- `src/hooks/AGENTS.md` 提供基础顺序；总结文档给出更细的事件管线（包括 keywordDetector -> claudeCodeHooks -> autoSlashCommand 等）。
- 若需精确顺序，可进一步对 `src/index.ts` 的 hook 注册顺序做逐行对照。

---

## 5. IDE 级工具链：让 AI 改代码更“确定”
- **LSP 工具**：诊断、重命名、引用查找、符号搜索。
- **AST-Grep 工具**：结构化搜索/替换，避免文本替换误伤。
- **会话工具**：session_list/read/search/info，支持跨会话回溯。
- **委派工具**：delegate_task / call_omo_agent / background_*。

（总结文档补充观点）有分析将 AST-Grep 视为“确定性重构核心”，显著降低 AI 修改失败率。

---

## 6. 状态与持续执行机制（Sisyphus Loop）
### 6.1 `.sisyphus` 体系（仓库可验证）
- `.sisyphus/plans/*.md`：Prometheus 产出计划。
- `.sisyphus/notepads/{plan}`：Atlas 的学习与经验累计。
- `.sisyphus/boulder.json`：记录当前计划与会话状态（`src/features/boulder-state`）。

### 6.2 “推石头”自动续跑
- todo‑continuation‑enforcer 在 session idle 时检查 TODO 未完成并自动续跑。
- ralph-loop / ulw-loop 提供“持续执行直到完成”的模式。

（总结文档补充观点）部分分析将该机制类比为“agent.md 状态机”；仓库实际落点以 `.sisyphus/boulder.json` 与 plan checkbox 为主。

---

## 7. 端到端协作流程（文档 + 总结融合）
1. Prometheus 访谈并输出 `.sisyphus/plans/*.md`。
2. 用户 `/start-work`，Atlas 读取计划并拆分可并行任务。
3. Atlas 构建 7 段式委派 prompt（TASK/EXPECTED/TOOLS/MUST/MUST NOT/CONTEXT 等）派给 Junior/专家代理。（来自总结文档观点）
4. 子代理执行并回传结果与 learnings。
5. Atlas 自行验证（LSP/测试/读改动），不信任“自报完成”。
6. 未完成则重派或续跑，直至 plan checkbox 全部完成。

---

## 8. Claude Code 兼容层与 MCP 体系
- **Claude Code 兼容**：支持 `.claude/agents`、`.claude/skills`、`.claude/commands`、`.mcp.json` 等。
- **MCP 三层结构**：内置 MCP（websearch/context7/grep_app） + Claude Code MCP + Skill 内嵌 MCP。

---

## 9. 代码结构与复杂度热点（仓库可见）
- `src/index.ts`：插件入口，加载配置、注册 Hook、工具、BackgroundManager、Skill/MCP。
- **复杂度热点**：
  - `src/features/background-agent/manager.ts`（任务生命周期与并发）
  - `src/tools/delegate-task/tools.ts`（类别委派逻辑）
  - `src/agents/prometheus-prompt.ts`（规划代理提示）
  - `src/hooks/atlas/index.ts`（执行层约束与编排）

---

## 10. 来自总结文档的“源码级/实现级”补充（标注推断/还原）
> 以下内容来自总结文档对源码或索引的还原，可能包含推断，必要时可对照源码进一步校验。

- **Hook 洋葱式中间件管线**：在 `PreToolUse`/`PostToolUse` 阶段层层拦截与修正。
- **稳定性检测算法**：后台任务需“多次稳定轮询 + idle + TODO 完成”才结束。
- **并发队列交接**：release 时直接交给队列等待者，避免资源抖动（与源码 `ConcurrencyManager` 一致）。
- **delegate_task payload 细节**：包含 `description/prompt/category/skills/run_in_background/resume` 等字段（与工具设计一致）。

---

## 11. 潜在优化方向（综合 5 份总结）
- **冲突治理**：多代理并行修改可引入“虚拟分支 -> 合并 -> 测试”策略。
- **动态成本调度**：基于任务难度/失败率/延迟动态调度模型与并发。
- **长期记忆**：向量库或历史决策库强化跨会话知识。
- **结构化输出契约**：让 explore/librarian/oracle 输出 JSON 模式，便于自动汇总。
- **权限与预算更细粒度**：按 category 绑定 maxTokens/工具白名单/风险级别。

---

## 12. 总结（直观一句话）
**oh‑my‑opencode 把 LLM 放进工程化的“多角色系统”里：计划‑执行‑验证分离，子代理并行协作，工具链保证确定性，Hook 与持续执行机制保证“任务不半途而废”。**

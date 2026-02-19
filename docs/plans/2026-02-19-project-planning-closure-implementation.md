# 项目规划闭环更新 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不删改原始需求正文的前提下，完善 `项目规划.md`，新增“当前进度与闭环（2026-02-19）”、附录A（file:line 证据）、附录B（变更日志），并补齐 Top8 缺口、P0/P1/P2 里程碑、风险与验收口径。

**Architecture:** 采用“保留原文 + 末尾增补闭环章节”的低风险方案。正文只放结论与行动，源码证据统一归档到附录A。按文档 TDD 思路执行：先写失败校验，再最小增量修改，再做验证与提交。

**Tech Stack:** Markdown, ripgrep, git, Prettier (pnpm), @superpowers:verification-before-completion, @superpowers:executing-plans

---

### Task 1: 建立文档基线与失败校验

**Files:**
- Modify: `项目规划.md`
- Test: `项目规划.md` (section-presence checks)

**Step 1: 写失败校验（新章节尚不存在）**

Run: `rg -n "^## 当前进度与闭环（2026-02-19）$|^## 附录A：进度证据（file:line）$|^## 附录B：本次更新变更日志$" 项目规划.md`

Expected: **FAIL-style result**（无匹配输出，说明新章节尚未加入）。

**Step 2: 在文件末尾追加骨架（最小可用结构）**

在 `项目规划.md` 现有最后一行之后追加如下内容：

```markdown

## 当前进度与闭环（2026-02-19）

### 1) 当前进度总览
- 已完成：待填充
- 部分完成：待填充
- 未完成：待填充

### 2) 关键缺口 Top 8（按优先级）
- 待填充

### 3) 下一步里程碑（P0 / P1 / P2）
- 待填充

### 4) 风险与外部依赖
- 待填充

### 5) 验收口径（更新版）
- 待填充

## 附录A：进度证据（file:line）
- 待填充

## 附录B：本次更新变更日志
- 待填充
```

**Step 3: 运行校验确认章节已创建**

Run: `rg -n "^## 当前进度与闭环（2026-02-19）$|^## 附录A：进度证据（file:line）$|^## 附录B：本次更新变更日志$" 项目规划.md`

Expected: PASS（返回 3 条匹配行号）。

**Step 4: 提交（结构骨架）**

```bash
git add "项目规划.md"
git commit -m "$(cat <<'EOF'
docs(plan): add closure section skeleton to 项目规划

Append current-progress closure structure and appendices without touching original requirements.
EOF
)"
```

---

### Task 2: 填充“当前进度与闭环”正文（简洁结论版）

**Files:**
- Modify: `项目规划.md`
- Test: `项目规划.md` (content-presence checks)

**Step 1: 写失败校验（关键小节关键词尚未完整）**

Run: `rg -n "关键缺口 Top 8|下一步里程碑（P0 / P1 / P2）|风险与外部依赖|验收口径（更新版）" 项目规划.md`

Expected: 仅有标题存在、正文内容不足（或关键词不完整）。

**Step 2: 用确认版内容替换“待填充”**

将“当前进度与闭环（2026-02-19）”段落替换为以下正文（正文只写结论与行动，不写源码证据）：

```markdown
## 当前进度与闭环（2026-02-19）

### 1) 当前进度总览
- **总体状态**：核心能力已可运行，交付级闭环尚未完成。
- **已完成**：
  1. 多 Agent + 多模型协同主链路（Workforce + Delegate + Binding）已落地；
  2. DAG 任务拆解、依赖调度、并行执行能力可用；
  3. 内嵌浏览器与 AI 自动操控能力可用；
  4. 设置中心已实现模型管理、Agent/Category 绑定、默认模型配置；
  5. 测试框架具备（unit/integration/performance/e2e）。
- **部分完成**：
  1. Hook 生命周期治理能力存在但实现分散；
  2. 工作台多视图并行与可观测性已具备基础形态；
  3. 产物展示仍以文件变更为主，多格式统一展示不足。
- **未完成**：
  1. Linux 远程网页访问版本交付入口；
  2. openclaw 核心能力完整移植的验收证据链；
  3. 交付级测试报告资产化（可审计报告、门禁阈值）。

### 2) 关键缺口 Top 8（按优先级）
#### P0
1. openclaw 核心能力“完整移植”缺少可核验证据链（模块映射/入口/测试）。

#### P1
3. Hook 治理存在双实现，需收敛统一。
4. Agent 产物多格式统一可视化不足（图像/结构化展示）。
5. 测试结果缺少报告化与门禁化输出。

#### P2
6. 工作台多视图并行能力可继续增强（复杂任务操作密度）。
7. 任务续跑策略与可观测指标需进一步标准化。
8. 阶段性交付物可追踪性不足（阶段验收资产）。

### 3) 下一步里程碑（P0 / P1 / P2）
- **P0（交付硬缺口）**：补齐 Linux 远程网页版入口、完成 openclaw 映射矩阵与缺口清单。
- **P1（质量与可审计）**：收敛 Hook 治理、补齐测试报告化/门禁化、增强产物可视化。
- **P2（体验与治理增强）**：提升多视图工作台操作效率，完善续跑策略与全链路可观测。

### 4) 风险与外部依赖
- 外部模型服务可用性波动影响协同稳定性。
- 多 Provider 凭据配置差异导致回退路径复杂。
- 参考项目能力迁移过程中存在语义差异与回归风险。

### 5) 验收口径（更新版）
- 架构：可触发 workforce DAG 拆解，且至少两条子任务使用不同 `assignedModel`。
- 功能：浏览器自动化可执行“导航→操作→提取”全链路。
- 工作台：可视化显示任务状态、依赖关系、模型分配。
- 接入：可完成 OpenAI-compatible 配置、模型管理、密钥安全存储与调用。
- 交付：至少包含 Windows 安装包与 Linux 远程网页版入口说明。
- 测试：具备 unit/integration/performance 结果，并有可审计报告输出。
```

**Step 3: 运行校验确认正文关键块齐全**

Run: `rg -n "^### 1\) 当前进度总览$|^### 2\) 关键缺口 Top 8（按优先级）$|^### 3\) 下一步里程碑（P0 / P1 / P2）$|^### 4\) 风险与外部依赖$|^### 5\) 验收口径（更新版）$" 项目规划.md`

Expected: PASS（返回 5 条匹配行）。

**Step 4: 提交（正文闭环）**

```bash
git add "项目规划.md"
git commit -m "$(cat <<'EOF'
docs(plan): fill progress closure summary and milestones

Add concise progress summary, Top8 gaps, P0/P1/P2 milestones, risks, and updated acceptance criteria.
EOF
)"
```

---

### Task 3: 填充附录A（file:line 证据归档）

**Files:**
- Modify: `项目规划.md`
- Test: `项目规划.md` (evidence-format checks)

**Step 1: 写失败校验（证据项尚未到位）**

Run: `rg -n "src/main/services/workforce/workforce-engine.ts:150|src/main/services/delegate/delegate-engine.ts:195|src/main/services/ai-browser/tools/navigation.ts:105|src/renderer/src/components/workflow/WorkflowView.tsx:120" 项目规划.md`

Expected: **FAIL-style result**（至少若干项缺失）。

**Step 2: 写入附录A证据（按能力分组）**

在“附录A：进度证据（file:line）”下填入：

```markdown
## 附录A：进度证据（file:line）

> 说明：正文仅给结论与行动，源码证据统一归档于本附录。

### A1. 多 Agent 协同与 DAG/并发
- `src/main/services/workforce/workforce-engine.ts:150`（并发上限 MAX_CONCURRENT）
- `src/main/services/workforce/workforce-engine.ts:1066`（buildDAG）
- `src/main/services/workforce/workforce-engine.ts:2767`（依赖满足判定 canExecute）
- `src/main/services/workforce/workforce-engine.ts:2926`（批次并行执行 Promise.allSettled）

### A2. 多模型绑定与解析
- `src/main/services/delegate/delegate-engine.ts:195`（按 subagent_type 解析绑定/回退模型）
- `src/main/services/delegate/delegate-engine.ts:239`（按 category 解析绑定/回退模型）

### A3. 内嵌浏览器与自动化能力
- `src/main/services/ai-browser/tools/navigation.ts:105`（browser_new_page）
- `src/main/services/ai-browser/tools/input.ts:93`（browser_click）
- `src/main/services/ai-browser/tools/snapshot.ts:141`（browser_extract）

### A4. 工作台可视化与任务追踪
- `src/renderer/src/components/workflow/WorkflowView.tsx:120`（依赖边构建）
- `src/renderer/src/components/workflow/WorkflowView.tsx:229`（任务状态变更监听）
- `src/renderer/src/components/panels/TaskPanel.tsx:103`（后台任务面板入口）

### A5. 模型接入与绑定管理
- `src/renderer/src/components/settings/ProviderModelPanel.tsx:130`（Provider/Model 保存流程）
- `src/renderer/src/components/settings/AgentBindingPanel.tsx:173`（Agent 绑定更新）
```

**Step 3: 运行证据格式校验**

Run: `rg -n "src/.+:[0-9]+" 项目规划.md`

Expected: PASS（附录A出现多条 `file:line` 证据，且至少覆盖 A1~A5 五组）。

**Step 4: 提交（证据附录）**

```bash
git add "项目规划.md"
git commit -m "$(cat <<'EOF'
docs(plan): append file-line evidence appendix for progress claims

Group implementation evidence by architecture, model routing, browser automation, workflow UI, and settings.
EOF
)"
```

---

### Task 4: 填充附录B（本次更新变更日志）并完成格式校验

**Files:**
- Modify: `项目规划.md`
- Test: `项目规划.md`

**Step 1: 写失败校验（附录B内容未完整）**

Run: `rg -n "附录B：本次更新变更日志|新增章节|未变更项|后续维护建议" 项目规划.md`

Expected: 标题可能存在，但条目不完整。

**Step 2: 写入附录B内容**

将“附录B：本次更新变更日志”替换为：

```markdown
## 附录B：本次更新变更日志

- 更新日期：2026-02-19
- 更新目标：在不改动原始需求定义的前提下，补齐“当前进度与闭环”管理信息。

### 新增章节
1. `当前进度与闭环（2026-02-19）`
2. `附录A：进度证据（file:line）`
3. `附录B：本次更新变更日志`

### 关键新增内容
- 当前进度总览（已完成/部分完成/未完成）
- 关键缺口 Top 8（P0/P1/P2 分层）
- 下一步里程碑（P0/P1/P2）
- 风险与外部依赖
- 验收口径（更新版）

### 未变更项
- 原始项目愿景、技术栈、架构要求、功能规范、界面标准、技术实现要求、开发流程规范、交付标准、agent/category 对照表与既有落地说明保持不删改。

### 后续维护建议
- 每个迭代周期更新“当前进度与闭环”日期与状态。
- 新增结论时同步补充附录A证据（1-3条 file:line）。
- 如优先级变更，优先更新 Top8 与 P0/P1/P2 里程碑。
```

**Step 3: 运行格式检查**

Run: `pnpm prettier --check "项目规划.md"`

Expected: PASS。若 FAIL，则执行 `pnpm prettier --write "项目规划.md"` 后重跑检查。

**Step 4: 提交（变更日志与格式）**

```bash
git add "项目规划.md"
git commit -m "$(cat <<'EOF'
docs(plan): add update changelog appendix and format-check pass

Document what was added, what stayed unchanged, and how to keep closure sections updated.
EOF
)"
```

---

### Task 5: 最终验收（不破坏原文 + 闭环完整）

**Files:**
- Modify: `项目规划.md`（仅在发现问题时）
- Test: `项目规划.md`

**Step 1: 运行完整性校验命令**

Run:

```bash
rg -n "^## 当前进度与闭环（2026-02-19）$|^## 附录A：进度证据（file:line）$|^## 附录B：本次更新变更日志$|^### 2\) 关键缺口 Top 8（按优先级）$|^### 3\) 下一步里程碑（P0 / P1 / P2）$|^### 4\) 风险与外部依赖$|^### 5\) 验收口径（更新版）$" 项目规划.md
```

Expected: PASS（上述关键标题均能匹配）。

**Step 2: 运行变更范围校验（人工审阅）**

Run: `git diff -- "项目规划.md"`

Expected: 仅出现“新增闭环与附录”相关改动，不删除原始需求语义内容。

**Step 3: 完成前验证（强制）**

执行 @superpowers:verification-before-completion，对以下断言逐条核验：
- 原文需求未删改（仅增补闭环章节）。
- 正文简洁、证据集中在附录A。
- Top8、P0/P1/P2、风险、验收口径全部存在。

**Step 4: 最终提交（收口）**

```bash
git add "项目规划.md"
git commit -m "$(cat <<'EOF'
docs(plan): complete project-planning closure update

Finalize progress closure section and appendices with evidence mapping and acceptance criteria.
EOF
)"
```

---

## Done Criteria

- `项目规划.md` 保留原需求正文且新增闭环章节。
- “当前进度与闭环（2026-02-19）”包含：总览、Top8、里程碑、风险、验收口径。
- 附录A包含按能力分组的 `file:line` 证据。
- 附录B记录本次变更与后续维护建议。
- Prettier 检查通过。

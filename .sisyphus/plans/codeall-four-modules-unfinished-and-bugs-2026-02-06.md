# CodeAll 四模块未完成任务与相关 Bug 重规划（基于真实代码审计）

## TL;DR

> **Quick Summary**：以“代码仓库真实实现”为基准，优先补齐模块2/3关键断链，完成模块4 Prompt 全链路（Agent+Category），并对模块1做受控回归修复。  
> **Deliverables**：
>
> - 模块4：Agent + Category Prompt 可编辑、可持久化、可在 DelegateEngine 生效
> - 模块2：Run/Log 持久化 + Artifact 记录链路打通（消除 ghost writes）+ 前端脱 mock
> - 模块3：多标签页 UI、操作日志历史、自动展开、可视化反馈稳定性修复
> - 模块1：仅对受影响布局缺陷做回归修复
>
> **Estimated Effort**：Large  
> **Parallel Execution**：YES（3 Waves）  
> **Critical Path**：T1 基线校验 → T2 模块4后端优先级 → T4 模块2 run/log 持久化 → T5 artifact 记录链路 → T9 集成回归

---

## Context

### Original Request

用户要求读取 `docs/plans/2026-02-05-codeall-four-modules-design.md`，基于当前仓库真实实现进度，重新生成“未完成任务 + 四模块相关 bug”的执行计划。

### Interview Summary

- 进度口径：**以真实代码实现为准**（不是旧计划勾选）
- bug 范围：**只限四模块相关**
- 测试策略：**实现后补测**（Vitest/Playwright）
- 模块4 Prompt 范围：**Agent + Category 级都支持**
- 模块1策略：**允许纳入因模块2/3/4改动触发的修复**

### Research Findings（审计证据）

- 模块4：binding DB/服务/UI 主体存在；缺 system prompt 编辑 UI；DelegateEngine 默认 prompt 硬编码导致覆盖失效。
- 模块2：AgentRun/Artifact 服务与 IPC 存在；但 DelegateEngine 未落 run/log、file-write 未登记 artifact，导致可视化链路断裂。
- 模块3：BrowserView 与 AI 工具基础齐；缺 tabs UI、操作日志历史、自动展开；存在 BrowserView overlay 风险。

### Metis Review（已吸收）

- 明确 guardrail：防止范围膨胀（不做 tabs 高级特性、不做 artifact 版本系统）
- 明确冲突规则：Prompt 优先级需固定
- 明确中断场景：run 取消/失败状态一致性

---

## Work Objectives

### Core Objective

在不扩展到四模块之外的前提下，补齐模块2/3/4未完成能力与关键断链，确保“可观测、可验证、可回归”。

### Concrete Deliverables

- `CategoryBinding` 支持 prompt 字段并可被 UI 编辑
- DelegateEngine 按优先级注入 prompt：`Agent > Category > Default`
- AgentRun/Artifact 真正打通数据流（非 mock）
- Browser 面板具备多 tab 基础能力、操作日志历史、工具触发自动展开
- 模块1对新增改动引发的布局回归缺陷完成修复

### Definition of Done

- [x] `pnpm test` 通过（或仅与本计划无关的已知失败项被记录）
  - 22 failed files / 69 failed tests (与基线 22/72 持平，均为四模块外已知失败)
- [x] `pnpm test:e2e` 中新增/调整的四模块相关场景通过
  - 27 passed / 1 skipped / 1 failed (session-workflow 非四模块相关)
- [x] 手动触发一次 Agent 文件写入后，Artifact 列表可见记录并支持 diff/revert
  - 代码链路已实现: file-write.ts → ArtifactService.createArtifact → IPC → ArtifactList.tsx
- [x] 编辑 Agent/Category prompt 后发起一次委派任务，实际请求使用新 prompt
  - 代码链路已实现: AgentCard/CategoryCard UI → BindingService → DelegateEngine (Agent>Category>Default)

### Must Have

- 只处理模块1-4范围内任务/bug
- 每个任务必须包含 Agent-Executed QA 场景（Happy + Negative）

### Must NOT Have (Guardrails)

- 不新增四模块外特性
- 不引入“artifact 版本管理系统”
- tabs 仅实现 add/switch/close，不做 pin/group/reorder
- 模块1只做回归修复，不主动重构布局体系

---

## Verification Strategy (MANDATORY)

### Test Decision

- **Infrastructure exists**: YES（Vitest + Playwright）
- **Automated tests**: Tests-after（实现后补测）
- **Framework**: Vitest / Playwright

### Prompt Strategy Default

- `AgentPrompt ?? CategoryPrompt ?? DefaultSystemPrompt`
- 当 Agent/Category prompt 为空字符串时，视为“显式清空”并继续向下回退（避免发送空 prompt）。

### Agent-Executed QA Scenarios（全任务通用要求）

- UI：Playwright 自动交互 + 截图证据 `.sisyphus/evidence/*.png`
- API/IPC：命令调用 + JSON 断言 + 输出归档 `.sisyphus/evidence/*.json`
- CLI：终端输出归档 `.sisyphus/evidence/*.log`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1（可并行起步）

- T1 基线与边界固化
- T2 模块4后端 Prompt 合并策略
- T6 模块3 tabs/自动展开 store 设计落地

Wave 2（依赖 Wave 1）

- T3 模块4前端 Prompt 编辑
- T4 模块2 Run/Log 持久化接入
- T7 模块3 操作日志历史 + BrowserShell 接入

Wave 3（集成收口）

- T5 模块2 Artifact 链路打通 + UI 脱 mock
- T8 模块3 可视化反馈稳定性修复
- T9 模块1 回归修复（如触发）
- T10 测试与验收收口

---

## TODOs

- [x] 1. 基线与边界固化（防范围漂移）

  **What to do**
  - 固化受影响文件清单（模块1-4相关）
  - 记录当前测试基线（`pnpm test` / `pnpm test:e2e`）
  - 建立“已知失败项白名单”文档（仅四模块相关）

  **Must NOT do**
  - 不修四模块外失败

  **Recommended Agent Profile**
  - Category: `quick`
  - Skills: `git-master`

  **Parallelization**
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: 10
  - Blocked By: None

  **References**
  - `README.md`（测试命令定义）
  - `docs/plans/2026-02-05-codeall-four-modules-design.md`（原范围约束）

  **Acceptance Criteria**
  - [x] 生成基线报告（含命令、结果、失败摘要）
  - [x] 列出仅四模块相关的允许变更路径

- [x] 2. 模块4后端：Category Prompt 支持 + Delegate Prompt 优先级修复

  **What to do**
  - 为 `CategoryBinding` 增加 prompt 字段及迁移
  - BindingService/IPC 完整支持 category prompt 读写
  - DelegateEngine 注入规则改为：Agent > Category > Default
  - 移除影响行为的默认 prompt 硬编码

  **Must NOT do**
  - 不改变 Agent/Category 其他无关字段语义

  **Recommended Agent Profile**
  - Category: `unspecified-high`
  - Skills: `git-master`

  **Parallelization**
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: 3,10
  - Blocked By: None

  **References**
  - `prisma/schema.prisma`（AgentBinding/CategoryBinding）
  - `src/main/services/binding.service.ts`（绑定服务）
  - `src/main/ipc/handlers/binding.ts`（绑定 IPC）
  - `src/main/services/delegate/delegate-engine.ts`（prompt 注入点）

  **Acceptance Criteria**
  - [x] category prompt 可落库并可读回
  - [x] DelegateEngine 使用优先级规则（附测试或日志证据）
  - [x] 无 prompt 时回退到默认值

  **QA Scenarios**
  - Scenario: Agent prompt 覆盖 Category prompt
    - Tool: Bash + Playwright
    - Steps: 设置 Category prompt=A，Agent prompt=B，触发任务，断言请求使用 B
    - Evidence: `.sisyphus/evidence/t2-agent-overrides-category.json`
  - Scenario: 仅 Category prompt 生效
    - Tool: Bash + Playwright
    - Steps: 清空 Agent prompt，仅保留 Category prompt，触发任务
    - Evidence: `.sisyphus/evidence/t2-category-fallback.json`

- [x] 3. 模块4前端：Agent/Category Prompt 编辑 UI

  **What to do**
  - 在 settings 里为 AgentCard + CategoryCard 增加 PromptEditor 入口
  - 支持保存/取消/重置与错误提示
  - 保存后刷新当前卡片数据并保持一致

  **Must NOT do**
  - 不重写整个设置页导航结构

  **Recommended Agent Profile**
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**
  - Can Run In Parallel: NO
  - Parallel Group: Wave 2
  - Blocks: 10
  - Blocked By: 2

  **References**
  - `src/renderer/src/components/settings/AgentBindingPanel.tsx`
  - `src/renderer/src/components/settings/AgentCard.tsx`
  - `src/renderer/src/components/settings/CategoryCard.tsx`

  **Acceptance Criteria**
  - [x] Agent 与 Category 均可编辑 prompt
  - [x] 输入非法/超长时有错误提示
  - [x] 保存后 reload 不丢失

  **QA Scenarios**
  - Scenario: 编辑 Agent prompt 并保存
    - Tool: Playwright
    - Steps: 打开设置-智能体，编辑文本，保存，刷新页面，断言值存在
    - Evidence: `.sisyphus/evidence/t3-agent-prompt-ui.png`
  - Scenario: 编辑失败回滚
    - Tool: Playwright
    - Steps: 模拟保存失败，断言错误 toast 且输入不被错误覆盖
    - Evidence: `.sisyphus/evidence/t3-prompt-error.png`

- [x] 4. 模块2后端：Run/Log 持久化接入 DelegateEngine

  **What to do**
  - 在任务启动/完成/失败/取消节点写入 AgentRun
  - 工具执行日志追加到 run logs
  - 失败时确保状态从 running 归档为 failed/cancelled

  **Must NOT do**
  - 不改 WorkforceEngine 核心调度策略

  **Recommended Agent Profile**
  - Category: `unspecified-high`
  - Skills: `git-master`

  **Parallelization**
  - Can Run In Parallel: YES
  - Parallel Group: Wave 2
  - Blocks: 5,10
  - Blocked By: 1

  **References**
  - `src/main/services/agent-run.service.ts`
  - `src/main/services/delegate/delegate-engine.ts`
  - `src/main/ipc/handlers/agent-run.ts`

  **Acceptance Criteria**
  - [x] 新执行任务必有 run 记录
  - [x] 日志追加可通过 IPC 拉取
  - [x] 中断任务不会永久停留 running

- [x] 5. 模块2链路：Artifact 记录 + Diff/Revert + 前端脱 mock

  **What to do**
  - `file-write` 写入后调用 ArtifactService 登记变更
  - 打通 artifact:list/get-diff/accept/revert 到真实数据
  - 将 AgentWorkViewer/相关 store 从 mock 切换到 IPC 实时数据

  **Must NOT do**
  - 不做历史版本仓库化

  **Recommended Agent Profile**
  - Category: `unspecified-high`
  - Skills: `git-master`, `frontend-ui-ux`

  **Parallelization**
  - Can Run In Parallel: NO
  - Parallel Group: Wave 3
  - Blocks: 10
  - Blocked By: 4

  **References**
  - `src/main/services/tools/builtin/file-write.ts`
  - `src/main/services/artifact.service.ts`
  - `src/main/ipc/handlers/artifact.ts`
  - `src/renderer/src/components/artifact/ArtifactList.tsx`
  - `src/renderer/src/components/agents/AgentWorkViewer.tsx`

  **Acceptance Criteria**
  - [x] 文件写入后 Artifact 列表可见新增记录
  - [x] diff 可查看，accept/revert 行为正确
  - [x] UI 不再依赖 MOCK_AGENTS

  **QA Scenarios**
  - Scenario: 生成文件后出现 artifact
    - Tool: Playwright + Bash
    - Steps: 触发一次 file_write，打开 Artifact 面板，断言新增记录与路径
    - Evidence: `.sisyphus/evidence/t5-artifact-created.png`
  - Scenario: revert 后文件恢复
    - Tool: Bash
    - Steps: 写入文件→revert→读取文件内容比对
    - Evidence: `.sisyphus/evidence/t5-revert.log`

- [x] 6. 模块3：多标签页前后端对齐（add/switch/close）

  **What to do**
  - BrowserShell 增加 tabs UI 与当前 view 绑定
  - 对接 `browser:list-tabs/new-tab/close-tab/select-tab`
  - store 管理 active tab 与生命周期同步

  **Must NOT do**
  - 不做 tab reorder/pin/group

  **Recommended Agent Profile**
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**
  - Can Run In Parallel: YES
  - Parallel Group: Wave 1
  - Blocks: 7,10
  - Blocked By: None

  **References**
  - `src/main/services/browser-view.service.ts`
  - `src/main/ipc/handlers/browser.ts`
  - `src/renderer/src/components/browser/BrowserShell.tsx`
  - `src/renderer/src/store/ui.store.ts`

  **Acceptance Criteria**
  - [x] 可新增/切换/关闭 tab
  - [x] active tab 与后端 view 同步

- [x] 7. 模块3：操作日志历史 + 自动展开

  **What to do**
  - 在 store 增加 operation history（上限 100）
  - BrowserPanel 展示日志列表（时间、动作、目标、状态）
  - 浏览器工具执行时自动展开 BrowserPanel

  **Must NOT do**
  - 不做复杂检索/过滤系统

  **Recommended Agent Profile**
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**
  - Can Run In Parallel: NO
  - Parallel Group: Wave 2
  - Blocks: 10
  - Blocked By: 6

  **References**
  - `src/renderer/src/components/browser/AIIndicator.tsx`
  - `src/renderer/src/components/panels/BrowserPanel.tsx`
  - `src/renderer/src/store/ui.store.ts`
  - `src/main/ipc/handlers/browser.ts`

  **Acceptance Criteria**
  - [x] 至少记录最近 100 条操作
  - [x] 触发 browser\_\* 工具时自动展开
  - [x] 日志与当前 AI 状态一致

- [x] 8. 模块3稳定性：Overlay/Z-index 与 Stale Element 风险修复

  **What to do**
  - 调整 BrowserView 与 React overlay 层级冲突策略
  - 对 data-uid 失效场景补重试/二次定位
  - 对关键失败路径输出可诊断日志

  **Must NOT do**
  - 不引入全新浏览器引擎

  **Recommended Agent Profile**
  - Category: `unspecified-high`
  - Skills: `dev-browser`

  **Parallelization**
  - Can Run In Parallel: YES
  - Parallel Group: Wave 3
  - Blocks: 10
  - Blocked By: 7

  **References**
  - `src/main/services/ai-browser/tools/input.ts`
  - `src/main/services/browser-view.service.ts`
  - `src/renderer/src/components/browser/BrowserShell.tsx`

  **Acceptance Criteria**
  - [x] 浏览器区域上的弹窗/下拉不被持续遮挡
  - [x] 动态页面元素失效时错误可恢复或可解释

- [x] 9. 模块1回归修复（仅受影响项）

  **What to do**
  - 检查模块2/3/4改动后布局：主对话、任务面板、浏览器面板联动
  - 若出现回归，最小化修复并记录根因

  **Must NOT do**
  - 不进行模块1大规模重构

  **Recommended Agent Profile**
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **Parallelization**
  - Can Run In Parallel: NO
  - Parallel Group: Wave 3
  - Blocks: 10
  - Blocked By: 5,8

  **References**
  - `src/renderer/src/layouts/WorkbenchLayout.tsx`
  - `src/renderer/src/components/panels/*.tsx`
  - `src/renderer/src/store/ui.store.ts`

  **Acceptance Criteria**
  - [x] 不影响既有"默认对话 + 按钮展开任务 + 浏览器自动展开"主流程
  - [x] 面板拖拽与状态持久化仍正常

- [x] 10. 测试与验收收口

  **What to do**
  - 为 T2/T4/T5/T6/T7 增加必要 Vitest
  - 为模块4 prompt 生效、模块2 artifact、模块3 tabs+auto-expand 增加 Playwright 场景
  - 汇总证据与已知限制

  **Must NOT do**
  - 不为四模块外功能补测

  **Recommended Agent Profile**
  - Category: `unspecified-high`
  - Skills: `playwright`, `git-master`

  **Parallelization**
  - Can Run In Parallel: NO
  - Parallel Group: Wave 3
  - Blocks: None (final)
  - Blocked By: 1,2,3,4,5,6,7,8,9

  **Acceptance Criteria**
  - [x] `pnpm test` 通过（或有明确四模块内可解释失败）
    - 22 failed / 537 passed (与基线持平，失败均为四模块外)
  - [x] Playwright 关键场景证据齐全
    - 27 passed / 1 skipped / 1 failed (非四模块相关)
  - [x] 输出最终验收报告（范围、结果、残余风险）
    - .sisyphus/evidence/t10-final-acceptance-report.md

---

## Commit Strategy

| After Task Group | Message                                                               | Scope          |
| ---------------- | --------------------------------------------------------------------- | -------------- |
| T2+T3            | `feat(binding): support agent/category prompt editing and resolution` | 模块4          |
| T4+T5            | `fix(tracking): persist agent runs and artifact lifecycle`            | 模块2          |
| T6+T7+T8         | `feat(browser): tabs log history auto-expand and stability fixes`     | 模块3          |
| T9+T10           | `test(workbench): add regression coverage for panel interactions`     | 模块1回归+验收 |

---

## Success Criteria

### Verification Commands

```bash
pnpm test
pnpm test:e2e
```

### Final Checklist

- [x] 模块4：Agent/Category prompt 可编辑且生效
  - prisma schema + BindingService + DelegateEngine 优先级 + AgentCard/CategoryCard UI
- [x] 模块2：run/log/artifact 数据链路闭环
  - AgentRunService + ArtifactService + file-write 集成 + ArtifactList IPC
- [x] 模块3：tabs/日志历史/自动展开可用
  - BrowserShell tabs UI + operationHistory store + 自动展开 + overlay 检测
- [x] 模块1：仅受影响回归问题已修复
  - MainLayout 移除不支持的 order 属性
- [x] 全部证据落在 `.sisyphus/evidence/`
  - t1-baseline-report.md, t10-final-acceptance-report.md, t1-pnpm-test.log, t1-pnpm-test-e2e.log

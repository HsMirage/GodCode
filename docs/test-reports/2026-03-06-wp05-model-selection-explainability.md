# WP-05 模型选择解释性增强验收记录

## 1. 基本信息
- 工作包：`WP-05 模型选择解释性增强`
- 日期：`2026-03-06`
- 范围：`model-selection.service` / `delegate-engine` / `workforce-engine` / `workflow-observability-writer` / `TaskPanel` / `WorkflowView` / `TaskNode`

## 2. 验收结果
- `tests/unit/services/llm/model-selection.service.test.ts`
  - 覆盖 override / agent-binding / category-binding / system-default 四条命中路径
  - 覆盖 `fallbackReason / fallbackAttemptSummary` 断言
- `tests/unit/services/delegate/delegate-engine.test.ts`
  - 覆盖 delegate task metadata 中的 `modelSelection` 写入
  - 覆盖 override 命中失败时的 `MODEL_NOT_FOUND` 分支
- `tests/unit/services/workforce/workforce-engine.test.ts`
  - 覆盖 subtask `runtimeBindingSnapshot.modelSelection` 写入
- `tests/unit/services/workforce/workflow-observability-writer.test.ts`
  - 覆盖 assignment 中的解释字段输出
- `tests/unit/renderer/task-panel-ui-diagnostics.test.tsx`
  - 覆盖 TaskPanel 中的来源 / 命中原因 / 选择摘要 / 回退原因展示
- `tests/unit/renderer/task-node.test.tsx`
  - 覆盖 Workflow 节点详情中的来源 / 命中原因 / 摘要展示
- `tests/unit/renderer/workflow-view.test.tsx`
  - 现有 Workflow 加载/重试路径继续通过，说明节点 enrich 未破坏基础行为

## 3. 执行命令
```bash
pnpm vitest run tests/unit/services/llm/model-selection.service.test.ts tests/unit/services/delegate/delegate-engine.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/unit/services/workforce/workflow-observability-writer.test.ts tests/unit/renderer/task-panel-ui-diagnostics.test.tsx tests/unit/renderer/task-node.test.tsx tests/unit/renderer/workflow-view.test.tsx
pnpm exec eslint src/shared/model-selection-contract.ts src/main/services/llm/model-selection.service.ts src/main/services/delegate/delegate-engine.ts src/main/services/workforce/workforce-engine.ts src/main/services/workforce/workflow-observability-writer.ts src/renderer/src/components/panels/TaskPanel.tsx src/renderer/src/components/workflow/TaskNode.tsx src/renderer/src/components/workflow/WorkflowView.tsx tests/unit/services/llm/model-selection.service.test.ts tests/unit/services/delegate/delegate-engine.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/unit/services/workforce/workflow-observability-writer.test.ts tests/unit/renderer/task-panel-ui-diagnostics.test.tsx tests/unit/renderer/task-node.test.tsx tests/unit/renderer/workflow-view.test.tsx
pnpm exec tsc --noEmit --pretty false
```

## 4. lint 说明
- 本轮相关文件 `eslint` 无 error。
- 仍有若干仓库既有 `no-explicit-any` warning，主要集中在旧测试文件与 `workforce-engine.ts` 历史代码段；本轮未新增新的 lint error。

## 5. 类型检查说明
- `pnpm exec tsc --noEmit --pretty false` 仍存在仓库既有错误：
  - `src/main/services/hooks/manager.ts`
  - `src/renderer/src/components/browser/BrowserShell.tsx`
  - `src/renderer/src/pages/ChatPage.tsx`
  - `tests/e2e/fixtures/electron.ts`
  - `tests/unit/services/browser-view.test.ts`
- 本轮新增的 `WP-05` 相关文件未新增新的 TypeScript 错误。

## 6. 结论
- WP-05 已完成模型选择解释字段设计、主链透传、UI 展示与专项测试闭环。
- 现在可以直接从任务卡片和 Workflow 节点中判断“最终命中哪个来源、为何命中、为何发生回退”。

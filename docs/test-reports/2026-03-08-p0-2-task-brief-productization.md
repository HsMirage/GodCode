# P0-2 任务卡与验收卡产品化 — 验收记录（2026-03-08）

## 目标

- 为中高复杂度任务自动生成结构化任务卡。
- 在 delegate / workforce 执行前把任务卡注入 prompt 与 metadata。
- 让任务详情能直接查看任务卡与验收标准。

## 实现摘要

- 新增任务卡共享合同：`src/shared/task-brief-contract.ts`
- 新增轻量任务卡生成器：`src/main/services/router/task-brief-builder.ts`
- `SmartRouter` 对 delegate / workforce 任务自动生成任务卡并透传：
  - delegate：任务卡注入 prompt，并写入 `Task.metadata.taskBrief`
  - workforce：任务卡写入 `WorkflowOptions.taskBrief`，进入子任务 prompt 与 workflow metadata
- `DelegateEngine` 在真实 `task.id` 创建后回填任务卡 ID，并要求最终输出包含 `TASK_ID` / `ACCEPTANCE_CHECKLIST`
- `WorkforceEngine` 在子任务 prompt 中注入 root task brief，并对齐验收输出要求。
- `TaskDetailDrawer` 新增任务卡展示区块，可直接查看目标与验收标准。

## 验收点对照

- 中高复杂度任务自动形成任务卡：已实现，由 Router 按策略与复杂度自动生成。
- Agent 输出带任务 ID 与验收项对齐：已实现，delegate/workforce prompt 均加入 `TASK_ID` / `ACCEPTANCE_CHECKLIST` 要求。
- 任务卡在 UI 可见：已实现，任务详情抽屉可查看任务卡 ID、目标、验收标准。

## 验证命令

```bash
pnpm vitest tests/unit/services/router/smart-router.test.ts tests/unit/services/router/task-brief-builder.test.ts --run
pnpm typecheck
```

## 验证结果

- 单测通过：2 个文件、19 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 风险与后续

- 当前任务卡为规则/启发式生成，后续可以在 P2 模板库阶段补更强的模板匹配与交互式补全。
- 当前 UI 先在任务详情中展示，后续可继续前置到发任务入口与任务面板列表卡片。

## 结论

- P0-2 已完成本轮实现、测试与验收闭环，可进入 P0-3 Agent 能力边界矩阵。


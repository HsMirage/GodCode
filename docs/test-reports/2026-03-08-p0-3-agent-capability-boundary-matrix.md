# P0-3 Agent 能力边界矩阵 — 验收记录（2026-03-08）

## 目标

- 明确每个 Agent / Category 的默认角色、默认策略、工具边界、风险等级与任务适配范围。
- 让 Router 在路由理由中引用边界矩阵。
- 让 UI 能解释“为什么这个任务被分给它”。

## 实现摘要

- 新增共享边界矩阵：`src/shared/agent-capability-matrix.ts`
- 基于真实 Agent / Category / OpenClaw capability 定义推导：
  - 允许工具
  - 禁止工具
  - 适合任务
  - 不适合任务
  - 风险等级
  - 推荐模型关键词
- `SmartRouter` 路由理由增加 capability boundary 提示。
- `TaskDetailDrawer` 增加“能力边界”区块，展示默认角色、策略、风险和适配范围。
- 产出矩阵文档：`docs/plans/2026-03-08-agent-capability-boundary-matrix.md`

## 验收点对照

- 每个 Agent / Category 都有明确任务边界：已实现。
- 路由层可使用该矩阵辅助决策：已实现，理由链新增 boundary rationale。
- UI 可解释为何任务分配给它：已实现，任务详情抽屉可查看能力边界。

## 验证命令

```bash
pnpm vitest tests/unit/shared/agent-capability-matrix.test.ts tests/unit/services/router/smart-router.test.ts --run
pnpm typecheck
```

## 验证结果

- 单测通过：2 个文件、20 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 结论

- P0-3 已完成本轮实现、测试与验收闭环。


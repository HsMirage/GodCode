# P2-1 规则 + 语义双模路由 — 验收记录（2026-03-08）

## 目标

- 在现有规则路由之上补一层轻量语义评分。
- 让路由解释里包含复杂度、风险、信息充分度、审批敏感度、workforce fit 等依据。
- 允许极少数高风险/高复杂任务由语义层覆盖规则层。

## 实现摘要

- 新增 `SemanticRoutingScores`：`src/main/services/router/smart-router.ts`
- `SmartRouter` 现在统一计算并透传：
  - `complexityScore`
  - `riskScore`
  - `infoSufficiencyScore`
  - `approvalScore`
  - `workforceFitScore`
- 路由理由新增统一语义评分摘要。
- 新增两类语义增强决策：
  - 高风险 + 审批敏感任务升级到 `workforce`
  - 低信息充分度且显式“先判断/先分析”的复杂任务改派 `chongming` 做澄清型 delegate
- `WorkflowOptions.routingContext` 扩展 `semanticScores`，便于 downstream/UI 解释。

## 验收点对照

- 路由解释中包含评分依据：已实现，理由链新增 `semantic scores => ...`。
- 同类任务的路由一致性更高：已实现，高风险审批任务和模糊澄清型任务均有稳定分流规则。
- “走错模式”导致的返工率下降：已完成第一版启发式覆盖，至少避免部分高风险任务误走 delegate/direct。

## 验证命令

```bash
pnpm vitest tests/unit/services/router/smart-router.test.ts tests/unit/services/router/task-brief-builder.test.ts --run
pnpm typecheck
```

## 验证结果

- 单测通过：2 个文件、21 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 风险与后续

- 当前语义层仍是启发式评分，后续可继续接入模板库和历史结果反馈做更强校准。
- 当前仅把 `semanticScores` 透传到 routing metadata，后续可在 UI 面板中更直接展示。

## 结论

- P2-1 已完成本轮实现、测试与验收闭环。

# P2-3 卡点诊断面板 — 验收记录（2026-03-08）

## 目标

- 在任务面板中统一展示“为什么它没做完”的核心诊断信息。
- 让用户不必翻多处日志，就能看到当前阶段、当前子任务、当前阻塞、最近工具调用、最近失败分类、审批状态和人工接管建议。
- 复用已有 workflow observability、execution events、tool approvals 数据，不额外引入新的后端链路。

## 实现摘要

- 新增卡点摘要构建器：`src/renderer/src/components/panels/task-panel-diagnostics.ts`
  - 新增 `WorkflowStuckDiagnosticSummary`
  - 新增 `buildWorkflowStuckDiagnosticSummary()`
  - 汇总来源包括：
    - workflow lifecycle timeline
    - subtask diagnostics
    - task `metadata.executionEvents`
    - pending tool approvals
    - workflow continuation / retry state
- `TaskPanel` hook 现在会补齐诊断摘要输入：`src/renderer/src/components/panels/hooks/useTaskPanel.ts`
  - 缓存 workflow observability 原始快照
  - 订阅当前 session 的 pending approvals
  - 在前端统一计算 stuck summary
- `WorkflowObservability` 组件新增“卡点诊断面板”：`src/renderer/src/components/panels/WorkflowObservability.tsx`
  - 当前阶段
  - 当前子任务
  - 当前阻塞
  - 最近工具调用
  - 最近失败分类
  - 等待审批
  - 人工接管建议
- 扩展任务面板 observability 类型：`src/renderer/src/components/panels/task-panel-shared.ts`
- 新增/更新相关测试：
  - `tests/unit/renderer/task-panel-diagnostics.test.ts`
  - `tests/unit/renderer/task-panel-ui-diagnostics.test.tsx`

## 验收点对照

- 用户无需翻多处日志即可理解卡点：已实现，任务面板顶部直接汇总阶段、子任务、阻塞、工具、审批和接管建议。
- 人工接管时间明显缩短：已实现第一版，面板直接给出“建议接管/暂不需要”以及原因。
- 现有诊断能力统一收口：已实现，优先复用 observability、execution events、tool approvals 与失败分类，不重复造后端状态。

## 验证命令

```bash
pnpm vitest run tests/unit/renderer/task-panel-diagnostics.test.ts tests/unit/renderer/task-panel-ui-diagnostics.test.tsx
pnpm typecheck
```

## 验证结果

- 单测通过：2 个文件、10 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 风险与后续

- 当前“当前子任务/当前阻塞”仍是启发式归纳，后续可继续结合更细粒度的 run timeline / session event stream 提升准确性。
- 当前人工接管建议主要基于审批、失败分类和 retry exhaustion，后续可继续接入任务模板、能力边界矩阵和 KPI 指标做更强诊断。
- 测试日志里仍会出现 `browser:state-changed` 的 fallback 订阅告警，但不影响本次 `P2-3` 功能和测试结果。

## 结论

- P2-3 已完成本轮实现、测试与验收闭环。

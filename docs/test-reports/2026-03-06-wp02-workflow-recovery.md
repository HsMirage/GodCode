# WP-02 Workflow Recovery Controller 验收记录

## 1. 基本信息
- 工作包：`WP-02 Workforce 模块分层`
- 子任务：`抽离 workflow-recovery-controller`
- 日期：`2026-03-06`
- 范围：`src/main/services/workforce/workflow-recovery-controller.ts`、`src/main/services/workforce/workforce-engine.ts`、`tests/unit/services/workforce/workflow-recovery-controller.test.ts`

## 2. 变更摘要
- 将 recovery 失败分类、路由选择、checkpoint halt 恢复判断、目标任务选择、恢复 prompt 构造从 `workforce-engine.ts` 抽离到独立 controller 模块。
- 保留 `executeWorkflow()` 和 `WorkflowResult` 对外协议不变，仅替换内部决策逻辑来源。
- 为 recovery controller 增加模块级单测，并回归 `workforce-engine` 单元/集成测试。

## 3. 验收结果
- 路由决策：`workflow-recovery-controller.test.ts` 覆盖失败分类、subagent-first 路由、checkpoint 恢复目标匹配、prompt 结构化输出。
- 主入口兼容：`tests/unit/services/workforce/workforce-engine.test.ts` 和 `tests/integration/workforce-engine.test.ts` 全绿。
- 兼容性：`executeWorkflow()` 外部签名与 `WorkflowResult` 结构未变，现有调用方无需调整。

## 4. 执行命令
```bash
pnpm exec vitest run tests/unit/services/workforce/workflow-graph-builder.test.ts tests/unit/services/workforce/workflow-scheduler.test.ts tests/unit/services/workforce/workflow-integration-service.test.ts tests/unit/services/workforce/workflow-observability-writer.test.ts tests/unit/services/workforce/workflow-recovery-controller.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/integration/workforce-engine.test.ts
```

## 5. 风险与结论
- 风险：checkpoint orchestration 的循环控制与 recovery 执行编排仍在 `workforce-engine.ts` 内，后续还能再降复杂度。
- 结论：WP-02 第一轮拆分目标已达到可验收状态，核心 graph / scheduler / integration / observability / recovery 决策模块已拆出并完成回归闭环。

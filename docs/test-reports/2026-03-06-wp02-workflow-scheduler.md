# WP-02 Workflow Scheduler 验收记录

## 1. 基本信息
- 工作包：`WP-02 Workforce 模块分层`
- 子任务：`抽离 workflow-scheduler`
- 日期：`2026-03-06`
- 范围：`src/main/services/workforce/workflow-scheduler.ts`、`src/main/services/workforce/workforce-engine.ts`、`tests/unit/services/workforce/workflow-scheduler.test.ts`

## 2. 变更摘要
- 将并发 key 生成、ready task 过滤、公平批次选择、并发上限控制从 `workforce-engine.ts` 抽离到独立 scheduler 模块。
- 保持 `executeWorkflow()` 主循环与外部协议不变，仅替换内部调度委派实现。
- 为 scheduler 增加模块级单测，覆盖并发 key、ready 过滤、per-key 并发限制。

## 3. 验收结果
- 依赖顺序：`tests/unit/services/workforce/workforce-engine.test.ts` 继续验证依赖顺序执行通过。
- 并发限制：`tests/unit/services/workforce/workflow-scheduler.test.ts` 验证同 key 限流仍生效。
- 对外兼容：现有 `workforce-engine` 单测全绿，未改变 `WorkflowResult` 和 `executeWorkflow()` 对外行为。

## 4. 执行命令
```bash
pnpm exec vitest run tests/unit/services/workforce/workflow-graph-builder.test.ts tests/unit/services/workforce/workflow-scheduler.test.ts tests/unit/services/workforce/workforce-engine.test.ts
pnpm exec tsc --noEmit
```

## 5. 风险与结论
- 风险：`workflow-integration-service`、`workflow-recovery-controller`、`workflow-observability-writer` 仍未拆出，`workforce-engine.ts` 体积仍大。
- 备注：`pnpm exec tsc --noEmit` 暴露的是仓库内既有类型错误，位于 `src/main/services/hooks/manager.ts`、`src/renderer/src/pages/ChatPage.tsx`、`tests/e2e/fixtures/electron.ts`、`tests/unit/ipc/task-continuation-ipc.test.ts`，非本次改动引入。
- 结论：`WP-02` 第二个安全切口已完成，可继续进入 integration/recovery 拆分。

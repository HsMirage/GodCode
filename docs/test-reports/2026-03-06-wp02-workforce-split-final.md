# WP-02 Workforce 模块分层 — 最终验收记录

## 1. 基本信息
- 工作包：`WP-02 Workforce 模块分层`
- 日期：`2026-03-06`
- 范围：`src/main/services/workforce/` 全部子模块

## 2. Workforce 阶段图

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Workflow Lifecycle                              │
│                                                                      │
│  ┌──────┐    ┌──────────┐    ┌────────────┐    ┌───────────┐    ┌──────────┐
│  │ plan │───▶│ dispatch  │───▶│ checkpoint │───▶│integration│───▶│ finalize │
│  └──┬───┘    └─────┬────┘    └──────┬─────┘    └─────┬─────┘    └────┬─────┘
│     │              │               │                 │               │
│     ▼              ▼               ▼                 ▼               ▼
│ decomposer    scheduler       recovery          integrator      observability
│ + plan parser + concurrency   controller        + sanitizer     writer
│               + fairness                                         + snapshot
└──────────────────────────────────────────────────────────────────────┘

Task Execution Phases (DAG-enforced):

  ┌───────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐
  │ discovery  │────▶│ plan-review │────▶│ deep-review │────▶│ execution │
  │(qianliyan, │     │ (chongming) │     │  (leigong)  │     │(dayu,zhinv│
  │ diting)    │     │             │     │             │     │ etc.)     │
  └───────────┘     └─────────────┘     └─────────────┘     └───────────┘
       ↑                                                          │
       │              State Machine Constraint:                   │
       │  A task in phase X may only depend on same or earlier    │
       └──────────────────────────────────────────────────────────┘
```

## 3. 拆分前后模块职责对照表

| 模块 | 拆分前位置 | 拆分后文件 | 职责 |
|------|-----------|-----------|------|
| 共享类型 | `workforce-engine.ts` 内联 | `workflow-types.ts` | SubTask, WorkflowResult, WorkflowOptions, SharedContext*, Phase/Stage 枚举, Agent/Category 注册表, 阶段验证函数 |
| 分解/计划解析 | `workforce-engine.ts` 私有方法 | `workflow-decomposer.ts` | parsePlanSubtasks, normalizeDecomposedSubtasks, plan path 解析, markdown path 提取, dependency/hint 解析 |
| DAG 图构建 | `workforce-engine.ts` 内联 | `workflow-graph-builder.ts` | buildWorkflowGraph, validateWorkflowGraph (环检测) |
| 调度器 | `workforce-engine.ts` 内联 | `workflow-scheduler.ts` | getReadyWorkflowTasks, buildDispatchBatch, findNextFairTask, concurrency key/limit |
| 恢复控制器 | `workforce-engine.ts` 内联 | `workflow-recovery-controller.ts` | classifyRecoveryFailure, buildRecoveryRouteSelection, buildRecoveryRepairPrompt, checkpoint halt recovery |
| 集成服务 | `workforce-engine.ts` 内联 | `workflow-integration-service.ts` | buildWorkflowIntegratedResult, buildWorkflowFinalOutput, conflict/unresolved 检测 |
| 可观测性 | `workforce-engine.ts` 内联 | `workflow-observability-writer.ts` | buildWorkflowObservabilitySnapshot, timeline/correlation/assignment/retry/recovery/continuation 快照 |
| 输出净化 | `workforce-engine.ts` 内联 | `output-sanitizer.ts` | sanitizeCompletionOutput |
| 恢复类型 | `workforce-engine.ts` 内联 | `recovery-types.ts` | RecoveryConfig, RecoveryState, RecoveryAttemptRecord, RecoveryClassBudget 等 |
| 主引擎 | `workforce-engine.ts` (4900+ 行) | `workforce-engine.ts` (瘦编排) | executeWorkflow 主循环, orchestrator policy, task dispatch, checkpoint 编排, 事件发射 |

## 4. 新增模块级测试

| 测试文件 | 覆盖模块 | 用例数 |
|---------|---------|-------|
| `workflow-graph-builder.test.ts` | graph 构建/校验 | 3 |
| `workflow-scheduler.test.ts` | 调度/并发/公平 | 原有 |
| `workflow-integration-service.test.ts` | 集成/冲突检测 | 原有 |
| `workflow-observability-writer.test.ts` | 可观测性快照 | 原有 |
| `workflow-recovery-controller.test.ts` | 恢复分类/路由/修复 | 原有 |
| `workflow-decomposer.test.ts` | 分解/计划解析/类型 | 37 |
| `wp02-verification.test.ts` | D 验证项全覆盖 | 15 |
| `workforce-engine.test.ts` | 引擎回归 | 63 |

## 5. 验证结果

### D. 验证
- [x] 验证 plan file 模式：parsePlanSubtasksFromContent 正确解析 checkbox, 依赖链, agent/category 提示
- [x] 验证自动分解模式：normalizeDecomposedSubtasks 正确归一化 LLM 输出, 异常输入兜底
- [x] 验证 DAG 依赖执行顺序（第一轮已通过）
- [x] 验证并发上限仍生效（第一轮已通过）
- [x] 验证 retry 仍可触发：createRetryState / calculateBackoffDelay / classifyError / isRetryable 回归通过
- [x] 验证 recovery metadata 仍写入：classifyRecoveryFailure / buildRecoveryRouteSelection / buildRecoveryRepairPrompt 回归通过
- [x] 验证 observability 输出仍可被前端读取：buildWorkflowObservabilitySnapshot 生成完整快照, 含 graph/timeline/assignments/retry/recovery/continuation
- [x] 补 scheduler / graph / integration 的模块级测试（第一轮已通过）
- [x] 补 decomposer / types 的模块级测试（37 + 15 新增）

## 6. 风险与结论

- **风险**：`executeWorkflow()` 主循环仍较重（约 1600 行），checkpoint orchestration 与部分恢复执行编排仍留在 `workforce-engine.ts`。后续可考虑继续收敛 checkpoint 主循环。
- **结论**：WP-02 已完成全部拆分设计（含 decomposer, 共享类型归属, 执行阶段枚举与状态机边界）、全部验证项、全部收尾文档。可进入下一工作包。

## 7. 执行命令

```bash
pnpm exec vitest run tests/unit/services/workforce/ --reporter=verbose
```

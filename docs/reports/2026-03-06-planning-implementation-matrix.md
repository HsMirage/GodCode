# 规划-实现-测试-验收矩阵

> 将项目规划条目映射到当前代码入口、测试入口和验收证据。

## 矩阵

| # | 规划条目 | 代码入口 | 测试入口 | 验收文档 | 状态 |
|---|---------|---------|---------|---------|------|
| 1 | 消息执行主链 | `src/main/ipc/handlers/message.ts`、`src/main/services/message/*.ts` | `tests/unit/ipc/message-ipc.test.ts` | `docs/reports/wp-01-message-chain-refactor-2026-03-06.md` | ✅ 完成 |
| 2 | Workforce 任务分解 | `src/main/services/workforce/workforce-engine.ts`、`workflow-decomposer.ts` | `tests/unit/services/workforce/workflow-decomposer.test.ts`、`workforce-engine.test.ts` | `docs/test-reports/2026-03-06-wp02-workforce-split-final.md` | ✅ 完成 |
| 3 | Workflow DAG 构建 | `src/main/services/workforce/workflow-graph-builder.ts` | `tests/unit/services/workforce/workflow-graph-builder.test.ts` | `docs/test-reports/2026-03-06-wp02-workflow-graph-builder.md` | ✅ 完成 |
| 4 | Workflow 调度器 | `src/main/services/workforce/workflow-scheduler.ts` | `tests/unit/services/workforce/workflow-scheduler.test.ts` | `docs/test-reports/2026-03-06-wp02-workflow-scheduler.md` | ✅ 完成 |
| 5 | Workflow 恢复控制器 | `src/main/services/workforce/workflow-recovery-controller.ts` | `tests/unit/services/workforce/workflow-recovery-controller.test.ts` | `docs/test-reports/2026-03-06-wp02-workforce-split-final.md` | ✅ 完成 |
| 6 | Workflow 集成服务 | `src/main/services/workforce/workflow-integration-service.ts` | `tests/unit/services/workforce/workflow-integration-service.test.ts` | `docs/test-reports/2026-03-06-wp02-workforce-split-final.md` | ✅ 完成 |
| 7 | Workflow 可观测性 | `src/main/services/workforce/workflow-observability-writer.ts` | `tests/unit/services/workforce/workflow-observability-writer.test.ts` | `docs/test-reports/2026-03-06-wp02-workforce-split-final.md` | ✅ 完成 |
| 8 | 恢复链统一 | `src/shared/recovery-contract.ts`、`session-*.service.ts`、`auto-resume-trigger.service.ts` | `tests/unit/services/session-continuity.service.test.ts`、`auto-resume-trigger.test.ts` | `docs/reports/2026-03-06-wp03-recovery-unification.md` | ✅ 完成 |
| 9 | BrowserView 稳定性 | `src/main/services/browser-view.service.ts`、`BrowserShell.tsx` | `tests/unit/renderer/browser-panel-lifecycle.test.ts` | `docs/reports/2026-03-06-wp04-browserview-stability.md` | ✅ 完成 |
| 10 | 模型选择解释性 | `src/shared/model-selection-contract.ts`、`model-selection.service.ts` | `tests/unit/services/llm/model-selection.service.test.ts` | `docs/reports/2026-03-06-wp05-model-selection-explainability.md` | ✅ 完成 |
| 11 | Hook 治理产品化 | `src/shared/hook-governance-contract.ts`、`src/main/services/hooks/governance.ts` | `tests/unit/services/hooks/manager.test.ts` | `docs/reports/2026-03-06-wp06-hook-governance-productization.md` | ✅ 完成 |
| 12 | IPC Gateway 收敛 | `src/renderer/src/api.ts` (messageApi, sessionApi, workflowApi, settingsApi, artifactApi, spaceApi, skillApi) | TypeScript 编译验证 | `docs/test-reports/2026-03-06-wp07-ipc-gateway-refactor.md` | ✅ 完成 |
| 13 | ChatPage 拆分 | `src/renderer/src/hooks/useChatMessages.ts`、`ChatPage.tsx` | TypeScript 编译 + 回归 | `docs/test-reports/2026-03-06-wp07-ipc-gateway-refactor.md` | ✅ 完成 |
| 14 | SettingsPage hooks | `src/renderer/src/hooks/useHookGovernance.ts`、`useContinuationConfig.ts` | TypeScript 编译验证 | `docs/test-reports/2026-03-06-wp07-ipc-gateway-refactor.md` | ✅ 完成 |
| 15 | 数据库 bootstrap 收敛 | `src/main/services/database.ts` | `tests/unit/services/database.test.ts` | `docs/reports/2026-03-06-wp08-database-bootstrap.md` | ✅ 完成 |
| 16 | Trace 可观测性 | `src/shared/trace-contract.ts` | — | — | 🔶 设计完成，待注入 |
| 17 | Delegate 引擎 | `src/main/services/delegate/delegate-engine.ts` | `tests/unit/services/delegate/delegate-engine.test.ts` | — | ✅ 存在 |
| 18 | LLM 适配器 | `src/main/services/llm/factory.ts`、`anthropic.adapter.ts`、`gemini.adapter.ts`、`openai.adapter.ts` | `tests/unit/services/llm/` | — | ✅ 存在 |
| 19 | 工具系统 | `src/main/services/tools/index.ts` | `tests/unit/services/tools/` | `docs/reports/source-of-truth-matrix.md` | ✅ 存在 |
| 20 | AI Browser 自动化 | `src/main/services/ai-browser/` | `tests/unit/services/ai-browser/`、`tests/integration/browser-automation.test.ts` | — | ✅ 存在 |

## 持续更新规则

1. 每完成一个新工作包，在此矩阵新增对应行
2. 代码入口变更时同步更新路径
3. 测试覆盖率变化时更新测试入口
4. 每个工作包闭环后标记验收文档路径

## 更新记录

| 日期 | 更新内容 |
|------|---------|
| 2026-03-06 | 初始创建，覆盖 WP-01 ~ WP-08 全部条目 |

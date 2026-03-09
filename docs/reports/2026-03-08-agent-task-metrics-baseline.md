# 第一版任务完成率指标表（2026-03-08）

## 指标定义

| 指标 | 公式 | 数据源 | 当前状态 |
|---|---|---|---|
| 任务完成率 | `completedTasks / totalTasks * 100` | `Task.status` | 已定义 |
| 一次通过率 | `firstPassTasks / totalTasks * 100` | `Task.metadata`, `Run.logs` | 已定义 |
| 平均重试次数 | `retryCount / totalTasks` | `Workflow retry state`, `Run.logs` | 已定义 |
| 人工接管率 | `manualTakeovers / totalTasks * 100` | `Task.metadata`, `UI diagnostics` | 已定义 |
| 高风险动作审批命中率 | `approvalHits / approvalRequiredActions * 100` | `AuditLog`, `Task.metadata.toolApproval` | 已定义 |
| 越界修改率 | `scopeViolations / totalTasks * 100` | `Task brief`, `Artifacts`, `Acceptance review` | 已定义 |
| 中途丢失上下文率 | `contextLossIncidents / totalTasks * 100` | `SessionState`, `Execution events` | 已定义 |
| 跨会话恢复成功率 | `crossSessionRecoverySuccesses / crossSessionRecoveryAttempts * 100` | `SessionState`, `Recovery metadata` | 已定义 |

## 代码落点

- 指标定义与计算：`src/shared/task-readiness-metrics.ts`
- 中间事件来源：`src/main/services/execution-event-persistence.service.ts`
- 审批事件来源：`src/main/services/tools/tool-approval.service.ts`
- 恢复来源：`src/main/services/session-continuity.service.ts`

## 当前结论

- 第一版指标表已建立，已具备统一字段、公式与代码化定义。
- 当前仓库尚未接入自动聚合报表任务，因此本轮先完成“定义标准化 + 计算 helper + 文档基线”。
- 后续可在仪表盘或诊断面板中直接消费 `src/shared/task-readiness-metrics.ts`。


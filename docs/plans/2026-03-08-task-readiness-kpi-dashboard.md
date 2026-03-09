# 任务级 KPI 仪表盘方案（2026-03-08）

> 对应任务：P3-2 建立任务级 KPI 仪表盘

## 目标

- 把已有任务完成率指标真正落到可查看的仪表盘视图中。
- 支持按版本保存 KPI 快照，并在后续版本中直接看到趋势变化。
- 支持根据指标变化快速判断更可能是 `Router`、`Delegate`、`Workforce`、`Tool` 还是 `UI` 层退化。

## 当前实现范围

- 新增共享 KPI 仪表盘模型与趋势计算：`src/shared/task-readiness-dashboard.ts`
- 新增版本号元信息：`src/shared/app-meta.ts`
- 新增任务面板历史与实时快照构建：`src/renderer/src/components/panels/task-readiness-dashboard-history.ts`
- 在任务面板可观测性区域新增 KPI 仪表盘：`src/renderer/src/components/panels/TaskReadinessDashboard.tsx`

## 当前数据来源

- 任务完成率：`Task.status`
- 一次通过率：`WorkflowObservability.retryState` + `Task.status`
- 平均重试次数：`WorkflowObservability.retryState.totalRetried`
- 人工接管率：失败诊断分类 + retry exhausted 信号
- 审批命中率：`tool-approval:list` + `pending_approval` 任务数
- 中途丢失上下文率：`recoveryStage / resumeReason`
- 跨会话恢复成功率：带 recovery metadata 的任务状态
- 越界修改率：本轮仍待自动化验收数据源接入

## 版本历史

- 本轮使用浏览器本地存储保存每个版本最近一次 KPI 快照。
- 存储键：`codeall.task-readiness.dashboard.history`
- 每个版本保留一个最新快照；历史默认最多保留 12 个版本。

## 分层退化定位规则

- `Router`：主要观察越界修改率
- `Delegate`：主要观察任务完成率 / 一次通过率 / 人工接管率
- `Workforce`：主要观察平均重试次数 / 人工接管率
- `Tool`：主要观察审批命中率
- `UI`：主要观察上下文丢失率 / 跨会话恢复成功率

## 当前限制

- 由于当前还没有统一的越界修改审查事件流，`Router` 退化定位仍会显示“数据不足”。
- 审批命中率、人工接管率、恢复成功率目前属于第一版估算口径，后续可继续接入审计和 Run 日志增强精度。


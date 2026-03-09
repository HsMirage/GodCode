# 第一版任务级 KPI 仪表盘（2026-03-08）

## 交付结果

- 任务面板 `可观测性概览` 中新增 `任务 KPI 仪表盘`。
- 支持记录当前版本 KPI 快照，并与历史版本快照比较趋势。
- 支持按层输出退化定位结论：`Router` / `Delegate` / `Workforce` / `Tool` / `UI`。

## 代码落点

- 仪表盘共享模型：`src/shared/task-readiness-dashboard.ts`
- 版本号元信息：`src/shared/app-meta.ts`
- 历史存储与实时快照：`src/renderer/src/components/panels/task-readiness-dashboard-history.ts`
- 仪表盘 UI：`src/renderer/src/components/panels/TaskReadinessDashboard.tsx`
- 任务面板接入：`src/renderer/src/components/panels/WorkflowObservability.tsx`

## 当前结论

- 第一版仪表盘已具备趋势计算与分层退化定位能力。
- 第一版已经支持“首个版本建立基线、后续版本自动比较”的工作方式。
- 当前仍有 1 项指标待补数据源：越界修改率。


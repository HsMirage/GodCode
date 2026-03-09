# 第一版 Agent 任务能力基准集（2026-03-08）

## 当前基准任务

| ID | 维度 | 期望路由 | 审批 | 允许工具 |
|---|---|---|---|---|
| `B01-simple-bug-fix` | 简单代码任务 | `direct-enhanced / luban / dayu` | 否 | `read` `edit` `grep` |
| `B02-cross-module-feature` | 跨模块实现任务 | `workforce / haotian / dayu` | 否 | `read` `edit` `grep` `bash` |
| `B03-readonly-architecture-review` | 只读分析任务 | `direct-enhanced / baize` | 否 | `read` `glob` `grep` |
| `B04-sensitive-config-change` | 高风险审批任务 | `workforce / kuafu / dayu` | 是 | `read` `edit` `bash` |
| `B05-browser-data-extraction` | 浏览器自动化任务 | `direct-enhanced / luban` | 否 | `browser_navigate` `browser_click` `browser_fill` `browser_extract` `browser_snapshot` |
| `B06-recovery-after-refresh` | 恢复/续跑任务 | `workforce / kuafu / dayu` | 否 | `read` `edit` `bash` |
| `B07-release-preflight` | 发布验收任务 | `workforce / haotian / dayu` | 是 | `read` `bash` |

## 当前结论

- 第一版基准集已覆盖 P3-1 规划中的 7 个核心维度。
- 每个基准任务都具备统一记录字段，后续可按版本累积结果。
- 审批型任务已单独纳入基准集，可用于验证审批命中率与续跑质量。
- 恢复/续跑与发布验收任务也已纳入，便于衡量平台级自治执行能力。

## 代码落点

- 定义与汇总：`src/shared/task-benchmark-suite.ts`
- 后续可与指标体系联动：`src/shared/task-readiness-metrics.ts`

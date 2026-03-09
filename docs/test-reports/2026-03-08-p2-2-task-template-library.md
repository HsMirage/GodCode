# P2-2 任务类型模板库 — 验收记录（2026-03-08）

## 目标

- 为常见任务类型建立可复用模板库。
- 让 Router、任务卡和后续 UI/面板可以共享同一套模板定义。
- 至少覆盖 bug 修复、小功能开发、重构、文档、测试补齐、发版验证、浏览器自动化 7 类模板。

## 实现摘要

- 新增共享模板库：`src/shared/task-template-library.ts`
- 模板字段包含：
  - 默认策略
  - 推荐 Category/Sub-agent
  - 建议工具范围
  - 风险级别
  - 默认验收标准
- `SmartRouter` 现在会：
  - 自动匹配模板
  - 将模板写入 `metadata.taskTemplate`
  - 在 direct 路由场景下使用模板默认策略做兜底
- `buildStructuredTaskBrief()` 现在支持模板默认验收项和模板标识：
  - `templateKey`
  - `templateLabel`
- 任务卡 markdown 会显示命中的模板名称。

## 验收点对照

- 已有统一模板库：已实现。
- 模板可被路由与任务卡复用：已实现。
- 模板任务输出更稳定、更便于验收：已实现第一版，任务卡会自动继承模板验收标准。

## 验证命令

```bash
pnpm vitest tests/unit/services/router/smart-router.test.ts tests/unit/services/router/task-brief-builder.test.ts --run
pnpm typecheck
```

## 验证结果

- 单测通过：2 个文件、23 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 风险与后续

- 当前模板匹配仍是规则命中，后续可结合语义路由分值和历史完成率做更精确选择。
- 当前模板主要服务于路由与任务卡，后续可继续前置到发任务入口供用户显式套用。

## 结论

- P2-2 已完成本轮实现、测试与验收闭环。

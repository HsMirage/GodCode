# P1-1 中间执行过程持久化 — 验收记录（2026-03-08）

## 目标

- 持久化关键中间执行事件，减少长任务刷新/中断后的信息丢失。
- 至少覆盖：工具调用请求/完成、审批暂停/恢复、消息流启动/分块、workflow checkpoint。

## 实现摘要

- 新增事件合同：`src/shared/execution-event-contract.ts`
- 新增持久化服务：`src/main/services/execution-event-persistence.service.ts`
- 事件落点：
  - Task metadata：`executionEvents`
  - Session continuity context：`executionEvents`
- 已接入的事件源：
  - `tool-call-requested`
  - `tool-call-completed`
  - `run-paused`
  - `tool-call-approved`
  - `tool-call-rejected`
  - `run-resumed`
  - `message-stream-started`
  - `llm-response-chunked`
  - `checkpoint-saved`
- `TaskDetailDrawer` 新增“执行事件”区块，支持从持久化 metadata 回看关键中间态。

## 验收点对照

- 关键中间态可持久化：已实现，关键事件进入 task/session 持久上下文。
- 刷新后可回看最近任务中间态：已实现，任务详情可查看最近执行事件。
- 审计与接管更容易：已实现，审批暂停/恢复与工具调用过程均有结构化事件。

## 验证命令

```bash
pnpm vitest tests/unit/services/tools/tool-execution.service.test.ts tests/unit/services/message/message-stream.service.test.ts --run
pnpm typecheck
```

## 验证结果

- 单测通过：2 个文件、26 条测试全部通过。
- 类型检查通过：`pnpm typecheck` 通过。

## 风险与后续

- 当前事件持久化优先覆盖任务主链关键事件，后续可继续扩展 direct message 的完整 UI 回放与更细粒度 chunk 聚合策略。
- 当前事件以 JSON 数组形式保存在 task/session 上，后续若规模扩大可演进为独立事件表。

## 结论

- P1-1 已完成本轮实现、测试与验收闭环。


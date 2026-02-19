# 05 信息流总览

## 三条主线
- Prompt 流：从模板定义到注入与发送。
- 控制流：从事件驱动到任务状态迁移与通知。
- 状态流：从 session/message 存储到恢复与一致性维护。

## Prompt 流
1. Prompt 定义与拼装来自 agents/tools 层：`src/agents/dynamic-agent-prompt-builder.ts:175`、`src/tools/delegate-task/prompt-builder.ts:8`。
2. 组合后的 system/user content 进入发送路径：`src/tools/delegate-task/sync-prompt-sender.ts:21`、`src/features/background-agent/manager.ts:327`。
3. hook 可在发送前后注入补充内容：`src/features/hook-message-injector/injector.ts:114`。
4. 最终由 session.promptAsync 分发到子会话/模型，并返回消息流。

## 控制流
1. 运行态事件统一由 `processEvents` 分发：`src/cli/run/event-stream-processor.ts:15`。
2. session.idle / session.error / tool events 驱动状态推进：`src/cli/run/event-stream-processor.ts:32`~`38`。
3. BackgroundManager 维护 pending/running/completed/interrupt/cancelled：`src/features/background-agent/manager.ts:129`、`src/features/background-agent/manager.ts:1057`。
4. 完成后进入 parent 通知队列（按 parent 串行）：`src/features/background-agent/manager.ts:1591`。

## 状态流
1. 运行态状态对象：`EventState`（idle/error/meaningfulWork/messageCount）：`src/cli/run/event-state.ts:1`。
2. Hook 消息注入器维护 message/part 存储并做字段回填：`src/features/hook-message-injector/injector.ts:13`、`src/features/hook-message-injector/injector.ts:136`。
3. session-recovery storage 提供消息/parts 读取与修复操作：`src/hooks/session-recovery/storage.ts:1`。
4. context window monitor 以 tokens 使用率注入提醒，影响后续行为节奏：`src/hooks/context-window-monitor.ts:33`、`src/hooks/context-window-monitor.ts:67`。

## 观测点与调试入口
- 事件层：`src/cli/run/event-stream-processor.ts:20`（逐事件处理）。
- 任务层：`src/features/background-agent/manager.ts:1396`（polling 主循环）。
- 注入层：`src/features/hook-message-injector/injector.ts:114`（hook message 注入）。
- 技能层：`src/tools/skill/tools.ts:166`（skill execute）与 `src/tools/slashcommand/slashcommand-tool.ts:65`（slashcommand execute）。

## 关键一致性约束
- prompt 发送失败必须进入统一错误格式并释放资源。
- task 完成必须先写状态再释放并发槽，再通知父会话。
- recovery 与注入逻辑必须保证 message/part 元数据可回溯。
- 事件处理与后台轮询是“前台即时 + 后台兜底”的双轨机制。

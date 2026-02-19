# 04 Agent 团队编排

## 角色分层
- planner 层：负责策略、分类与计划模板（prometheus/atlas prompt 层）。
- orchestrator 层：负责 session、队列、并发、事件路由（background manager / tmux manager）。
- worker 层：负责子代理同步/异步执行（call-omo-agent sync/background executor）。
- transport 层：负责 prompt 发送、消息轮询、结果抽取与通知。

## 调度决策点
### BackgroundManager（核心调度）
- 任务创建与排队：`src/features/background-agent/manager.ts:116`、`src/features/background-agent/manager.ts:155`。
- 并发 key 维度（agent 或 provider/model）：`src/features/background-agent/manager.ts:411`。
- 会话创建与 promptAsync 下发：`src/features/background-agent/manager.ts:245`、`src/features/background-agent/manager.ts:327`。
- 轮询与稳定性判定：`src/features/background-agent/manager.ts:1396`、`src/features/background-agent/manager.ts:1475`。
- 完成通知与批量完成提醒：`src/features/background-agent/manager.ts:1102`、`src/features/background-agent/manager.ts:1147`。

### Spawner / Task 启停
- start/resume 任务入口：`src/features/background-agent/spawner.ts:35`、`src/features/background-agent/spawner.ts:164`。
- 会话权限继承并强制 deny question：`src/features/background-agent/spawner.ts:61`、`src/features/background-agent/spawner.ts:65`。
- fire-and-forget prompt 触发：`src/features/background-agent/spawner.ts:143`。

### TmuxSessionManager（可视化并发编排）
- 状态优先架构（query → decide → execute）：`src/features/tmux-subagent/manager.ts:41`。
- 根据 pane 容量决策 spawn/replace/close：`src/features/tmux-subagent/manager.ts:182`、`src/features/tmux-subagent/manager.ts:206`。
- session ready 检查与跟踪：`src/features/tmux-subagent/manager.ts:100`、`src/features/tmux-subagent/manager.ts:227`。

### call-omo-agent（worker 执行）
- 异步执行入口：`src/tools/call-omo-agent/background-agent-executor.ts:9`。
- 同步执行入口：`src/tools/call-omo-agent/sync-executor.ts:24`。
- 同步路径会等待 session 完成并抽取增量输出：`src/tools/call-omo-agent/sync-executor.ts:51`、`src/tools/call-omo-agent/sync-executor.ts:53`。

## 并行与重试
### 异步链路
1. 上层工具发起 background launch：`src/features/background-agent/manager.ts:116`。
2. manager 创建子会话并 promptAsync：`src/features/background-agent/manager.ts:245`、`src/features/background-agent/manager.ts:327`。
3. pollRunningTasks 监测 idle/stability/todo：`src/features/background-agent/manager.ts:1400`、`src/features/background-agent/manager.ts:1510`。
4. 完成后 notify parent 并输出 task_id 结果入口：`src/features/background-agent/manager.ts:1102`。

### 同步链路
1. resolve/create session：`src/tools/call-omo-agent/sync-executor.ts:29`。
2. 发送 prompt 到 subagent：`src/tools/call-omo-agent/sync-executor.ts:43`。
3. waitForSessionCompletion 轮询：`src/tools/call-omo-agent/sync-executor.ts:57`。
4. 拉取 messages 并抽取输出：`src/tools/call-omo-agent/sync-executor.ts:53`、`src/tools/call-omo-agent/sync-executor.ts:55`。

## 续跑与恢复
1. planner 先在工具层解析 category 与模型偏好，形成续跑任务上下文：`src/tools/delegate-task/category-resolver.ts:1`、`src/tools/delegate-task/model-selection.ts:1`。
2. orchestrator 在 spawner 恢复入口重建会话/任务关联，并继承执行权限：`src/features/background-agent/spawner.ts:164`、`src/features/background-agent/spawner.ts:61`。
3. manager 根据 sessionId 与 task 元数据恢复运行态，并进入轮询主循环：`src/features/background-agent/manager.ts:245`、`src/features/background-agent/manager.ts:1396`。
4. pollRunningTasks 通过 idle 稳定判定 + todo 检查决定继续等待或推进完成：`src/features/background-agent/manager.ts:1475`、`src/features/background-agent/manager.ts:1510`。
5. 若检测到 stale/TTL 超时，触发中断与清理，避免僵尸任务占用并发槽：`src/features/background-agent/manager.ts:1298`、`src/features/background-agent/manager.ts:1352`。
6. worker 在同步路径可继续等待子会话并抽取增量输出，保证“恢复后可见结果”：`src/tools/call-omo-agent/sync-executor.ts:51`、`src/tools/call-omo-agent/sync-executor.ts:53`。
7. transport 在完成态写入后执行父会话串行通知，保证最终一致性可追踪：`src/features/background-agent/manager.ts:1057`、`src/features/background-agent/manager.ts:1591`。

## 失败处理与韧性策略
- prompt 发送失败统一进入 interrupt/cancelled 路径并释放并发槽：`src/features/background-agent/manager.ts:342`、`src/features/background-agent/manager.ts:355`。
- stale timeout 与 TTL 清理避免僵尸任务：`src/features/background-agent/manager.ts:1298`、`src/features/background-agent/manager.ts:1352`。
- 会话删除事件触发级联取消：`src/features/background-agent/manager.ts:739`、`src/features/background-agent/manager.ts:755`。
- 通知队列按 parent 串行化，降低竞态：`src/features/background-agent/manager.ts:1591`。

## 端到端场景复盘
场景：用户触发一个需要子代理并行处理的任务，系统完成“下发→执行→回收→通知”闭环。

1. 入口工具创建后台任务并返回 task_id：`src/tools/background-task/create-background-task.ts:1`。
2. spawner 为任务创建/恢复子会话并触发 promptAsync：`src/features/background-agent/spawner.ts:35`、`src/features/background-agent/spawner.ts:143`。
3. manager 将任务从 pending 推进到 running，并按 concurrencyKey 执行并发配额：`src/features/background-agent/manager.ts:155`、`src/features/background-agent/manager.ts:411`。
4. 子代理执行过程中，poller 持续读取 session 状态与消息游标：`src/features/background-agent/manager.ts:1396`、`src/features/background-agent/manager.ts:1400`。
5. 当 session 进入 idle 时，不直接完成，先进行稳定性窗口与 todo 校验：`src/features/background-agent/manager.ts:1475`、`src/features/background-agent/manager.ts:1510`。
6. 校验通过后写入 completed 并释放并发槽，异常路径写 interrupt/cancelled：`src/features/background-agent/manager.ts:1057`、`src/features/background-agent/manager.ts:342`。
7. 结果由输出模块格式化后提供 task_output 查询：`src/tools/background-task/modules/background-output.ts:1`、`src/tools/background-task/task-result-format.ts:1`。
8. manager 将完成事件串行通知父会话，形成最终一致性闭环：`src/features/background-agent/manager.ts:1102`、`src/features/background-agent/manager.ts:1591`。

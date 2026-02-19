# 04 Agent 团队编排

## 分层职责
- planner 层：负责策略、分类与计划模板（prometheus/atlas prompt 层）。
- orchestrator 层：负责 session、队列、并发、事件路由（background manager / tmux manager）。
- worker 层：负责子代理同步/异步执行（call-omo-agent sync/background executor）。
- transport 层：负责 prompt 发送、消息轮询、结果抽取与通知。

## 关键组件与职责
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
- 同步执行入口：`src/tools/call-omo-agent/sync-agent-executor.ts:24`。
- 同步路径会等待 session 完成并抽取增量输出：`src/tools/call-omo-agent/sync-agent-executor.ts:57`、`src/tools/call-omo-agent/sync-agent-executor.ts:82`。

## 端到端流程（同步 / 异步）
### 异步链路
1. 上层工具发起 background launch：`src/features/background-agent/manager.ts:116`。
2. manager 创建子会话并 promptAsync：`src/features/background-agent/manager.ts:245`、`src/features/background-agent/manager.ts:327`。
3. pollRunningTasks 监测 idle/stability/todo：`src/features/background-agent/manager.ts:1400`、`src/features/background-agent/manager.ts:1510`。
4. 完成后 notify parent 并输出 task_id 结果入口：`src/features/background-agent/manager.ts:1102`。

### 同步链路
1. resolve/create session：`src/tools/call-omo-agent/sync-agent-executor.ts:29`。
2. 发送 prompt 到 subagent：`src/tools/call-omo-agent/sync-agent-executor.ts:43`。
3. waitForSessionCompletion 轮询：`src/tools/call-omo-agent/sync-agent-executor.ts:57`。
4. 拉取 messages 并抽取输出：`src/tools/call-omo-agent/sync-agent-executor.ts:71`、`src/tools/call-omo-agent/sync-agent-executor.ts:82`。

## 角色协同（planner / orchestrator / worker）
- planner 通过 prompt 与 category 决策产出任务意图。
- orchestrator 将任务映射为 session 与并发队列，并维护状态一致性。
- worker 执行实际调用并回传结构化输出。
- transport 统一处理发送、重试、通知、结果抽取。

## 失败处理与韧性策略
- prompt 发送失败统一进入 interrupt/cancelled 路径并释放并发槽：`src/features/background-agent/manager.ts:342`、`src/features/background-agent/manager.ts:355`。
- stale timeout 与 TTL 清理避免僵尸任务：`src/features/background-agent/manager.ts:1298`、`src/features/background-agent/manager.ts:1352`。
- 会话删除事件触发级联取消：`src/features/background-agent/manager.ts:739`、`src/features/background-agent/manager.ts:755`。
- 通知队列按 parent 串行化，降低竞态：`src/features/background-agent/manager.ts:1591`。

## 关键不变量
- running 任务必须持有 concurrencyKey；完成/异常必须 release。
- session.idle 不能直接等价完成，必须经过输出有效性与 todo 校验。
- parent 通知是最终一致性通道，不影响任务完成状态落盘。

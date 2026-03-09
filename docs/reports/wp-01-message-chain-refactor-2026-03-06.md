# WP-01 消息执行主链收敛（2026-03-06）

## 调用图

`src/main/ipc/handlers/message.ts`
→ `message-runtime-context.service.ts`
→ `message-persistence.service.ts`
→ `message-stream.service.ts`
→ `message-execution.service.ts`
→ `message-finalizer.service.ts`

## 模块职责

- `message-runtime-context.service.ts`：输入归一化、技能命令解析、agent/strategy/workspace 解析。
- `message-persistence.service.ts`：user / assistant message 持久化，以及 `Session.updatedAt` 同步。
- `message-stream.service.ts`：流控制器、chunk/error/done 发射、重试通知转发、abort 收口。
- `message-execution.service.ts`：direct 路径的 LLM + hooks + tools 执行，以及 delegate/workforce 路由分流。
- `message-finalizer.service.ts`：assistant 结果收尾、FuXi 规划交接、最终落库。

## 验证结果

- 通过 `tests/integration/chat-ipc.test.ts` 覆盖普通 direct、skill、模型选择、FuXi handoff、流式 chunk 与 usage 回归路径。
- 新增 `tests/unit/services/message/message-persistence.service.test.ts`，校验消息与 `Session.updatedAt` 一致更新。
- 新增 `tests/unit/ipc/message-ipc.test.ts`，校验 `handleMessageSend` 薄编排、`handleMessageAbort()` 取消链路、`handleMessageList()` 查询链路。
- 新增 `tests/unit/services/message/message-execution.service.test.ts`，校验 routed `delegate` / `workforce` 两条消息执行链路。
- 新增 `tests/unit/services/message/message-stream.service.test.ts`，校验 stream chunk/error/usage 发射、retry notice 转发、active stream abort。

## 风险与遗留

- 真实 provider 的 usage 数据精度仍受各 SDK/流式协议返回能力影响，后续可继续补 provider 级精度测试。
- `message.ts` 已转为薄入口，但 `handleMessageAbort()` 相关后台任务取消逻辑仍在 handler 内，后续可继续下沉。

## 结论

- WP-01 已完成第一轮主链拆分、usage 推送补齐与验收闭环；当前仅保留后续增强项，不阻塞进入下一个工作包。

## 2026-02-11 Session: ses_3b40921acffemQx1LTvQI522GX

- Plan started: multi-agent-architecture-overhaul
- 9 tasks, 4 waves parallel execution
- Strategy: 先通后美

## 2026-02-11 Session Isolation Fix Learnings

- Session must be threaded end-to-end from IPC entry (`handleMessageSend.input.sessionId`) → `SmartRouter.route()` → `WorkforceEngine.executeWorkflow()` / `DelegateEngine.delegateTask()`; any missing hop silently breaks task visibility in UI queries.
- `getOrCreateDefaultSession()` should remain available for system/internal fallback surfaces, but user-driven routing paths must rely on explicit `sessionId` to avoid cross-session task writes.
- Keeping route/engine signatures backward-compatible at type level (optional context/input) while enforcing runtime session presence in execution paths helps unblock typecheck without reintroducing the default-session write bug.

## 2026-02-11 ArtifactRail 挂载

- `useUIStore` 已有 `showArtifactRail/toggleArtifactRail` 状态，可直接复用做可折叠侧栏开关，无需新增 store 字段。
- `MainLayout` 的 `react-resizable-panels` 外层分组可以安全插入 `artifact` panel（位于 chat 与 task/browser 之间），并通过 `outerPanelIds` 条件包含来避免布局错位。
- `ArtifactRail` 原本从 `useDataStore` 内取 session；扩展为可选 `sessionId` prop（`prop ?? store` 回退）后可显式绑定当前会话，同时保持旧调用兼容。
- 点击 ArtifactRail 文件后会触发 `setView('canvas')`，因此与 `ContentCanvas` 预览链路可直接打通，无需改 IPC/store。

## 2026-02-11 Direct 模式 Agent 注入 Learnings

- `handleMessageSend` 在 `strategy === 'direct' || 'direct-enhanced'` 分支可直接基于 `agentCode` 注入系统提示词：通过 `getAgentPromptByCode(agentCode)` 获取模板并在发送给 LLM 前 prepend 一个 `role: 'system'` 消息即可，不需要改 adapter。
- Agent 工具配置来源于 `src/shared/agent-definitions.ts`，但运行时工具名与定义名存在别名差异（如 `read/write/edit` → `file_read/file_write`，`delegate_task` 无 runtime tool），需要先做 alias 映射再过滤为实际可注册工具名。
- 为了让各 provider adapter（OpenAI/Anthropic/Gemini）在不改 tool loop 的情况下按 Agent 暴露工具，可在 `toolExecutionService` 增加基于 `AsyncLocalStorage` 的 scoped allowlist：
  - `getToolDefinitions()` 在作用域内只返回 allowlist 工具
  - `executeTool()` 在作用域内拒绝非 allowlist 工具
  - direct 流式调用用 `withAllowedTools(...)` 包裹即可实现“按 Agent 暴露工具 + 执行约束”
- 兼容性策略：当 `agentCode` 缺失 / 为 `default` / 无法解析到 Agent 定义时，不注入系统提示词、不启用工具作用域，保持原有纯聊天行为。

## 2026-02-11 HookManager 接入工具执行管道

- `HookManager` 是单例：`HookManager.getInstance()` + `export const hookManager = HookManager.getInstance()`；启动阶段可通过访问 `hookManager` 直接完成实例初始化。
- Hook 注册方式为 `register` / `registerMany`，并支持 `unregister`、`enable`、`disable` 和按事件优先级排序的 `getByEvent`。
- 当前框架定义的 5 类事件为：`onToolStart`、`onToolEnd`、`onMessageCreate`、`onContextOverflow`、`onEditError`。
- 工具管道接入点放在统一 `ToolExecutionService.executeToolCalls()`：每个 tool call 执行前触发 `emitToolStart`，执行后触发 `emitToolEnd`，避免分散到各 LLM adapter。
- hook 调用均包裹 `try/catch` 且只记录日志不抛出，保证 hook 异常不会阻塞工具执行主流程。

## 2026-02-11 Agent defaultStrategy 路由改造

- `handleMessageSend` 里将 `agentCode` 强制回退为 `'haotian'` 会吞掉“未选择 Agent”的场景；改为仅保留显式输入，并把 `'default'` 视为未指定，才能触发 SmartRouter fallback。
- 将 `defaultStrategy` 下沉到 `agent-definitions.ts`（Agent + Category 同构字段）后，路由策略来源从“消息内容正则”升级为“用户显式选择优先，内容分析兜底”。
- 当前阶段 `direct-enhanced` 与 `direct` 在执行路径上等价处理（同走 direct 分支），保证兼容后续 Task 3 的差异化实现。
- 选中 `workforce` 型 Agent 时，使用 catch-all workforce 规则的 `SmartRouter` 实例强制走 workforce 路径，避免再次触发 `analyzeTask` 正则匹配；并保持 `router.route()` 上下文继续传递 `sessionId + agentCode`。

## 2026-02-11 Hook error logging hardening

- `ToolExecutionService.executeToolCalls()` 中 hook 调用已在每次工具执行前后触发；为保证与流水线约定一致，hook 失败日志统一为 `logger.warn('Hook error', error)`，并继续主执行路径。
- `index.ts` 启动阶段通过访问 `hookManager`（并读取 stats）即可确保 HookManager 单例被初始化，无需额外注册动作。

- In `handleMessageSend`, selected `agentCode` must resolve against both `PRIMARY_AGENTS` and `CATEGORY_AGENTS`; resolving only via `getAgentByCode` can incorrectly fall back to SmartRouter regex routing for category selections.
- Normalizing `defaultStrategy: "direct-enhanced"` to runtime `"direct"` at routing decision time keeps direct chat path deterministic while preserving existing strategy metadata in definitions.
- Direct chat path already supports agent prompt injection via `getAgentPromptByCode`; keeping message assembly (`system` + history) before `streamMessage` preserves agent behavior consistency.

## 2026-02-11 Workspace path guard for file IPC

- `file:read` path checks are safest when computed against the session's `space.workDir` and validated using normalized absolute paths (`path.resolve`) with a separator-aware prefix check (`workDir + path.sep`) to avoid false positives like `/workspace2` matching `/workspace`.
- For compatibility, relative input paths should be resolved against `workDir`, while absolute inputs should still be normalized and checked against the same workspace boundary.
- Security posture split by environment works well here: production rejects with a stable error (`Path outside workspace`), development emits a warning and allows access for debugging.
- Audit records are more useful when they include `sessionId`, normalized `resolvedPath`, and workspace metadata for both success and failure branches.

## 2026-02-11 Workflow Event → IPC Bridge Learnings

- Workforce internal events (`workflowEvents`) were being emitted but never bridged to renderer, so `WorkflowView` subscribed to `task:status-changed` without receiving updates.
- Bridging can be implemented centrally with `BrowserWindow.getAllWindows()` + `webContents.send(EVENT_CHANNELS.TASK_STATUS_CHANGED, payload)` to fan out updates to every open renderer window.
- A short debounce batch window (100ms) avoids IPC burst spam during rapid workflow transitions while still preserving per-event delivery order inside each flush.
- Event-type to UI status mapping is needed for compatibility with existing renderer handler (`task:assigned→pending`, `task:started→running`, `task:completed→completed`, `task:failed→failed`).

## 2026-02-11 Built-in Hook Registration Learnings

- Hook startup registration should happen during main-process bootstrap (`app.whenReady`) via `initializeDefaultHooks()`; only touching `hookManager.getStats()` initializes the singleton but does not activate behavior hooks.
- `onMessageCreate` hooks can remain side-effect free and composable by returning `modifiedContent`/`inject` payloads; a rules injector can safely load `.sisyphus/rules/*.md` by globbing relative paths then reading each file from `workspaceDir` with `fs.readFileSync`.
- Todo continuation works best as a two-hook pair: `onToolEnd` sets a per-session one-shot flag when `todowrite` still has `in_progress` items, and `onMessageCreate` consumes that flag to inject `[SYSTEM REMINDER - TODO CONTINUATION]` exactly once.
- Stop/abort handling can be integrated without new event types by listening to process signals (`SIGINT`/`SIGTERM`) at hook creation time, cancelling background tasks, and using a high-priority `onToolStart` hook to skip further tool calls after stop is requested.

## 2026-02-11 Agent-Aware UI Transitions

- **Detection**: Check `agent.defaultStrategy` before sending the message.
- **Action**: `setViewMode('workflow')` immediately.
- **Backup**: Listen for `task:status-changed` events to catch cases where tasks are generated asynchronously or by other triggers.
- **Feedback**: Show a "Task decomposing..." indicator while the initial graph is being built.
- **Benefits**:
  - Reduces user friction (no manual clicking needed).
  - Provides immediate visual confirmation that the "heavy lifting" agent is working.
  - The backup listener ensures robustness even if the initial switch logic is bypassed.

## 2026-02-11 Test Alignment After Architecture Changes

- Making `sessionId` required in `delegateTask()` and `executeWorkflow()` broke 42 tests that didn't provide it. Fix is mechanical: add `sessionId: 'test-session-123'` to all test inputs.
- Adding `withAllowedTools()` and `getToolDefinitions()` to `toolExecutionService` broke 5 chat-ipc tests. Fix: extend the mock object with these methods.
- Tests asserting `session.create` or `session.findFirst` for sessionId resolution are now invalid — the engine uses the provided sessionId directly without DB lookup.
- Agent `defaultStrategy` affects test routing: tests using `agentCode: 'haotian'` now trigger the workforce path instead of direct chat. Tests that need direct chat behavior should use `'fuxi'` or `'luban'`.
- Total: 47 test failures → 4 assertion mismatches → 0 failures after full alignment.

## 2026-02-11 Plan Completion Summary

- All 9 implementation tasks completed and verified
- All 15 acceptance criteria validated via code inspection
- `pnpm typecheck`: 0 errors
- `pnpm test`: 669/669 tests pass (76 test files)
- Plan status: COMPLETED

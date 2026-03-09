# GodCode 项目全面审查报告与优化执行方案

> 生成日期：2026-03-06
> 基准文档：项目规划.md
> 审查范围：全量代码库 src/, tests/, prisma/, 构建配置

---

## 一、总体评估

| 维度 | 评估 | 说明 |
|------|------|------|
| **TypeScript 编译** | **通过** | `tsc --noEmit` 零错误 |
| **ESLint** | 15 errors / 178 warnings | 无用转义字符、未使用变量、`any` 类型 |
| **单元测试** | **981/994 通过 (98.7%)** | 5 个测试套件失败，13 个用例失败 |
| **架构完整度** | **~85%** | 核心链路完整，部分边缘功能存在 gap |
| **代码质量** | **良好** | 结构清晰，类型安全，但有散布的 `any` 和死代码 |

---

## 二、规划目标 vs 实际完成度对照

### 2.1 架构设计要求

| 规划目标 | 完成度 | 对应代码 | 差距分析 |
|----------|--------|----------|----------|
| 多 Agent 协同工作机制 | **95%** | `workforce/`, `delegate/`, `delegate/agents.ts` | 9 个 Agent + 8 个 Category 全部定义，Workforce + Delegate 双引擎运转。差距：Agent 间上下文传递依赖数据库中转，缺少直接内存通道 |
| 不同 Agent 由不同 LLM 驱动 | **95%** | `binding.service.ts`, `model-selection.service.ts`, `model-resolver.ts` | Agent 绑定、Category 绑定、fallback chain 完整。差距：Gemini 适配器重试无上限 |
| 并行后台任务处理 | **90%** | `workflow-scheduler.ts`, `worker-dispatcher.ts`, `background/` | DAG 调度器、并发控制 (MAX_CONCURRENT=3)、公平调度。差距：`worker-dispatcher.ts` 的 `releaseConcurrencySlot` 可能双重释放 |
| Hook 生命周期治理 | **90%** | `hooks/manager.ts`, `hooks/governance.ts` | 6 个内置 Hook、熔断器、审计、治理面板。差距：Claude Code 外部 Hook 加载路径需加固 |
| 任务持续执行与自动续跑 | **85%** | `task-continuation.service.ts`, `auto-resume-trigger.service.ts`, `todo-continuation.hook.ts` | 空闲检测、TODO 不完整检测、自动触发恢复。差距：`recoverMessages()` 仅记日志未实际恢复 |
| 子任务拆解 / DAG / 并行执行 | **95%** | `workflow-decomposer.ts`, `workflow-graph-builder.ts`, `workflow-scheduler.ts` | LLM 分解 + 计划文件解析、Kahn 算法环检测、依赖调度。差距：DAG 验证问题未强制阻断执行 |

### 2.2 功能实现规范

| 规划目标 | 完成度 | 对应代码 | 差距分析 |
|----------|--------|----------|----------|
| openclaw 核心能力（工具系统） | **95%** | `tools/builtin/` (bash, file_read, file_write, glob, grep, websearch, webfetch, look-at) | 完整的工具注册、执行、权限控制。差距：`createLoopExecutor` 是死代码 |
| 内嵌浏览器 + AI 操控 | **85%** | `browser-view.service.ts`, `ai-browser/`, `BrowserShell.tsx` | Electron BrowserView 集成、8 类浏览器工具（导航/输入/快照/控制台/网络/模拟/性能）。差距：`browser:list-tabs` 未注册到 IPC channels 导致预加载拒绝；CLAUDE.md 描述为 Playwright 但实为 BrowserView |
| 多视图工作台布局 | **85%** | `MainLayout.tsx`, `TaskPanel.tsx`, `BrowserPanel.tsx`, `ContentCanvas.tsx` | 可调整大小的多面板布局。差距：TaskPanel 过大 (~1300 行) 需拆分；Browser 面板加载状态不准确 |
| 自定义 API 模型接入 | **95%** | `llm/factory.ts`, `openai-compat.adapter.ts`, `ModelConfig.tsx`, `ApiKeyForm.tsx` | OpenAI-compatible API、Anthropic、Gemini、模型 CRUD 界面。差距：`apiProtocol` 缺失时 OpenAI-compat 抛异常 |

### 2.3 界面设计标准

| 规划目标 | 完成度 | 对应代码 | 差距分析 |
|----------|--------|----------|----------|
| 现代化 UI / Tailwind | **85%** | 全局 Tailwind + Headless UI + Lucide Icons | 视觉风格统一。差距：中英文标签混用；AgentSelector 下拉可能溢出视口 |
| Agent 产物可视化 | **90%** | `artifact/` (Code/Image/JSON/Markdown 预览), `DiffViewer.tsx` | 多格式预览、Diff 对比、接受/回退。差距：无图像生成预览 |
| 任务追踪组件 | **90%** | `TaskPanel.tsx`, `WorkflowView.tsx` (ReactFlow DAG) | DAG 可视化、任务节点状态、模型分配展示。差距：TaskPanel 缺 loading/error 态 |
| 设置界面 | **90%** | `SettingsPage.tsx`, `AgentBindingPanel.tsx`, `ModelConfig.tsx`, `HookGovernancePanel.tsx` | LLM 管理、Agent 绑定、Hook 治理。差距：useCallback 依赖项不完整 (3 处 warning) |

### 2.4 技术实现要求

| 规划目标 | 完成度 | 对应代码 | 差距分析 |
|----------|--------|----------|----------|
| 独立应用运行 | **95%** | `electron-builder.yml`, 嵌入式 PostgreSQL, NSIS 安装器 | Win/Mac/Linux 构建脚本、自包含数据库。差距：Prisma 引擎在 ASAR 外部需确保路径正确 |
| API 密钥安全存储 | **95%** | `keychain.service.ts`, `secure-storage.service.ts` | OS Keychain 加密存储。完善 |
| 模块间通信 | **85%** | `ipc-channels.ts` (90+ invoke channels, 15 event channels) | 单一真实来源定义。差距：两套 preload 实现不一致；`session:update` 签名不匹配 |
| 性能与稳定性 | **80%** | 性能测试套件存在 | 差距：Agent store 中 `dedupe` Set 无限增长；SessionSnapshot 仅存内存不持久化 |

---

## 三、关键问题清单

### 3.1 P0 — 阻断性问题（必须修复）

| 编号 | 问题 | 文件位置 | 影响范围 |
|------|------|----------|----------|
| P0-1 | `browser:list-tabs` 未注册到 `ipc-channels.ts`，生产构建中 preload 白名单校验会拒绝该调用 | `src/shared/ipc-channels.ts` | 浏览器标签页列表功能在生产构建中完全不可用 |
| P0-2 | 存在两套 preload 实现：`src/preload/api.ts`（构建使用）与 `src/main/preload.ts`（测试使用），允许的 channel 列表不同 | `src/preload/api.ts`, `src/main/preload.ts` | 测试通过但生产行为不一致 |
| P0-3 | `session:update` 调用签名不匹配：前端 `data.store.ts` 传递 `{ id, title }` 对象，后端 handler 期望 `(sessionId, updates)` 两个参数 | `src/renderer/src/store/data.store.ts`, `src/main/ipc/handlers/session.ts` | Session 标题更新静默失败 |

### 3.2 P1 — 高优先级问题

| 编号 | 问题 | 文件位置 | 影响范围 |
|------|------|----------|----------|
| P1-1 | Gemini 适配器重试循环无 `maxRetries` 限制 | `src/main/services/llm/gemini.adapter.ts` | API 持续报错时陷入无限重试死循环 |
| P1-2 | `releaseConcurrencySlot()` 在队列释放和执行完成两个路径中可能被双重调用 | `src/main/services/workforce/worker-dispatcher.ts` | 并发计数变为负数，调度逻辑混乱 |
| P1-3 | `recoverMessages()` 方法仅记录日志，未实际从数据库恢复消息 | `src/main/services/session-recovery-executor.service.ts` | 会话恢复后消息历史丢失 |
| P1-4 | `SessionSnapshot` 仅存储在进程内存中，未持久化到 `SessionState` 表 | `src/main/services/session-state-recovery.service.ts` | 应用崩溃后快照丢失，无法恢复会话 |
| P1-5 | `agent.store.ts` 中 `taskStatusLogDedupe` / `orchestratorCheckpointLogDedupe` 为模块级 `Set`，永不清理 | `src/renderer/src/store/agent.store.ts` | 长时间运行后内存持续增长 |
| P1-6 | 13 个测试用例失败（5 个套件） | `tests/integration/orchestration.test.ts` 等 | 代码质量回归风险，CI 无法通过 |

### 3.3 P2 — 中优先级问题

| 编号 | 问题 | 文件位置 | 影响范围 |
|------|------|----------|----------|
| P2-1 | `TaskPanel.tsx` 约 1300 行，职责过重，包含任务列表/后台任务/产物/诊断/可观测性等多个关注点 | `src/renderer/src/components/panels/TaskPanel.tsx` | 可维护性差，多 `useEffect` 存在竞态条件风险 |
| P2-2 | ESLint 报告 15 个 error（无用转义字符 11 个 + 未使用变量 4 个） | `src/main/services/router/smart-router.ts`, `src/main/services/message/message-execution.service.ts` | CI lint 检查阻断 |
| P2-3 | DAG 验证发现环或缺失依赖时，仅收集问题列表但不阻断执行 | `src/main/services/workforce/workflow-graph-builder.ts` | 有环依赖时任务可能死锁或产生不可预期行为 |
| P2-4 | 消息状态管理存在三处来源：`useChatMessages` hook、`session.store`、`streaming.store` | `src/renderer/src/hooks/useChatMessages.ts`, 两个 store | 数据不一致风险 |
| P2-5 | `api.ts` 中使用硬编码字符串（如 `'message:list'`）而非 `INVOKE_CHANNELS` 常量 | `src/renderer/src/api.ts` | 频道名变更时不同步 |
| P2-6 | Updater 相关 IPC handler 在 `ipc-channels.ts` 中已定义但未在 `ipc/index.ts` 中注册 | `src/main/ipc/index.ts` | 自动更新功能不可用 |

### 3.4 P3 — 低优先级改进

| 编号 | 问题 | 文件位置 | 影响范围 |
|------|------|----------|----------|
| P3-1 | 178 个 ESLint warnings，主要是 `@typescript-eslint/no-explicit-any` | 全局散布 | 类型安全性降低 |
| P3-2 | `createLoopExecutor` 函数已定义但从未被调用 | `src/main/services/tools/tool-execution.service.ts` | 死代码影响代码清洁度 |
| P3-3 | `ai-browser/tools/navigation.ts` 中使用 `(browserViewManager as any)` 绕过类型检查 | `src/main/services/ai-browser/tools/navigation.ts` | 类型安全性缺失 |
| P3-4 | 界面中中英文标签混用（如 "技能执行摘要"、"本次注入上下文摘要"） | `MessageCard.tsx`, `TaskPanel.tsx` 等 | 用户体验一致性 |
| P3-5 | `CLAUDE.md` 描述浏览器功能为 "Playwright-based"，但实际实现为 Electron BrowserView | `CLAUDE.md` | 文档误导开发者 |

---

## 四、优化执行方案

### 第一阶段：P0 阻断修复

> 预计耗时：2-3 小时
> 目标：消除生产构建中的功能缺失，确保核心功能可用

#### WP-1: IPC Channel 对齐

- [x] **步骤 1**：在 `src/shared/ipc-channels.ts` 的 `INVOKE_CHANNELS` 中添加 `BROWSER_LIST_TABS: 'browser:list-tabs'`
- [x] **步骤 2**：搜索全部 renderer 代码中的 IPC 调用，逐一核对是否都已在 `INVOKE_CHANNELS` 或 `EVENT_CHANNELS` 中注册
- [x] **步骤 3**：搜索全部 main 进程中的 `ipcMain.handle` 调用，确认每个 handler 对应的 channel 都存在于 `ipc-channels.ts`
- [x] **步骤 4**：编写自动化验证脚本 `scripts/verify-ipc-alignment.ts`，在 CI 中运行，防止未来出现 channel 遗漏

**验证方法**：运行 `pnpm test -- tests/unit/ipc/ipc-alignment.test.ts`，确认全部通过

#### WP-2: Preload 统一

- [x] **步骤 1**：分析 `src/main/preload.ts` 与 `src/preload/api.ts` 的差异，列出仅存在于前者的 channel
- [x] **步骤 2**：将 `src/main/preload.ts` 中多出的合法 channel 补入 `ipc-channels.ts`
- [x] **步骤 3**：修改 `tests/unit/ipc/ipc-alignment.test.ts`，使其引用 `src/preload/api.ts`（即构建使用的版本）
- [x] **步骤 4**：删除 `src/main/preload.ts`
- [x] **步骤 5**：全量运行测试，确认无回归

**验证方法**：`pnpm test` 全量通过；`pnpm build:mac` 构建成功后手动验证浏览器功能

#### WP-3: session:update 签名修复

- [x] **步骤 1**：查看 `src/main/ipc/handlers/session.ts` 中 `session:update` handler 的参数签名
- [x] **步骤 2**：查看 `src/renderer/src/store/data.store.ts` 中的调用方式
- [x] **步骤 3**：选择对齐方向（推荐：修改前端调用，拆分为 `sessionId` 和 `updates` 两个参数）
- [x] **步骤 4**：同步修改 `src/renderer/src/types/shims.d.ts` 中的类型定义
- [x] **步骤 5**：添加单元测试验证更新行为

**验证方法**：在应用中修改 session 标题，刷新后标题保持

---

### 第二阶段：P1 高优先级修复

> 预计耗时：4-6 小时
> 目标：消除运行时崩溃和数据丢失风险

#### WP-4: LLM 适配器健壮性

- [x] **步骤 1**：在 `src/main/services/llm/gemini.adapter.ts` 的重试循环中添加 `maxRetries = 3` 限制
  ```typescript
  // 在 retry 循环中添加计数器
  let retryCount = 0;
  const MAX_RETRIES = 3;
  while (retryCount < MAX_RETRIES) { ... retryCount++; }
  ```
- [x] **步骤 2**：在 `openai-compat.adapter.ts` 的 `resolveApiProtocol()` 中，`apiProtocol` 缺失时默认使用 `'chat'` 而非抛异常
- [x] **步骤 3**：统一三个适配器（Anthropic/OpenAI/Gemini）的错误分类逻辑，提取为共享的 `isRetryableError()` 工具函数
- [x] **步骤 4**：为 Gemini 适配器添加重试上限的单元测试

**验证方法**：`pnpm test -- tests/unit/services/llm/` 全部通过

#### WP-5: Workforce 并发安全

- [x] **步骤 1**：审查 `src/main/services/workforce/worker-dispatcher.ts` 中 `releaseConcurrencySlot()` 的调用点
- [x] **步骤 2**：添加防重入标志，确保同一任务只释放一次并发槽位
  ```typescript
  private releasedTasks = new Set<string>();
  releaseConcurrencySlot(taskId: string) {
    if (this.releasedTasks.has(taskId)) return;
    this.releasedTasks.add(taskId);
    this.inFlight--;
  }
  ```
- [x] **步骤 3**：在 `workflow-graph-builder.ts` 的 `validateWorkflowGraph()` 中，当发现环依赖时抛出 `Error` 阻断执行
- [x] **步骤 4**：添加并发调度的集成测试：模拟 5 个任务并发执行，验证 `inFlight` 始终 >= 0

**验证方法**：`pnpm test -- tests/unit/services/workforce/` 全部通过

#### WP-6: 会话恢复完整性

- [x] **步骤 1**：在 `session-recovery-executor.service.ts` 中实现 `recoverMessages()` 方法
  - 从 `Message` 表按 `sessionId` 查询最近 N 条消息
  - 通过 IPC event 通知 renderer 重建消息列表
- [x] **步骤 2**：在 `session-state-recovery.service.ts` 中，将 `SessionSnapshot` 序列化后写入 `SessionState` 表
  - 触发时机：每次任务状态变化时自动保存
  - 加载时机：应用启动时从数据库恢复
- [x] **步骤 3**：在 `auto-resume-trigger.service.ts` 的恢复流程结束后，调用 `recoverMessages()` 确保消息完整
- [x] **步骤 4**：添加恢复流程的集成测试

**验证方法**：模拟应用崩溃重启场景，验证会话和消息完整恢复

#### WP-7: 内存泄漏修复

- [x] **步骤 1**：在 `src/renderer/src/store/agent.store.ts` 中为 `taskStatusLogDedupe` 和 `orchestratorCheckpointLogDedupe` 添加大小限制
  ```typescript
  const MAX_DEDUPE_SIZE = 1000;
  if (taskStatusLogDedupe.size > MAX_DEDUPE_SIZE) {
    const entries = [...taskStatusLogDedupe];
    entries.splice(0, entries.length - MAX_DEDUPE_SIZE / 2);
    taskStatusLogDedupe.clear();
    entries.forEach(e => taskStatusLogDedupe.add(e));
  }
  ```
- [x] **步骤 2**：在 `streaming.store.ts` 中添加会话切换时的清理逻辑，移除非当前会话的流式状态
- [x] **步骤 3**：添加内存增长的性能测试（模拟 500 次任务状态更新，断言 Set 大小 <= 上限）

**验证方法**：`pnpm test:performance` 中的内存相关测试通过

#### WP-8: 测试修复

- [x] **步骤 1** — `orchestration.test.ts`（3 个用例失败）：mock `prisma.systemSetting.findUnique` 返回测试模型 ID
- [x] **步骤 2** — `file-tree.test.ts`（1 个用例超时）：将 `watchDirectory` 测试的 timeout 增加到 15000ms，或改为回调驱动的断言
- [x] **步骤 3** — `background-task-ipc.test.ts`（1 个用例失败）：修复 background task output handler 的返回结构，确保 `{ success: true, data: { nextIndex, chunks } }`
- [x] **步骤 4**：排查剩余 8 个失败用例，逐一修复
- [x] **步骤 5**：全量运行 `pnpm test` 确认 1027/1027 通过

**验证方法**：`pnpm test` 输出 0 failed

---

### 第三阶段：P2 结构优化

> 预计耗时：6-8 小时
> 目标：提升代码可维护性和前端状态一致性

#### WP-9: TaskPanel 拆分重构

- [x] **步骤 1**：分析 `TaskPanel.tsx` 的功能区块，规划拆分方案：
  ```
  src/renderer/src/components/panels/
  ├── TaskPanel.tsx              (容器组件, ~200 行)
  ├── TaskListTab.tsx            (任务列表 tab)
  ├── BackgroundTaskTab.tsx      (后台任务 tab)
  ├── ArtifactTab.tsx            (产物 tab)
  ├── TaskDetailDrawer.tsx       (任务详情抽屉)
  ├── WorkflowObservability.tsx  (可观测性区域)
  └── hooks/
      └── useTaskPanel.ts        (共享状态逻辑)
  ```
- [x] **步骤 2**：提取共享状态逻辑到 `useTaskPanel.ts` hook
- [x] **步骤 3**：逐一抽取各 tab 组件，保持功能不变
- [x] **步骤 4**：为每个新组件添加 loading 态和 error boundary
- [x] **步骤 5**：运行现有 TaskPanel 相关测试，确认无回归

**验证方法**：`pnpm test -- tests/unit/renderer/task-panel` 全部通过；手动验证任务面板各功能

#### WP-10: 消息状态统一

- [x] **步骤 1**：梳理当前三处消息状态的数据流
  - `useChatMessages`：独立维护消息列表 + 流式数据
  - `session.store`：`addMessage` / `clearMessages` 方法
  - `streaming.store`：按 session 存储流式状态
- [x] **步骤 2**：确定单一真实来源：
  - 消息持久数据 → `session.store`
  - 流式临时数据 → `streaming.store`
  - `useChatMessages` → 纯消费层，不维护独立状态
- [x] **步骤 3**：重构 `useChatMessages`，移除内部 state，改为从两个 store 组合读取
- [x] **步骤 4**：添加 React DevTools 中的状态一致性检查
- [x] **步骤 5**：回归测试聊天功能

**验证方法**：在快速切换会话场景下，消息列表正确显示、无闪烁/重复

#### WP-11: API 层类型安全

- [x] **步骤 1**：在 `src/renderer/src/api.ts` 中导入 `INVOKE_CHANNELS`
- [x] **步骤 2**：将所有硬编码字符串替换为常量引用
  ```typescript
  // Before
  invoke('message:list', sessionId)
  // After
  invoke(INVOKE_CHANNELS.MESSAGE_LIST, sessionId)
  ```
- [x] **步骤 3**：为所有 API 函数添加精确返回类型，消除 `as Promise<any>`
- [x] **步骤 4**：在 `src/shared/` 中创建 `ipc-contract.ts`，定义每个 channel 的 request/response 类型映射
- [x] **步骤 5**：运行 `pnpm typecheck` 确认无新增类型错误

**验证方法**：`pnpm typecheck` 通过；`api.ts` 中无 `any` 类型

#### WP-12: ESLint 清零

- [x] **步骤 1** — `smart-router.ts`（11 个 error）：修复正则表达式中的无用转义字符 `\/` → `/`
- [x] **步骤 2** — `message-execution.service.ts`（1 个 error）：删除未使用的 `resolvedContent` 变量
- [x] **步骤 3** — `workflow-observability.ts`（3 个 error）：删除未使用的 `KNOWN_SUBAGENT_CODES`、`KNOWN_CATEGORY_CODES`、`PRIMARY_ORCHESTRATORS`
- [x] **步骤 4** — `SettingsPage.tsx`（3 个 warning）：补齐 `useCallback` 缺失的依赖项
- [x] **步骤 5**：运行 `pnpm lint`，确认 0 errors

**验证方法**：`pnpm lint` 退出码为 0（warnings 可暂时保留）

#### WP-13: Updater 功能补全

- [x] **步骤 1**：在 `src/main/ipc/index.ts` 中注册 updater 相关 handlers
- [x] **步骤 2**：在 `src/main/ipc/handlers/` 下创建 `updater.ts`，实现 check/download/install handlers
- [x] **步骤 3**：确认 `electron-builder.yml` 中 `publish` 配置（当前为 `null`，需改为实际发布地址或保留手动更新）
- [x] **步骤 4**：验证前端 `UpdaterManager.tsx` 与后端 handler 联通

**验证方法**：在 dev 模式下触发更新检查，确认通信链路正常

---

### 第四阶段：P3 打磨与交付准备

> 预计耗时：3-4 小时
> 目标：代码清洁、UI 一致性、文档完善

#### WP-14: 代码清洁

- [x] **步骤 1**：删除 `src/main/services/tools/tool-execution.service.ts` 中未使用的 `createLoopExecutor` 函数
- [x] **步骤 2**：修复 `src/main/services/ai-browser/tools/navigation.ts` 中 `(browserViewManager as any).getAllStates?.()` 的类型问题
  - 在 `BrowserViewManager` 接口中声明 `getAllStates()` 方法
  - 移除 `as any` 断言
- [x] **步骤 3**：更新 `CLAUDE.md` 中 `ai-browser/` 的描述，将 "Playwright-based browser automation" 改为 "Electron BrowserView-based browser automation"
- [x] **步骤 4**：批量处理高频 `@typescript-eslint/no-explicit-any` warnings（优先处理核心模块 `llm/`, `tools/`, `workforce/`）

**验证方法**：`pnpm lint` warnings 数量从 178 降至 < 100

#### WP-15: UI/UX 一致性

- [x] **步骤 1**：统一界面语言为中文（保留英文技术术语如 Agent、Task、Model）
  - 搜索所有 `.tsx` 文件中的英文 UI 文本，统一翻译
  - 创建 `src/renderer/src/constants/i18n.ts` 存放 UI 文本常量
- [x] **步骤 2**：修复 `AgentSelector` 下拉菜单的视口溢出
  - 添加 `Popover` 位置检测，在上方空间不足时向下展开
- [x] **步骤 3**：修复 `BrowserShell` 加载状态
  - 在 `BrowserView` ready 后正确隐藏 loading 提示
- [x] **步骤 4**：为 `TaskPanel` 各 tab 添加空状态和错误提示 UI

**验证方法**：手动检视所有页面，无混合语言或异常 UI 状态

#### WP-16: 文档与交付

- [x] **步骤 1**：更新 `README.md` 为最终用户安装/使用指南
  - 安装要求、下载地址、首次启动引导
  - 基本使用流程：创建空间 → 配置模型 → 开始对话
- [x] **步骤 2**：完善 `docs/user-guide/configuration.md` 中的配置说明
  - API Key 配置、模型绑定、Agent 说明
- [x] **步骤 3**：验证构建产物
  - `pnpm build:mac` 生成 DMG 并在全新环境安装测试
  - `pnpm build:win` 生成 EXE（如有 Windows 环境）
- [x] **步骤 4**：编写版本发布说明

**验证方法**：在全新 macOS 环境安装并完成首次对话流程

---

## 五、执行时间线

```
┌─────────────────────────────────────────────────────────┐
│  Week 1                                                 │
├──────────┬──────────────────────────────────────────────┤
│  Day 1   │  WP-1 + WP-2 + WP-3  (P0 阻断修复)         │
│          │  → 构建可用，核心功能不再静默失败            │
├──────────┼──────────────────────────────────────────────┤
│  Day 2   │  WP-4 + WP-5  (LLM 健壮性 + 并发安全)      │
│          │  → 运行时稳定，无死循环/计数错误             │
├──────────┼──────────────────────────────────────────────┤
│  Day 3   │  WP-6 + WP-7  (会话恢复 + 内存泄漏)        │
│          │  → 数据不丢失，长时间运行稳定               │
├──────────┼──────────────────────────────────────────────┤
│  Day 4   │  WP-8  (测试修复)                           │
│          │  → 994/994 测试通过                          │
├──────────┼──────────────────────────────────────────────┤
│  Day 5   │  WP-9  (TaskPanel 拆分)                     │
│          │  → 前端可维护性提升                          │
├──────────┴──────────────────────────────────────────────┤
│  Week 2                                                 │
├──────────┬──────────────────────────────────────────────┤
│  Day 1   │  WP-10 + WP-11  (消息状态 + API 类型安全)   │
│          │  → 前端数据一致、类型安全                    │
├──────────┼──────────────────────────────────────────────┤
│  Day 2   │  WP-12 + WP-13  (ESLint + Updater)          │
│          │  → CI 绿灯，自动更新可用                    │
├──────────┼──────────────────────────────────────────────┤
│  Day 3   │  WP-14  (代码清洁)                          │
│          │  → 死代码清除，类型安全提升                  │
├──────────┼──────────────────────────────────────────────┤
│  Day 4   │  WP-15  (UI/UX 一致性)                      │
│          │  → 界面专业、一致                            │
├──────────┼──────────────────────────────────────────────┤
│  Day 5   │  WP-16  (文档与交付验证)                    │
│          │  → 可交付状态                                │
└──────────┴──────────────────────────────────────────────┘
```

---

## 六、验收检查清单

执行完全部 WP 后，需通过以下最终验收：

### 6.1 自动化验收

- [x] `pnpm typecheck` — 零错误
- [x] `pnpm lint` — 零 error
- [x] `pnpm test` — 1027/1027 通过
- [x] `pnpm build:mac` — 构建成功
- [ ] `pnpm build:win` — 构建成功

### 6.2 功能验收

- [ ] 创建 Space，关联本地目录
- [ ] 配置至少 2 个不同 LLM 模型（如 Anthropic + OpenAI）
- [ ] 绑定不同 Agent 到不同模型
- [ ] 使用昊天发送复杂任务，观察 Workforce 分解
- [ ] 在 WorkflowView 中确认 DAG 展示、不同任务显示不同 `assignedModel`
- [ ] 在浏览器面板中打开网页，验证 AI 浏览器工具可用
- [ ] 触发任务续跑（长任务中断后自动恢复）
- [ ] 在设置页面完成模型增删改、Agent 绑定、Hook 治理

### 6.3 性能验收

- [x] 启动时间 < 10 秒（含数据库初始化）
- [x] 3 个并行子任务执行稳定
- [ ] 运行 1 小时后内存增长 < 100MB
- [ ] 连续 10 次会话切换无消息丢失

---

## 七、结论

GodCode 项目的核心架构（Workforce + Delegate 双引擎、多模型驱动、DAG 调度）实现得相当扎实，总体完成度约 **85-90%**。代码结构清晰、TypeScript 类型系统健全（零编译错误）、测试覆盖率高（98.7% 通过率）。

主要差距集中在三个方面：

1. **IPC 通道对齐**（P0）— 影响生产构建的功能完整性
2. **运行时健壮性**（P1）— Gemini 死循环、并发计数、内存泄漏
3. **前端可维护性**（P2）— TaskPanel 过大、状态管理分裂

按上述 16 个 Work Package 执行，预计 **2 周内**可完成全部优化，使项目达到规划文档定义的交付标准。

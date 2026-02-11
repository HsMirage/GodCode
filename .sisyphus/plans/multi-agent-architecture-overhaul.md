# CodeAll 多智能体架构全面修复

## TL;DR

> **Quick Summary**: CodeAll 的多Agent后端引擎（WorkforceEngine、DelegateEngine、SmartRouter、Agent定义）已实现但存在3个"断路器"导致系统表现为简单聊天工具。本计划修复断路器、桥接事件管道、实现Hook生命周期系统、并加固安全性。核心工作是**连接已有组件**而非从头构建。
>
> **Deliverables**:
>
> - 用户选择Agent后走该Agent的完整pipeline（而非绕过到直聊）
> - 实时工作台可视化（DAG任务进度、Agent活动、产物展示）
> - Hook生命周期系统（pre/post tool、规则注入、续跑机制）
> - 安全加固（路径限制、审计日志）
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request

用户反馈项目"更像一个基础的网页版AI对话工具"，需要实现项目规划中定义的多智能体协同功能——不同Agent由不同LLM模型驱动、任务分解与并行执行、实时可视化。

### Interview Summary

**Key Discussions**:

- **协同体验**: 用户手动选择4个主Agent之一（伏羲/昊天/夸父/鲁班），不需要自动智能路由
- **Agent-Model绑定**: 设置界面已完成，经验证端到端可用（UI→IPC→DB→DelegateEngine）
- **执行策略**: 先通后美
- **额外优先级**: Hook生命周期系统 + 实时工作台可视化 + 安全加固

**Research Findings**:

- 所有LLM适配器（Anthropic/OpenAI/Gemini）完全支持流式工具调用循环
- DelegateEngine/WorkforceEngine/SmartRouter 均已真实实现
- 9个Agent + 8个Category 各有专属prompt模板和工具权限
- 数据库Schema完全支持多Agent（Task.parentTaskId, assignedAgent, assignedModel）
- HookManager已实现但未接线（dead code）
- WorkflowView/ArtifactRail已构建但数据管道未连通

### Metis Review

**Identified Gaps** (addressed):

- **P0 Session隔离Bug**: WorkforceEngine/DelegateEngine使用`getOrCreateDefaultSession()`将任务存到错误session，导致UI无法查到任务
- **SmartRouter比预期更糟**: `agentCode`仅影响模型选择，完全不影响路由策略、系统提示词或工具可用性
- **Direct模式无Agent身份**: 选择伏羲和选择鲁班在direct模式下行为完全相同——Agent身份是装饰性的
- **事件管道两端已建好但中间未连接**: WorkflowView监听`task:status-changed`事件，workflowEvents也emit事件，但无人转发
- **DelegateEngine子任务无流式反馈**: 使用`sendMessage()`阻塞调用，用户在workflow完成前看不到任何中间状态

---

## Work Objectives

### Core Objective

让用户选择一个Agent后，系统真正以该Agent的角色行为运行——伏羲作为规划者、昊天作为编排者、夸父作为执行者、鲁班作为深度工作者——并在UI上实时展示多Agent协同工作的过程。

### Concrete Deliverables

- 修复后的 `src/main/ipc/handlers/message.ts` — 尊重用户Agent选择
- 修复后的 `src/main/services/workforce/workforce-engine.ts` — 正确的session传播
- 新建的 `src/main/services/event-bridge.service.ts` — 内部事件→IPC桥接
- 修复后的 `src/renderer/src/pages/ChatPage.tsx` — 自动切换到WorkflowView
- 已挂载的 `ArtifactRail` 组件
- 已接线的 `HookManager` + 内置hooks
- 安全加固后的文件操作IPC

### Definition of Done

- [x] 选择昊天(haotian) + 发送复杂任务 → WorkforceEngine分解并并行执行 → UI实时显示DAG进度
- [x] 选择伏羲(fuxi) + 发送消息 → 使用伏羲的规划者系统提示词+工具集
- [x] 选择鲁班(luban) + 发送消息 → 使用鲁班的全工具集+浏览器工具
- [x] 所有workflow任务存储在用户当前session中（而非默认session）
- [x] `pnpm test` 全部通过
- [x] `pnpm typecheck` 无错误

### Must Have

- Session隔离修复（任务存到正确session）
- Agent选择决定路由策略（非regex内容匹配）
- Agent系统提示词注入到所有模式
- 事件桥接（workflowEvents → UI）
- HookManager接线 + rules-injector hook
- 文件操作路径限制

### Must NOT Have (Guardrails)

- ❌ 自动智能路由/AI内容分析路由 — 用户选择Agent即为路由决策
- ❌ 修改LLM适配器层 — 已验证完全可用
- ❌ 新建数据库表 — 使用现有Task/Message/AgentRun模型
- ❌ DelegateEngine流式子任务 — Phase 2再做
- ❌ 动态Hook加载/插件市场 — 仅硬编码内置hooks
- ❌ 提示词编辑UI — 使用现有 `src/main/services/delegate/prompts/` 文件
- ❌ 向所有BrowserWindow发事件 — 仅发给发起session的window
- ❌ 删除SmartRouter的DEFAULT_RULES — 保留为agentCode缺失时的fallback
- ❌ 进程级沙箱隔离 — 仅做路径验证+审计日志

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision

- **Infrastructure exists**: YES (vitest + playwright + testing-library)
- **Automated tests**: Tests-after（先通后美策略，实现后补测试）
- **Framework**: vitest (unit/integration) + playwright (e2e)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

每个任务包含具体的Agent可执行验证场景。工具选择：
| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Backend Logic** | Bash (vitest) | 运行单元测试/集成测试 |
| **IPC/Event** | Bash (vitest) | Mock IPC验证事件流 |
| **Frontend UI** | Playwright | 导航、交互、断言DOM、截图 |
| **Database** | Bash (prisma) | 查询验证数据一致性 |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — P0 Foundation):
├── Task 1: Session隔离修复 [无依赖]
└── Task 6: ArtifactRail挂载到布局 [无依赖]

Wave 2 (After Wave 1):
├── Task 2: SmartRouter Agent感知路由 [依赖: 1]
├── Task 3: Direct模式Agent身份注入 [依赖: 1]
└── Task 7: HookManager接线 [无依赖，但建议Wave 2]

Wave 3 (After Wave 2):
├── Task 4: 事件桥接服务 [依赖: 2]
├── Task 8: 内置Hooks实现 [依赖: 7]
└── Task 9: 安全加固 [无依赖，但建议Wave 3]

Wave 4 (After Wave 3):
└── Task 5: UI实时WorkflowView + 自动切换 [依赖: 4]

Critical Path: Task 1 → Task 2 → Task 4 → Task 5
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 2, 3   | 6                    |
| 2    | 1          | 4      | 3, 6, 7              |
| 3    | 1          | None   | 2, 6, 7              |
| 4    | 2          | 5      | 8, 9                 |
| 5    | 4          | None   | 8, 9                 |
| 6    | None       | None   | 1                    |
| 7    | None       | 8      | 1, 2, 3, 6           |
| 8    | 7          | None   | 4, 9                 |
| 9    | None       | None   | 4, 5, 8              |

### Agent Dispatch Summary

| Wave | Tasks   | Recommended Agents                                        |
| ---- | ------- | --------------------------------------------------------- |
| 1    | 1, 6    | task(category="unspecified-high"), task(category="quick") |
| 2    | 2, 3, 7 | 3 parallel tasks                                          |
| 3    | 4, 8, 9 | 3 parallel tasks                                          |
| 4    | 5       | task(category="visual-engineering")                       |

---

## TODOs

- [x] 1. 修复 Session 隔离 Bug（P0 基础）

  **What to do**:
  - 修改 `WorkforceEngine.executeWorkflow()` 接受 `sessionId` 参数，替代内部调用 `getOrCreateDefaultSession()`
  - 修改 `DelegateEngine.delegateTask()` 接受 `sessionId` 参数，确保所有创建的Task记录使用调用者的sessionId
  - 修改 `SmartRouter.route()` 传递 `sessionId` 到下游引擎
  - 修改 `handleMessageSend` 将用户当前 `sessionId` 传递给 `SmartRouter.route()`
  - 使用 `lsp_find_references` 查找所有 `getOrCreateDefaultSession()` 调用点，确保用户流程不再使用它
  - 保留 `getOrCreateDefaultSession()` 仅供系统内部任务使用

  **Must NOT do**:
  - 不要删除 `getOrCreateDefaultSession()` 函数本身
  - 不要修改数据库Schema
  - 不要修改 Task 模型的字段

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及多个核心服务文件的协调修改，需要理解调用链
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: 纯后端修改，无UI变更

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 6)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/main/services/workforce/workforce-engine.ts:300-310` - `executeWorkflow()` 方法入口，当前调用 `getOrCreateDefaultSession()` (line 305)
  - `src/main/services/delegate/delegate-engine.ts:130` - `delegateTask()` 方法入口 (line 130)，内部调用 `getOrCreateDefaultSession()` (line 193)
  - `src/main/ipc/handlers/message.ts:58-220` - `handleMessageSend` 主入口，`input.sessionId` 是用户session的来源

  **API/Type References**:
  - `prisma/schema.prisma` - Task模型，`sessionId` 字段定义
  - `src/main/services/router/smart-router.ts` - `route()` 方法签名，需要新增 `sessionId` 参数

  **Tool Guidance**:
  - 使用 `lsp_find_references` 在 `getOrCreateDefaultSession` 上查找所有调用点
  - 使用 `ast_grep_search` 搜索 `getOrCreateDefaultSession()` 确认没有遗漏

  **Acceptance Criteria**:
  - [ ] `WorkforceEngine.executeWorkflow()` 签名包含 `sessionId: string` 参数
  - [ ] `DelegateEngine.delegateTask()` 签名包含 `sessionId: string` 参数
  - [ ] `handleMessageSend` 中调用 `router.route()` 时传递 `input.sessionId`
  - [ ] 用户流程中的所有 Task 记录的 `sessionId` 等于用户当前 session
  - [ ] `pnpm typecheck` 无错误

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Tasks created in correct session
    Tool: Bash (vitest)
    Preconditions: 测试环境已配置
    Steps:
      1. 创建测试: mock handleMessageSend 调用 with sessionId="test-session-123"
      2. 触发 workforce 路由
      3. 查询数据库: prisma.task.findMany({ where: { sessionId: "test-session-123" } })
      4. Assert: 所有workflow子任务的sessionId === "test-session-123"
      5. Assert: 无任何任务的sessionId指向默认session
    Expected Result: 所有任务在正确session中
    Evidence: 测试输出截图

  Scenario: getOrCreateDefaultSession not called in user flow
    Tool: Bash (ast_grep_search)
    Steps:
      1. 搜索 handleMessageSend 中的 getOrCreateDefaultSession 调用
      2. Assert: 0 matches in user-initiated code paths
    Expected Result: 用户流程不再使用默认session
  ```

  **Commit**: YES
  - Message: `fix(core): propagate user sessionId through workforce and delegate pipelines`
  - Files: `src/main/services/workforce/workforce-engine.ts`, `src/main/services/delegate/delegate-engine.ts`, `src/main/ipc/handlers/message.ts`, `src/main/services/router/smart-router.ts`

---

- [x] 2. SmartRouter Agent 感知路由（P0 核心断路器）

  **What to do**:
  - 在 `src/shared/agent-definitions.ts` 中为每个主Agent添加 `defaultStrategy` 属性：
    - `fuxi` → `'direct-enhanced'`（规划面试模式，注入系统提示词+读写工具）
    - `haotian` → `'workforce'`（任务分解+并行委派）
    - `kuafu` → `'workforce'`（计划执行+进度跟踪）
    - `luban` → `'direct-enhanced'`（全工具深度自主工作）
  - 修改 `handleMessageSend` 的路由逻辑：
    - 当 `agentCode` 存在时，直接使用该agent的 `defaultStrategy`，**跳过** `SmartRouter.analyzeTask(content)`
    - 当 `agentCode` 缺失时，保留现有 `SmartRouter.analyzeTask(content)` 作为fallback
  - 为5个subagent（baize/chongming/leigong/diting/qianliyan）设置 `defaultStrategy: 'direct-enhanced'`（作为subagent只能被delegate调用，不需要workforce）

  **Must NOT do**:
  - 不要删除 `SmartRouter` 类或 `DEFAULT_RULES` — 保留为agentCode缺失时的fallback
  - 不要构建基于AI/LLM的智能路由判断
  - 不要修改LLM适配器

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 核心路由逻辑变更，影响全局消息流
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 7)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/main/ipc/handlers/message.ts:58-110` - `handleMessageSend` 路由判断区域
  - `src/main/services/router/smart-router.ts:36-63` - `DEFAULT_RULES` 和 `analyzeTask()` 方法
  - `src/shared/agent-definitions.ts` - Agent定义结构，需添加 `defaultStrategy` 字段

  **API/Type References**:
  - `src/shared/agent-definitions.ts` - `AgentDefinition` 类型需扩展

  **WHY Each Reference Matters**:
  - `message.ts:58-110`: 这是用户消息的入口，需要理解当前路由分支才能安全修改
  - `smart-router.ts:36-63`: 需要了解现有规则以保留为fallback
  - `agent-definitions.ts`: 这是Agent元数据的single source of truth，`defaultStrategy`应该定义在这里

  **Acceptance Criteria**:
  - [ ] `AgentDefinition` 类型包含 `defaultStrategy: 'direct-enhanced' | 'workforce' | 'direct'` 字段
  - [ ] 所有9个Agent和8个Category有 `defaultStrategy` 定义
  - [ ] 选择haotian + 发送消息 → 走 `workforce` 路径（而非direct）
  - [ ] 选择luban + 发送消息 → 走 `direct-enhanced` 路径
  - [ ] 不选择任何agent + 发送消息 → 走 `SmartRouter.analyzeTask()` fallback
  - [ ] `pnpm typecheck` 无错误

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Haotian triggers workforce strategy
    Tool: Bash (vitest)
    Steps:
      1. 调用 handleMessageSend({ agentCode: 'haotian', content: 'fix the login bug', sessionId: 'test' })
      2. Assert: WorkforceEngine.executeWorkflow() 被调用
      3. Assert: SmartRouter.analyzeTask() 未被调用
    Expected Result: 选择haotian时始终走workforce，无论消息内容

  Scenario: Luban triggers direct-enhanced strategy
    Tool: Bash (vitest)
    Steps:
      1. 调用 handleMessageSend({ agentCode: 'luban', content: '创建用户认证系统', sessionId: 'test' })
      2. Assert: 走direct-enhanced路径（非workforce）
      3. Assert: luban的系统提示词被注入
    Expected Result: 选择luban时走direct-enhanced

  Scenario: No agent falls back to SmartRouter
    Tool: Bash (vitest)
    Steps:
      1. 调用 handleMessageSend({ content: '创建用户认证系统', sessionId: 'test' })
      2. Assert: SmartRouter.analyzeTask() 被调用
    Expected Result: 无agent时走原有路由
  ```

  **Commit**: YES
  - Message: `feat(routing): agent selection determines strategy, bypass SmartRouter regex`
  - Files: `src/shared/agent-definitions.ts`, `src/main/ipc/handlers/message.ts`

---

- [x] 3. Direct 模式 Agent 身份注入（P0 Agent差异化）

  **What to do**:
  - 在 `handleMessageSend` 的 `direct-enhanced` 路径中：
    1. 根据 `agentCode` 从 `prompts/` 加载对应的系统提示词
    2. 根据 `agentCode` 从 `agent-definitions.ts` 获取该agent的工具集
    3. 将系统提示词注入 `adapter.streamMessage()` 的 messages 参数首位
    4. 将工具定义传递给 `adapter.streamMessage()` 的 tools 参数
  - 使用 `DynamicPromptBuilder`（已存在于 DelegateEngine）构建系统提示词
  - 确保工具执行结果通过 streaming 事件回传到UI

  **Must NOT do**:
  - 不要修改 `DynamicPromptBuilder` 本身的逻辑
  - 不要修改LLM适配器的工具循环实现
  - 不要破坏 agentCode 缺失时的纯聊天模式

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解DynamicPromptBuilder和adapter接口
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 7)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/main/services/delegate/dynamic-prompt-builder.ts:57+` - `DynamicPromptBuilder` 类实现（被 delegate-engine.ts 导入使用）
  - `src/main/ipc/handlers/message.ts:110-214` - 当前 direct 模式的 streaming 实现
  - `src/main/services/delegate/prompts/fuxi.ts` - 伏羲的角色提示词模板（其他agent同理）
  - `src/main/services/tools/tool-execution.service.ts` - 统一工具执行管道

  **API/Type References**:
  - `src/shared/agent-definitions.ts` - `AgentDefinition.tools` 字段定义了每个agent的可用工具列表
  - `src/main/services/llm/adapter.interface.ts:77-79` - `LLMAdapter` 接口定义，`streamMessage()` 方法签名（确认 `systemPrompt` 和 `tools` 参数如何传递）

  **WHY Each Reference Matters**:
  - `delegate-engine.ts:592-814`: DynamicPromptBuilder已存在，应复用其逻辑而非重新实现
  - `message.ts:110-214`: 这是需要修改的目标区域，必须在保留streaming功能的前提下注入Agent身份

  **Acceptance Criteria**:
  - [ ] 选择fuxi + 发送消息 → LLM收到伏羲的规划者系统提示词
  - [ ] 选择luban + 发送消息 → LLM收到鲁班的深度工作者系统提示词 + 浏览器工具定义
  - [ ] 不选agent + 发送消息 → 行为与当前完全一致（无系统提示词注入）
  - [ ] 工具调用结果通过 `message:stream-chunk` 事件回传到UI
  - [ ] `pnpm typecheck` 无错误

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Fuxi receives planner system prompt
    Tool: Bash (vitest)
    Steps:
      1. Mock LLM adapter, 捕获 streamMessage 调用参数
      2. 调用 handleMessageSend({ agentCode: 'fuxi', content: 'hello', sessionId: 'test' })
      3. Assert: streamMessage 的 messages[0].role === 'system'
      4. Assert: system message 包含 "规划" 或 "planner" 关键词
    Expected Result: 伏羲的系统提示词被注入

  Scenario: Luban receives browser tools
    Tool: Bash (vitest)
    Steps:
      1. Mock LLM adapter, 捕获 streamMessage 调用参数
      2. 调用 handleMessageSend({ agentCode: 'luban', content: 'hello', sessionId: 'test' })
      3. Assert: tools 参数包含 'browser_navigate', 'browser_click' 等浏览器工具
    Expected Result: 鲁班获得完整工具集
  ```

  **Commit**: YES
  - Message: `feat(agents): inject agent-specific system prompts and tools in direct-enhanced mode`
  - Files: `src/main/ipc/handlers/message.ts`

---

- [x] 4. 事件桥接服务（P1 实时管道）

  **What to do**:
  - 新建 `src/main/services/event-bridge.service.ts`:
    1. 监听 `workflowEvents` 的所有事件 (`task:assigned`, `task:started`, `task:completed`, `task:failed`, `workflow:completed`)
    2. 将事件通过 `BrowserWindow.webContents.send(EVENT_CHANNELS.TASK_STATUS_CHANGED, payload)` 转发到渲染进程
    3. 仅发送到发起该session的BrowserWindow（通过session→window映射）
  - 在 `src/main/index.ts` 的应用启动时初始化 EventBridgeService
  - 事件payload包含: `{ taskId, status, agentCode, sessionId, progress, parentTaskId }`
  - 添加事件去抖/批处理：短时间内多个事件合并为一次发送（100ms窗口）

  **Must NOT do**:
  - 不要向所有BrowserWindow广播事件
  - 不要在事件桥接中执行业务逻辑
  - 不要创建新的IPC通道定义 — 使用已有的 `EVENT_CHANNELS.TASK_STATUS_CHANGED`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解Electron进程模型和事件系统
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/main/services/workforce/events.ts` - `workflowEvents` EventEmitter 定义和事件类型
  - `src/main/services/workforce/workforce-engine.ts:335,389,415,494` - 4处 `workflowEvents.emit()` 调用
  - `src/main/services/browser-view.service.ts` - 参考已有的 browser state → IPC 事件桥接模式
  - `src/shared/ipc-channels.ts` - `EVENT_CHANNELS.TASK_STATUS_CHANGED` 已定义

  **API/Type References**:
  - `src/preload/api.ts:13-18` - `ALLOWED_EVENT_CHANNELS` 白名单定义（包含 `task:status-changed`）
  - `src/renderer/src/components/workflow/WorkflowView.tsx:162` - UI已监听此事件

  **WHY Each Reference Matters**:
  - `browser-view.service.ts`: 这是项目中已有的"事件桥接"最佳实践，新服务应遵循相同模式
  - `WorkflowView.tsx:162`: UI端已准备好接收事件，确认payload格式匹配

  **Acceptance Criteria**:
  - [ ] `EventBridgeService` 在应用启动时注册
  - [ ] `workflowEvents.emit('task:started', ...)` → 渲染进程收到 `task:status-changed` 事件
  - [ ] 事件仅发送到正确的BrowserWindow
  - [ ] 100ms内多个事件被批处理
  - [ ] `pnpm typecheck` 无错误

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Workflow events reach renderer
    Tool: Bash (vitest)
    Steps:
      1. 创建 EventBridgeService 实例，mock BrowserWindow.webContents
      2. emit workflowEvents('task:started', { taskId: 'task-1', sessionId: 'sess-1' })
      3. Assert: webContents.send 被调用 with ('task:status-changed', payload)
      4. Assert: payload.taskId === 'task-1'
    Expected Result: 事件正确转发

  Scenario: Events batched within 100ms window
    Tool: Bash (vitest)
    Steps:
      1. 在50ms内连续emit 5个事件
      2. 等待150ms
      3. Assert: webContents.send 被调用 1-2 次（而非5次）
    Expected Result: 事件被去抖
  ```

  **Commit**: YES
  - Message: `feat(events): create event bridge service forwarding workflow events to renderer`
  - Files: `src/main/services/event-bridge.service.ts`, `src/main/index.ts`

---

- [x] 5. UI 实时 WorkflowView 更新 + 自动切换（P1 可视化）

  **What to do**:
  - 修改 `ChatPage.tsx`：
    1. 当消息触发 `workforce` 策略时，自动切换到 `workflow` 视图模式
    2. 在视图切换时显示通知/动画提示"任务分解中..."
    3. Workforce完成后允许切换回chat视图查看最终结果
  - 修改 `WorkflowView.tsx`：
    1. 接收 `task:status-changed` 事件后实时更新节点状态和颜色
    2. 新任务节点出现时自动布局调整
    3. 任务完成时显示完成动画
  - 确保 `AgentWorkViewer` 在workflow模式下也显示各agent的活动

  **Must NOT do**:
  - 不要添加任务拖拽/手动创建功能
  - 不要重写WorkflowView的React Flow实现
  - 不要在WorkflowView中显示LLM streaming内容（Phase 2）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端UI/UX变更，涉及动画和视图状态管理
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 视图切换UX和动画效果

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, final)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `src/renderer/src/pages/ChatPage.tsx` - 当前视图切换逻辑（chat/workflow/agent模式）
  - `src/renderer/src/components/workflow/WorkflowView.tsx` - 已实现的React Flow DAG组件
  - `src/renderer/src/hooks/useStreamingEvents.ts` - 参考此hook的事件监听模式

  **API/Type References**:
  - `src/shared/ipc-channels.ts` - `EVENT_CHANNELS.TASK_STATUS_CHANGED` payload结构
  - `src/preload/index.ts` - `window.codeall.on()` API

  **Acceptance Criteria**:
  - [ ] 选择haotian + 发送复杂任务 → UI自动切换到WorkflowView
  - [ ] WorkflowView中出现任务节点，状态从 pending → running → completed 实时变化
  - [ ] 所有任务完成后，用户可切换回chat查看汇总结果
  - [ ] 任务失败时节点显示红色错误状态

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Auto-switch to WorkflowView on workforce trigger
    Tool: Playwright (playwright skill)
    Preconditions: 开发服务器运行在 localhost, 已配置模型
    Steps:
      1. Navigate to: http://localhost:5173
      2. 选择 haotian agent
      3. 在消息输入框输入 "创建一个用户认证系统"
      4. 点击发送
      5. Wait for: WorkflowView 容器出现 (timeout: 10s)
      6. Assert: 至少1个任务节点在 WorkflowView 中可见
      7. Screenshot: .sisyphus/evidence/task-5-workflow-view.png
    Expected Result: UI自动切换到工作流视图并显示任务节点
    Evidence: .sisyphus/evidence/task-5-workflow-view.png

  Scenario: Task nodes update status in real-time
    Tool: Playwright (playwright skill)
    Preconditions: 已触发workforce模式
    Steps:
      1. 等待第一个任务节点出现
      2. Assert: 节点包含 status 标签（pending/running/completed）
      3. Wait for: 状态变化 (timeout: 60s)
      4. Screenshot: .sisyphus/evidence/task-5-status-update.png
    Expected Result: 节点状态实时更新
    Evidence: .sisyphus/evidence/task-5-status-update.png
  ```

  **Commit**: YES
  - Message: `feat(ui): auto-switch to WorkflowView and real-time task status updates`
  - Files: `src/renderer/src/pages/ChatPage.tsx`, `src/renderer/src/components/workflow/WorkflowView.tsx`

---

- [x] 6. ArtifactRail 挂载到主布局（P1 产物可视化）

  **What to do**:
  - 将已存在的 `src/renderer/src/components/artifact/ArtifactRail.tsx` 挂载到 `MainLayout.tsx` 或 `ChatPage.tsx`
  - 作为可折叠侧边面板，显示当前session中agent生成的文件产物
  - 点击产物项目时在 ContentCanvas 中打开预览
  - 确保 `useArtifactStore` 正确通过 `artifact:list` IPC获取数据

  **Must NOT do**:
  - 不要重写ArtifactRail组件
  - 不要修改artifact的IPC通道

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 组件已存在，仅需挂载和布局调整
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 布局集成

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/renderer/src/components/artifact/ArtifactRail.tsx` - 已实现的组件
  - `src/renderer/src/components/layout/MainLayout.tsx` - 当前布局结构
  - `src/renderer/src/store/artifact.store.ts` - Zustand store，已连接IPC
  - `src/renderer/src/components/canvas/ContentCanvas.tsx` - 产物预览组件

  **Acceptance Criteria**:
  - [ ] ArtifactRail 在主界面可见
  - [ ] 显示当前session的文件产物列表
  - [ ] 点击产物 → ContentCanvas中打开预览
  - [ ] 侧边面板可折叠/展开

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: ArtifactRail visible in main layout
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: http://localhost:5173
      2. Assert: ArtifactRail 容器在页面中可见
      3. Screenshot: .sisyphus/evidence/task-6-artifact-rail.png
    Expected Result: ArtifactRail组件已挂载并可见
    Evidence: .sisyphus/evidence/task-6-artifact-rail.png
  ```

  **Commit**: YES
  - Message: `feat(ui): mount ArtifactRail in main layout`
  - Files: `src/renderer/src/components/layout/MainLayout.tsx` or `src/renderer/src/pages/ChatPage.tsx`

---

- [x] 7. HookManager 接线（P2 生命周期基础）

  **What to do**:
  - 在 `src/main/services/tools/tool-execution.service.ts` 的 `executeToolCalls()` 方法中：
    1. 工具执行前调用 `hookManager.emitToolStart(toolName, params)`
    2. 工具执行后调用 `hookManager.emitToolEnd(toolName, result)`
  - 在 `handleMessageSend` 中：
    1. 收到用户消息时调用 `hookManager.emitMessageCreate(message)`
  - 确保hook执行是非阻塞的：如果hook抛出异常，日志记录并继续执行
  - 在 `src/main/index.ts` 应用启动时初始化 HookManager

  **Must NOT do**:
  - 不要修改 HookManager 本身的实现
  - 不要添加新的hook事件类型
  - 不要让hook执行阻塞主流程
  - 不要在每个LLM适配器中单独接线 — 统一在 `toolExecutionService` 层

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解hook系统和工具执行管道
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/services/hooks/manager.ts` - HookManager 完整实现（registration, emit, priority ordering）
  - `src/main/services/tools/tool-execution.service.ts` - `executeToolCalls()` 方法，接线目标
  - `src/main/ipc/handlers/message.ts` - `handleMessageSend` 消息入口

  **Acceptance Criteria**:
  - [ ] HookManager 在应用启动时初始化
  - [ ] 工具执行时 `emitToolStart` 和 `emitToolEnd` 被调用
  - [ ] hook抛出异常时不阻塞工具执行
  - [ ] `pnpm typecheck` 无错误

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Hook emits on tool execution
    Tool: Bash (vitest)
    Steps:
      1. 注册一个测试hook到HookManager
      2. 执行一个工具调用 (如 file-read)
      3. Assert: 测试hook的 onToolStart 被调用 with toolName === 'file-read'
      4. Assert: 测试hook的 onToolEnd 被调用 with result
    Expected Result: Hook正确触发

  Scenario: Hook error doesn't block execution
    Tool: Bash (vitest)
    Steps:
      1. 注册一个会throw Error的hook
      2. 执行一个工具调用
      3. Assert: 工具执行成功完成（未被hook异常阻断）
      4. Assert: 错误被记录到日志
    Expected Result: 工具执行不受hook异常影响
  ```

  **Commit**: YES
  - Message: `feat(hooks): wire HookManager into tool execution pipeline`
  - Files: `src/main/services/tools/tool-execution.service.ts`, `src/main/ipc/handlers/message.ts`, `src/main/index.ts`

---

- [x] 8. 内置 Hooks 实现（P2 生命周期功能）

  **What to do**:
  - 实现 `src/main/services/hooks/rules-injector.hook.ts`:
    1. `onMessageCreate` 时扫描当前workspace的 `.sisyphus/rules/*.md` 文件
    2. 将规则内容注入到系统提示词中
    3. 参考omo的 rules-injector 模式
  - 实现 `src/main/services/hooks/todo-continuation.hook.ts`:
    1. `onToolEnd` 时检查 todowrite 工具的执行结果
    2. 如果存在未完成的todo项，注入 `[SYSTEM REMINDER - TODO CONTINUATION]` 到下一条消息
    3. 参考omo的 todo-continuation 模式
  - 实现 `src/main/services/hooks/stop-signal.hook.ts`:
    1. 监听用户的停止信号
    2. 通知所有正在执行的agent停止工作
  - 在应用启动时注册所有内置hooks到 HookManager

  **Must NOT do**:
  - 不要实现动态hook加载/插件系统
  - 不要添加新的hook事件类型（使用HookManager已支持的5种）
  - 不要创建用户面向的hook配置界面

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要理解omo的hook模式并在CodeAll中复现
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 4, 9)
  - **Blocks**: None
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `src/main/services/hooks/manager.ts` - HookManager API（registerHook, emit方法签名）
  - `参考项目/oh-my-opencode/` - omo的hook实现（如有）

  **External References**:
  - omo源码 hooks 目录: `https://github.com/code-yeongyu/oh-my-opencode/tree/dev/src/hooks` — rules-injector, todo-continuation, stop-continuation-guard 的参考实现

  **WHY Each Reference Matters**:
  - `manager.ts`: 需要了解hook注册API才能正确实现hooks
  - omo hooks: 这是CodeAll要复现的目标行为

  **Acceptance Criteria**:
  - [ ] rules-injector: workspace有 `.sisyphus/rules/no-console-log.md` → agent收到包含该规则的系统提示词
  - [ ] todo-continuation: agent使用todowrite后有未完成项 → 下一轮注入提醒
  - [ ] stop-signal: 用户发送停止信号 → 正在执行的agent接收到中止通知
  - [ ] 所有hooks在启动时自动注册

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Rules injector appends workspace rules
    Tool: Bash (vitest)
    Steps:
      1. 创建测试workspace目录 with .sisyphus/rules/test-rule.md
      2. test-rule.md 内容: "Never use console.log"
      3. 触发 onMessageCreate hook
      4. Assert: 注入的系统提示词包含 "Never use console.log"
    Expected Result: 规则被注入到系统提示词

  Scenario: Todo continuation injects reminder
    Tool: Bash (vitest)
    Steps:
      1. 模拟 todowrite 工具返回 { todos: [{ status: 'in_progress', content: 'Fix bug' }] }
      2. 触发 onToolEnd('todowrite', result)
      3. Assert: 下一条消息被标记需要注入 TODO CONTINUATION 提醒
    Expected Result: 未完成todo触发续跑提醒
  ```

  **Commit**: YES
  - Message: `feat(hooks): implement rules-injector, todo-continuation, and stop-signal hooks`
  - Files: `src/main/services/hooks/rules-injector.hook.ts`, `src/main/services/hooks/todo-continuation.hook.ts`, `src/main/services/hooks/stop-signal.hook.ts`, `src/main/index.ts`

---

- [x] 9. 安全加固（P3 安全性）

  **What to do**:
  - **文件读取路径限制**:
    1. 修改 `src/main/ipc/handlers/artifact.ts` 的 `file:read` handler
    2. 添加路径验证：仅允许读取当前Space的 `workDir` 及其子目录
    3. 拒绝包含 `..` 的路径遍历攻击
    4. 同样限制 `file:write` 和 `file:list` handlers
  - **审计日志覆盖**:
    1. 在 `file:read`, `file:write`, `bash:execute` 等敏感IPC handler中添加审计日志记录
    2. 使用已有的 `AuditLogService`
    3. 日志包含: 操作类型、文件路径、用户session、时间戳
  - **主窗口安全增强**:
    1. 评估 `sandbox: false` 的必要性
    2. 如非必要，启用 `sandbox: true` 或添加安全策略说明

  **Must NOT do**:
  - 不要实现进程级沙箱隔离
  - 不要修改BrowserView的隔离设置（已正确隔离）
  - 不要移除 `file:read` 功能 — 仅添加路径验证
  - 不要影响开发体验（dev模式可以宽松检查）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 安全相关修改需要谨慎，理解Electron安全模型
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 4, 8)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/ipc/handlers/artifact.ts:7-16` - 当前 `file:read` handler，无路径验证
  - `src/main/services/audit-log.service.ts` - 已有的审计日志服务
  - `src/main/index.ts:135-141` - 主窗口配置（sandbox: false）

  **External References**:
  - Electron Security Checklist: `https://www.electronjs.org/docs/latest/tutorial/security`

  **Acceptance Criteria**:
  - [ ] `file:read('/etc/passwd')` → 被拒绝（路径不在workspace内）
  - [ ] `file:read('../../sensitive-file')` → 被拒绝（路径遍历）
  - [ ] `file:read('/workspace/src/index.ts')` → 正常返回（workspace内路径）
  - [ ] 每次 `file:read/write` 都有审计日志记录
  - [ ] `pnpm typecheck` 无错误

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: File read blocked outside workspace
    Tool: Bash (vitest)
    Steps:
      1. 设置当前Space的workDir为 '/test/workspace'
      2. 调用 file:read handler with path '/etc/passwd'
      3. Assert: 返回错误 "Path outside workspace"
      4. Assert: 审计日志记录此次拒绝
    Expected Result: 路径验证拒绝越界读取

  Scenario: Path traversal attack blocked
    Tool: Bash (vitest)
    Steps:
      1. 调用 file:read handler with path '/test/workspace/../../etc/passwd'
      2. Assert: 路径规范化后被拒绝
    Expected Result: 路径遍历被阻止

  Scenario: Audit log captures file operations
    Tool: Bash (vitest)
    Steps:
      1. 调用 file:read handler with valid path
      2. 查询 AuditLog: prisma.auditLog.findMany({ where: { action: 'file:read' } })
      3. Assert: 日志包含正确的路径和时间戳
    Expected Result: 操作被审计记录
  ```

  **Commit**: YES
  - Message: `security(ipc): add workspace path validation and audit logging for file operations`
  - Files: `src/main/ipc/handlers/artifact.ts`, `src/main/index.ts`

---

## Commit Strategy

| After Task | Message                                                                                | Files                                                                | Verification   |
| ---------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------- |
| 1          | `fix(core): propagate user sessionId through workforce and delegate pipelines`         | workforce-engine.ts, delegate-engine.ts, message.ts, smart-router.ts | pnpm typecheck |
| 2          | `feat(routing): agent selection determines strategy, bypass SmartRouter regex`         | agent-definitions.ts, message.ts                                     | pnpm typecheck |
| 3          | `feat(agents): inject agent-specific system prompts and tools in direct-enhanced mode` | message.ts                                                           | pnpm typecheck |
| 4          | `feat(events): create event bridge service forwarding workflow events to renderer`     | event-bridge.service.ts, index.ts                                    | pnpm typecheck |
| 5          | `feat(ui): auto-switch to WorkflowView and real-time task status updates`              | ChatPage.tsx, WorkflowView.tsx                                       | pnpm typecheck |
| 6          | `feat(ui): mount ArtifactRail in main layout`                                          | MainLayout.tsx or ChatPage.tsx                                       | pnpm typecheck |
| 7          | `feat(hooks): wire HookManager into tool execution pipeline`                           | tool-execution.service.ts, message.ts, index.ts                      | pnpm typecheck |
| 8          | `feat(hooks): implement rules-injector, todo-continuation, and stop-signal hooks`      | hooks/\*.ts, index.ts                                                | pnpm typecheck |
| 9          | `security(ipc): add workspace path validation and audit logging for file operations`   | artifact.ts, index.ts                                                | pnpm typecheck |

---

## Success Criteria

### Verification Commands

```bash
pnpm typecheck          # Expected: 0 errors
pnpm test               # Expected: all tests pass
pnpm test:e2e           # Expected: workflow visualization e2e passes
```

### Final Checklist

- [x] 选择haotian → 任务分解为DAG → 并行执行 → UI实时显示进度
- [x] 选择fuxi → 规划者模式（系统提示词+工具集）
- [x] 选择luban → 深度工作模式（全工具+浏览器）
- [x] 所有任务在用户session中（非默认session）
- [x] Hook系统工作（规则注入+续跑提醒）
- [x] 文件操作受workspace路径限制
- [x] ArtifactRail可见并显示产物
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent

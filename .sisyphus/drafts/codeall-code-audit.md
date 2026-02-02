# Draft: CodeAll 代码审查（对照最初规划）

## 审查目标

- 对照“最初规划提示词”逐条核对当前仓库实现情况（架构/功能/UI/交付/测试/性能）。
- 产出：现状证据（文件路径/关键符号/配置）、差距清单、风险评估、下一步建议。

## 规划需求清单（待核对）

### 1) 架构设计

- 集成 oh-my-opencode：多LLM、多代理协同、并行后台任务、Hook 生命周期治理、持续执行/自动续跑
- 融合 eigent：复杂工作流子任务拆解与并行执行
- 借鉴 ccg-workflow：调度系统与资源分配

### 2) 功能实现

- 移植 moltbot 核心能力模块（不含 moltbot 的 CLI 协同功能）
- hello-halo：内嵌浏览器 + AI 自动操控浏览器
- 多视图并行“工作台”布局：Agent 产物可视化与追踪

### 3) 界面设计

- hello-halo 风格；参考 eigent 页面布局
- Agent 产物可视化/可追踪关键组件
- 可视化管理 LLM 模型与各 Agent 设置
- 后台任务可查看

### 4) 技术要求

- 允许复制 @参考项目 代码；兼容性与可维护性
- 独立应用运行（不依赖原有项目环境）
- 模块无缝集成、稳定性与性能

### 5) 开发流程

- 先核心架构设计与接口通信机制
- 依次集成参考项目模块（不需要 moltbot cli 协同）
- 联调与整体测试
- UI/UX 优化（可用专门子代理）

### 6) 交付标准

- 可独立运行安装包：优先 Windows exe；Linux 远程网页访问版
- 完整源代码与文档
- 单元/集成测试报告
- 性能测试报告（多LLM、多Agent 并发稳定性）

## 证据与发现（持续更新）

### A. “最初规划”来源确认

- 仓库根目录存在 `项目规划.md`，内容与用户提供的最初规划提示词一致，并已包含提示：**moltbot 已更名为 openclaw**。
  - 证据：`项目规划.md:4-33`
- 仓库内亦存在统一计划：`.sisyphus/plans/codeall-unified-plan.md`（大规模 TODO 计划），以及交付计划：`.sisyphus/plans/codeall-final-delivery.md`。

### B. 技术栈与目录结构（当前仓库）

- 包管理：pnpm（`package.json:94-104`）
- Electron + React + TypeScript：
  - 主进程入口：`src/main/index.ts`（待进一步逐行核对）
  - Renderer 入口：`src/renderer/index.html` + `src/renderer/src/index.tsx`
- 构建：electron-vite（`electron.vite.config.ts`）+ electron-builder（`electron-builder.yml`）
- 数据库：Prisma + embedded-postgres（`package.json:28-40`、`src/main/services/database.ts`）
- 多 LLM SDK：Anthropic / OpenAI / Gemini（`package.json:25,30,41`）

### C. 架构实现对照（核心）

#### 1) eigent / Workforce（子任务拆解 + DAG + 并行）

- `WorkforceEngine` 已实现：
  - 任务拆解：`WorkforceEngine.decomposeTask()`（使用 Anthropic 模型并强制 JSON 格式）
  - DAG：`buildDAG()`
  - 并发执行：`executeWorkflow()` 内 `MAX_CONCURRENT = 3` + `Promise.all(batch)`
  - 证据：`src/main/services/workforce/workforce-engine.ts:34-211`

#### 2) ccg-workflow 调度理念（路由/模型选择）

- `SmartRouter` 存在：基于关键词选择策略（delegate/workforce/direct）+ 默认将 UI 指派到 Gemini、后端到 gpt-4、架构到 oracle/claude-opus。
  - 证据：`src/main/services/router/smart-router.ts:32-59,82-106`
- **但** IPC 层当前仅提供路由规则读写（`router:get-rules`, `router:save-rules`），未发现“执行 route”的 IPC。
  - 证据：`src/main/ipc/index.ts:65-71` + `src/main/ipc/handlers/router.ts`

#### 3) oh-my-opencode 概念移植（boulder/continuation 等）

- `BoulderStateService`：持久化 `.sisyphus/boulder.json`（active_plan、进度、blockers 等）
  - 证据：`src/main/services/boulder-state.service.ts:4-170`
- `PlanFileService`：解析 `.sisyphus/plans/*.md` 的 `- [ ] **Task x.y.z**` 并统计完成率
  - 证据：`src/main/services/plan-file.service.ts:38-175`
- `TaskContinuationService` / `AutoResumeTriggerService`：提供“续跑提示词 + 倒计时触发 + idle 评估”的基础能力
  - 证据：`src/main/services/task-continuation.service.ts`、`src/main/services/auto-resume-trigger.service.ts`

### D. 功能实现对照

#### 1) hello-halo：内嵌浏览器 + AI 自动操控

- BrowserView 管理：`browser-view.service.ts`（BrowserView overlay + 安全隔离）
  - 证据：`src/main/services/browser-view.service.ts`
- AI Browser Tools：大量 `browser_*` 工具，并在 Anthropic Adapter 中以 tools 方式调用执行
  - 证据：`src/main/services/ai-browser/tools/*` + `src/main/services/llm/anthropic.adapter.ts:82-178`
- **重要限制**：Anthropic `streamMessage()` 明确标注“TODO：暂不支持 streaming 模式的 tool calls”。
  - 证据：`src/main/services/llm/anthropic.adapter.ts:250-253`

#### 2) openclaw（原 moltbot）核心能力移植

- 在 `src/` 内未发现 `openclaw` / `moltbot` 字符串或 skill/plugin 系统的实际落地（目前更像是“参考项目保留在 参考项目/”而非“能力移植进 CodeAll runtime”）。
  - 证据：对 `D:/网站/CodeAll/src` 的文本搜索（openclaw/moltbot）无命中。

#### 3) 多视图并行工作台（UI）

- 主布局采用 `react-resizable-panels` 实现多栏工作台（Sidebar/Chat/Artifacts/Canvas）。
  - 证据：`src/renderer/src/components/layout/MainLayout.tsx`
- Workflow 任务流可视化：`WorkflowView` 基于 `@xyflow/react`，从 `task:list` 拉取任务并渲染 DAG。
  - 证据：`src/renderer/src/components/workflow/WorkflowView.tsx`

**关键结论（当前 UI 实际运行态）**：应用入口路由挂载的是 `MainLayout`，但 MainLayout 内部使用的是 `components/layout/*` 下的 **Stub/假数据组件**（ChatView/ArtifactRail/ContentCanvas），导致“真实聊天/工作流/产物追踪”等能力虽然在代码中存在，却**未被挂载**。

- 证据：
  - `src/renderer/src/App.tsx:10-13`（`/` -> `MainLayout`）
  - `src/renderer/src/components/layout/ChatView.tsx`（本地 state 假消息）
  - `src/renderer/src/components/layout/ArtifactRail.tsx`（硬编码 artifacts）
  - `src/renderer/src/pages/ChatPage.tsx`（真实 IPC 聊天/Workflow/续跑逻辑，但未路由）
  - `src/renderer/src/components/artifact/ArtifactRail.tsx`（真实产物侧栏，但未接入 MainLayout）
  - `src/renderer/src/components/canvas/ContentCanvas.tsx`（多 tab/生命周期，但未接入 MainLayout）

### E. 测试 / 性能 / 打包

- 单元/集成/E2E/性能测试目录均存在：`tests/unit`, `tests/integration`, `tests/e2e`, `tests/performance`
  - 证据：`tests/performance/concurrent-agents.test.ts` 等
- `pnpm test:performance` 已配置：`package.json:18-19`
- Windows 打包配置存在（NSIS），但 Linux/Mac 专用配置缺失（依赖 electron-builder 默认值）。
  - 证据：`electron-builder.yml:53-74`
- README 声称存在 `pnpm start:web`（Linux Web Server mode），但 `package.json` 未提供该脚本，且代码中未见 server 入口。
  - 证据：`README.md:65-68` vs `package.json:10-23`

补充：在 `参考项目/` 中确实存在 Web server/express 的实现（hello-halo 与 moltbot/openclaw），但未迁移到 CodeAll 主应用 runtime。

- 证据（仅在参考项目命中）：
  - `参考项目/hello-halo/src/main/http/server.ts`（express）
  - `参考项目/moltbot/src/browser/server.ts`（express）

## 风险/缺口（持续更新）

### 1) 许可证/合规风险（高）

- `DelegateEngine` 文件头声明：**adapted from oh-my-opencode (SUL-1.0)**，并写明“internal/non-commercial only”。
  - 这与计划文件中“oh-my-opencode 仅参考思想不复制代码 + CodeAll 最终 MIT License”的策略存在冲突。
  - 证据：`src/main/services/delegate/delegate-engine.ts:3-12`；`.sisyphus/plans/codeall-unified-plan.md:31-41`
  - 影响：若目标是“可独立运行安装包并对外发布”，此处可能构成发布阻塞项。

### 2) “多 Agent + 工具调用”落地不完整（高）

- Chat（`message:send`）走 streaming 模式，当前不会触发工具调用；而 Anthropic tools 仅在 `sendMessage()` 非 streaming 路径执行。
  - 证据：`src/main/ipc/handlers/message.ts:73-83` + `anthropic.adapter.ts:250-253`
- 通用 ToolRegistry/ToolExecutor 已实现，但暂未发现被主流程实际调用；现有 tools 调用集中在 AI Browser（`allTools`）而非全工具栈。
  - 证据：`src/main/services/tools/tool-executor.ts`（搜索未发现调用点）

### 3) UI/功能集成存在“重复实现/未接线”（中-高）

- Renderer 同时存在“完整 ChatPage(含消息流/工作流/续跑)”与“layout/ChatView(本地假数据)”两套实现；当前路由仅挂载 MainLayout，导致 ChatPage 未被使用。
  - 证据：`src/renderer/src/App.tsx:10-13`；`src/renderer/src/pages/ChatPage.tsx`；`src/renderer/src/components/layout/ChatView.tsx`
- ArtifactRail/ContentCanvas 同样存在“layout 版（假数据/未接线）”与“artifact 版（调用 IPC）”两套实现。

### 4) 交付缺口：Linux 远程网页访问版（高）

- README 与统一计划提及 Web Server Mode，但当前仓库缺少 `pnpm start:web` 脚本与 server 代码入口。

### 7) 交付/发布工程化缺口（中-高）

- 自动更新：主进程 `electron-updater` 已接入，但 feed URL 为占位符 `https://example.com/updates`；同时 `electron-builder.yml` 中 `publish: null`。
  - 证据：`src/main/index.ts:154-200`；`electron-builder.yml:73`
- CI/CD：未发现 `.github/workflows`（主仓库）用于测试/发布流水线。
  - 证据：仓库根目录无 `.github/workflows`（但参考项目内存在，不代表主项目已集成）

### 5) 安全风险（中）

- IPC `file:read` 直接读取任意路径，未做 Space/workDir 范围限制；与“workspace isolation”目标冲突。
  - 证据：`src/main/ipc/handlers/artifact.ts:7-16`；对比 `PathValidator.resolveSafePath()` 使用场景。

### 6) IPC 白名单与实际功能不一致（中-高）

- Preload 使用 `ALLOWED_CHANNELS` 白名单限制 IPC，但与主进程已注册的 IPC handler/前端实际调用存在脱节：
  - 例如：`router:get-rules` / `router:save-rules` 已在主进程注册且 SettingsPage 调用，但 **不在** preload 允许列表中，调用会直接被拒。
  - 同理：`keychain:*`, `audit-log:*` 等通道在 preload 中也未出现，意味着对应 UI 很可能无法正常工作。
  - 证据：
    - `src/main/preload.ts:8-64`（白名单）
    - `src/main/ipc/index.ts:65-91`（注册 router/audit-log/keychain handlers）
    - `src/renderer/src/pages/SettingsPage.tsx:96-109,221-234`（调用 router 通道）

## Open Questions

- “最初的规划”是否对应仓库内已有 `.sisyphus/plans/*.md`？如果有，需要以其为准还是以你提供的提示词为准？
- 你希望审查的输出形态：
  - A) 逐条需求对照表 + 证据路径（推荐，利于执行）
  - B) 架构评审报告（偏宏观）
  - C) 安全/质量专项（测试、性能、发布、依赖风险）

（我会继续把证据补齐到该草稿文件中；你也可以直接打开 `.sisyphus/drafts/codeall-code-audit.md` 跟踪进度。）

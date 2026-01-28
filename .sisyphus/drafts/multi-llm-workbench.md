# Draft: Multi-LLM 协同编程与多Agent工作台（独立应用）

## Requirements (confirmed)
- 目标：开发一个**独立运行**的软件（建议 pnpm + Electron + React + TypeScript + Claude Code SDK，最终以项目实际为准）。
- 需融合 `@参考项目/` 内多个应用的核心优势：
  - **oh-my-opencode**：多LLM智能体协同编程框架（并行后台任务、Hook 生命周期治理、持续执行/自动续跑）。
  - **eigent**：多Agent协同架构（复杂流程子任务拆解与并行执行）。
  - **ccg-workflow**：调度系统理念（任务调度与资源分配）。
  - **clawdbot**：完整移植其核心能力模块（但**不需要集成 clawdbot 的 CLI 协同功能**）。
  - **hello-halo**：内嵌浏览器 + AI自动操控浏览器；并沿用其 UI 风格。
- 功能：多视图并行“工作台”布局；Agent 产物**可视化、可追踪**。
- 技术要求：允许直接复制 `@参考项目/` 中代码；新软件**不依赖原项目环境**；模块无缝集成、稳定与性能。
- 流程：先架构设计与模块接口/通信 → 依次集成功能模块 → 联调与整体测试 → UI/UX 优化。
- 交付：可安装包；源代码与文档；单测/集成测试报告；性能测试报告（多LLM+多Agent并发时稳定）。

## Scope Boundaries
- INCLUDE: Electron 桌面独立应用；多LLM/多Agent编排；内嵌浏览器与自动化；工作台UI；测试与性能报告。
- EXCLUDE: clawdbot 的 CLI 协同功能。

## Technical Decisions (pending)
- 运行时与架构：Electron Main/Renderer 职责划分、后台任务执行模型（worker threads / child_process / node services）。
- LLM Provider 适配：Claude Code SDK 为主？是否同时支持 OpenAI / Gemini / 本地模型（Ollama）等。
- 调度：DAG/队列/优先级/资源配额策略细节。
- 数据存储：任务、产物、对话、日志、缓存、凭据的本地存储方案（SQLite/LevelDB/文件）。
- 安全：API Key 存储（系统 Keychain）、沙盒、浏览器权限控制。
- 打包与更新：electron-builder/electron-forge；自动更新策略。

## Research Findings (pending)
### 本地参考项目目录
- 参考项目实际位于：`参考项目/`（而不是 `@参考项目/`）
  - `参考项目/oh-my-opencode`
  - `参考项目/eigent`
  - `参考项目/ccg-workflow`
  - `参考项目/clawdbot`
  - `参考项目/hello-halo`

### 许可（必须在可分发产品前确认）
- `参考项目/oh-my-opencode`：**Sustainable Use License (SUL-1.0)**（`参考项目/oh-my-opencode/LICENSE.md`）
  - 关键点：许可文本明确限制“仅内部业务用途或非商业/个人用途”；对“分发”也限定为免费且非商业。
- `参考项目/hello-halo`：MIT（`参考项目/hello-halo/LICENSE`）
- `参考项目/ccg-workflow`：MIT（`参考项目/ccg-workflow/LICENSE`）
- `参考项目/clawdbot`：MIT（`参考项目/clawdbot/LICENSE`）
- `参考项目/eigent`：Apache-2.0（`参考项目/eigent/LICENSE`）

### 可复用实现的“锚点文件”（已定位到路径）
- hello-halo 内嵌浏览器：
  - `参考项目/hello-halo/src/main/services/browser-view.service.ts`（`BrowserViewManager`，支持多 BrowserView 管理、状态跟踪、sandbox 等）
  - `参考项目/hello-halo/src/main/services/ai-browser/sdk-mcp-server.ts`（`createAIBrowserMcpServer()`）
  - `参考项目/hello-halo/src/main/services/ai-browser/snapshot.ts`（`Accessibility.getFullAXTree`）
  - `参考项目/hello-halo/src/main/services/ai-browser/context.ts`（`webContents.debugger` 发送 CDP 指令）
- oh-my-opencode 并行后台任务与持续执行：
  - `参考项目/oh-my-opencode/src/features/background-agent/manager.ts`（`BackgroundManager`：任务生命周期、并发队列、清理）
  - `参考项目/oh-my-opencode/src/features/background-agent/concurrency.ts`（`ConcurrencyManager`：按 model/provider/default 限流）
  - `参考项目/oh-my-opencode/src/hooks/todo-continuation-enforcer.ts`（TODO 未完成时自动续跑）
  - `参考项目/oh-my-opencode/src/features/boulder-state/storage.ts`（`.sisyphus/boulder.json` 持久化）
- eigent 多Agent拆解/编排（Python 后端模式）：
  - `参考项目/eigent/backend/app/utils/workforce.py`（Workforce：拆解、依赖、失败处理、事件）
  - `参考项目/eigent/backend/app/utils/single_agent_worker.py`（worker pool / autoscale 概念）
- ccg-workflow 调度理念（DAG + 并行 worker 上限）：
  - `参考项目/ccg-workflow/codeagent-wrapper/executor.go`（`topologicalSort`、分层并行、worker 限制）
- clawdbot 核心能力模块/子任务（Subagent）机制参考：
  - `参考项目/clawdbot/src/agents/tools/sessions-spawn-tool.ts`（`sessions_spawn`，子会话并行）
  - `参考项目/clawdbot/src/agents/subagent-registry.ts`（run 记录、落盘、announce-back）
  - `参考项目/clawdbot/src/agents/pi-tools.policy.ts`（子代理工具 denylist，安全边界）

## Open Questions
1. 目标平台（Windows/macOS/Linux）与发布渠道？
2. MVP 范围：第一版必须包含哪些能力？
3. LLM 供应商与模型：仅 Claude（Claude Code SDK）还是多家并存？
4. 浏览器自动化：Playwright / CDP / 自研控制？以及需要哪些能力（登录、截图、表单填写、抓取）？
5. 合规/安全：是否需要离线模式、企业代理、日志脱敏、权限分级？
6. **许可/商业化**：最终产品是否用于商业用途或收费分发？（这将直接影响能否“直接复制”oh-my-opencode 代码。）

# Hello-Halo 综合技术特点总结（结合源码与 3 份总结）

> 说明：以下内容融合了源码可确认事实与三份既有总结中的观点。对“推断/建议”类内容会明确标注，避免把猜测当作事实。

## 1. 项目定位与总体结构

Halo 的核心定位是：把 **Claude Code CLI 的 Agent 能力**变成**可视化桌面应用**，并在此基础上增强远程访问与内嵌浏览器能力。

- **产品定位**：可视化 AI Agent（“Windows 之于 DOS”式类比），面向非 CLI 用户，保留 Claude Code 的完整工具链能力。
- **关键差异**：Space 工作区隔离、Artifact Rail 产物可视化、内置 AI 浏览器、远程访问、MCP 扩展。
- **架构骨架（README 可证实）**：Electron 三段式架构 —— Renderer(React UI) ⇄ Main(服务层) ⇄ Claude Code SDK(Agent Loop)；本地数据持久化到 `~/.halo/`。
- **“Real Agent Loop”**：不是聊天外壳，而是“规划 → 工具调用 → 结果观察 → 再规划”的循环。
- **多供应商与开放性**：支持 Anthropic、OpenAI、DeepSeek 与任意 OpenAI 兼容 API（通过 openai-compat-router），并支持 MCP 服务器扩展。

## 2. 多 UI 界面设计（Space + 多面板 + 响应式）

Halo 的 UI 不是单一聊天页面，而是多视图并行的“工作台”式布局。

- **SpacePage 结构**：聊天主视图 + Artifact Rail + Content Canvas（右侧/可扩展）+ 顶部工具栏（模型切换、搜索、导航）。
- **布局模式**：  
  - Chat mode：无 Canvas 时聊天全宽  
  - Canvas mode：聊天与 Canvas 分栏  
  - Mobile mode：Canvas 以 overlay 方式叠加
- **布局偏好持久化**：聊天宽度、Rail 展开状态按 Space 保存；窗口最大化时调整布局策略。
- **多对话与空间隔离**：每个 Space 有独立会话列表，切换 Space 时同步切换 Canvas/Artifact 状态。
- **响应式与远程适配**：移动端强调“聊天优先 + 工件/Canvas 抽屉化”，满足 Remote Access 场景。
- **过程可视化**：UI 侧存在 Thought/Tool 卡片与状态展示（思考、工具调用、结果回流），强调“Agent Loop 可见性”。

## 3. Content Canvas 与多类型内容视图

Content Canvas 是核心 UI 区域之一，承载“文件/网页/数据”的多类型预览。

- **Tab 化内容管理**：支持多标签页、快捷键（如 Cmd/Ctrl+T/W/Tab）和保存/编辑状态。
- **Viewer 类型**：Code、Markdown、HTML、JSON、CSV、Text、Image、Browser/PDF 等。
- **编辑与回写**：CodeViewer 支持编辑与保存，MarkdownViewer 允许切换编辑模式。
- **远程模式降级**：远程访问场景下 BrowserView 不可用，使用 `BrowserViewerFallback` 进行替代渲染。

## 4. Artifact Rail 与产物可视化

Artifact Rail 是把 Agent 产物“可视化、可追踪”的关键 UI。

- **文件树/卡片视图**：支持树结构展示与懒加载，文件类型自动识别。
- **实时更新**：通过 artifact-cache 与文件系统 watcher（chokidar）监听变更并触发 UI 更新。
- **预览覆盖面**：代码、图片、HTML、Markdown 等可直接预览，降低“终端输出不可见”的门槛。
- **路径安全**：读取目录时做 workspace 范围校验，避免路径穿越。

## 5. 内置浏览器（BrowserView）实现

Halo 在桌面端内嵌真正的 Chromium 渲染内核（非 iframe），由主进程统一管理。

- **BrowserViewManager**：支持多实例 BrowserView 并行存在，记录 url/title/loading/back/forward/zoom/devtools 状态。
- **安全与隔离**：启用 sandbox、contextIsolation、禁用 nodeIntegration；使用独立 `persist:browser` 分区保存 Cookie/Storage。
- **反检测与体验**：自定义 Chrome UA；支持导航、回退/前进、刷新、截图、JS 执行、缩放与 DevTools。
- **视图定位与生命周期**：通过 CanvasLifecycle 控制 BrowserView 的创建、显示、隐藏与 bounds 更新。

## 6. BrowserViewer（内置浏览器 UI 外壳）

内置浏览器不仅是渲染内核，还有完整的 UI 外壳。

- **功能覆盖**：地址栏（URL/搜索自动识别）、导航、刷新、主页、截图、外部打开、缩放、DevTools。
- **AI 控制提示**：当 AI 正在操作该页面时，UI 显示“AI 操作中”提示。
- **PDF 模式**：简化 UI，以适应 PDF 或文档场景。
- **UI 与 Main 解耦**：UI 负责“浏览器壳子”，实际渲染与生命周期交给 Main 进程的 BrowserView。

## 7. AI Browser 的核心技术实现（CDP + 可访问树 + 26 工具）

AI Browser 是 Halo 的差异化核心，支持 AI 自动浏览与操作网页。

- **CDP 驱动**：通过 `webContents.debugger` 发送 CDP 指令，覆盖导航、输入、截图、性能等能力。
- **可访问树快照**：基于 `Accessibility.getFullAXTree` 生成可访问树，生成 UID 并过滤交互/结构角色，AI 无需依赖 CSS selector。
- **工具集（共 26 个）**：按导航、输入、快照、网络、控制台、模拟、性能分类；示例包括  
  - 导航类：`browser_new_page` / `browser_navigate` / `browser_list_pages`  
  - 输入类：`browser_click` / `browser_fill` / `browser_fill_form` / `browser_press_key` / `browser_upload_file`  
  - 快照类：`browser_snapshot` / `browser_screenshot` / `browser_evaluate`
- **监控能力**：网络请求与 console 事件可被工具读取；支持对话框处理与页面等待机制。
- **懒加载**：AI Browser 模块通过 IPC 延迟初始化，避免影响启动性能。

## 8. AI 自动调用内置浏览器的“集成链路”

这是“AI 自动操控内置浏览器”落地的关键工程路径：

- **Prompt 层**：`AI_BROWSER_SYSTEM_PROMPT` 被追加到系统提示中，明确要求使用 `mcp__ai-browser__*` 工具与推荐流程（新页面 → 快照 → UID → 操作 → 复查）。
- **SDK/MCP 层**：`createAIBrowserMcpServer()` 将 AI Browser 工具注册为 in-process MCP server（`ai-browser`），SDK 直接调用，不依赖外部进程。
- **会话配置层**：`aiBrowserEnabled` 开关决定是否注入 MCP server 及系统 prompt，确保会话级别可控。
- **权限层**：`createCanUseTool` 对 AI Browser 工具默认放行；文件/命令类工具严格限制在 workspace 或需批准。
- **状态同步层**：Renderer 的 `ai-browser.store` 监听 `ai-browser:active-view-changed`，与 BrowserTaskCard/BrowserViewer 联动实现“View Live”与 AI 操作指示。

## 9. 远程访问与多端一致性

Halo 支持“桌面端 + 手机/浏览器远程访问”的双形态。

- **Remote Service**：Main 进程启动 HTTP + WebSocket 服务，并可通过 Cloudflare tunnel 外网暴露。
- **鉴权方式**：Token + QR Code（支持带 token 的 URL 生成）。
- **多端 UI 复用**：远程模式复用 React UI，同时针对 BrowserView 不可用场景提供 fallback。

## 10. 其他关键技术与工程特征

- **状态管理**：Zustand（多个 store 管理空间/对话/Canvas/AI Browser/搜索/性能等）。
- **样式与主题**：TailwindCSS + dark/light theme；i18next 多语言支持。
- **测试体系**：Vitest 单元测试 + Playwright E2E（含 remote/chat/smoke 场景）。
- **反检测与性能**：存在 stealth 模块（如 navigator.webdriver/WebGL vendor 等）与 perf collector。
- **工具权限体系**：支持“每次批准/自动允许/拒绝”策略，保证命令执行安全性。

## 11. 来自 3 份总结中的补充观点（标注推断）

以下内容来自既有总结中的观点，源码未完全确认，故标注为推断：

- **推断：UI 组件体系可能结合 Headless/UI 或 Shadcn 风格**（因为 Tailwind + lucide 使用方式类似该生态）。
- **推断：Agent Loop 可能存在 PTY/CLI 包装层**（当前代码显示 Claude Code SDK 为主，是否仍有 PTY 需要进一步验证）。
- **推断：Agentic Scraping 与 Human-in-the-loop 流程**在产品层面成立：真实浏览器 + 可访问树 + 用户接管验证码流程，与现有 AI Browser 架构相匹配。

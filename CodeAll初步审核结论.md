0) 结论先行（当前最关键的 5 个阻塞点）
工作台 UI 目前跑的是 Stub/假数据组件，真实的 Chat/Workflow/Artifact/Canvas 组件虽然存在，但未挂载到入口路由，导致多数能力“看起来有、实际上用不上”。
证据：src/renderer/src/App.tsx、src/renderer/src/components/layout/{ChatView,ArtifactRail,ContentCanvas}.tsx（stub） vs src/renderer/src/pages/ChatPage.tsx、src/renderer/src/components/{artifact,canvas}/*（真实但未接线）
“多 Agent + 工具调用闭环”未打通：
Anthropic 的工具循环只在 sendMessage() 里跑，streamMessage() 明确不支持 tool calls；而 UI 聊天走 streaming（message:send），所以“聊天+工具”闭环断裂。
证据：src/main/ipc/handlers/message.ts + src/main/services/llm/anthropic.adapter.ts:250-253
通用工具系统存在但未成为主流程：ToolRegistry/ToolExecutor 已实现并注册了 file/browser 的部分工具，但未看到被主聊天/任务执行引擎统一接管；并且 OpenAI/Gemini 适配器没有 tool loop。
证据：src/main/services/tools/*、src/main/services/llm/openai.adapter.ts、src/main/services/llm/gemini.adapter.ts
Linux 远程网页访问版（Web Server mode）在主工程缺失：README/计划提到 pnpm start:web，但 package.json 没有该脚本，也没找到 server 入口；相关 server 代码只存在于 参考项目/。
证据：README.md:65-68 vs package.json:scripts；参考项目/hello-halo/.../server.ts、参考项目/moltbot/.../server.ts
合规/安全双重风险：
合规：DelegateEngine 文件头声明来自 oh-my-opencode（SUL-1.0，internal/non-commercial），与“最终 MIT、可对外发包”的目标存在冲突。
安全：file:read IPC 可读任意路径；主窗口 sandbox: false；审计日志未覆盖敏感系统操作。
证据：src/main/services/delegate/delegate-engine.ts、src/main/ipc/handlers/artifact.ts、src/main/index.ts
1) 架构设计（oh-my-opencode + eigent + ccg-workflow）
1.1 oh-my-opencode：多LLM/多Agent/后台并行/Hook 生命周期/持续执行与续跑
已实现（部分）

多 LLM 适配层：Anthropic/OpenAI/Gemini/OpenAI-Compat
证据：src/main/services/llm/*、package.json:dependencies
“持续执行/续跑”相关状态与解析：
boulder.json 状态持久化：src/main/services/boulder-state.service.ts
plan 解析：src/main/services/plan-file.service.ts
continuation/idle 判定：src/main/services/task-continuation.service.ts、src/main/services/auto-resume-trigger.service.ts
缺失/偏离（关键）

Hook 生命周期治理（pre/post tool、stop、rules injector 等）未看到中心化 Hook 系统（只有零散 service/event）。
证据：全仓 src/main 未发现 hook registry/middleware；仅见 workforce/events.ts 为被动事件。
通用工具调用闭环未完成：工具循环在 AnthropicAdapter.sendMessage() 内部硬编码；OpenAI/Gemini 无 tool loop；且 streaming 不支持 tool calls。
证据：src/main/services/llm/anthropic.adapter.ts、openai.adapter.ts、gemini.adapter.ts
1.2 eigent：Workforce 子任务拆解 + DAG + 并行执行
基本达成

WorkforceEngine：分解 3-5 子任务、依赖 DAG、并发 MAX_CONCURRENT=3 批量执行。
证据：src/main/services/workforce/workforce-engine.ts
1.3 ccg-workflow：路由/调度/资源分配理念
部分达成

SmartRouter：按关键词选择 delegate/workforce/direct，并带模型 fallback 逻辑。
证据：src/main/services/router/smart-router.ts
但：当前 IPC 仅提供“路由规则读写”，没看到一个“把用户输入真正 route 并执行”的入口；聊天主流程走 message:send 直接 LLM stream。
证据：src/main/ipc/index.ts、src/main/ipc/handlers/router.ts、src/main/ipc/handlers/message.ts
2) 功能实现（openclaw + hello-halo + 工作台）
2.1 openclaw（原 moltbot）核心能力模块移植（不含 CLI 协同）
现状：主工程基本未落地

在 src/ 中未发现 openclaw/moltbot 的技能系统/插件系统/网关等落地痕迹；更多是“参考项目保留在 参考项目/”。
证据：src 内文本搜索无 openclaw/moltbot 命中；参考项目/ 目录存在 moltbot（你提示其已更名为 openclaw，这点在 项目规划.md 已写明）
也就是说：当前 CodeAll 更像是“借鉴了部分概念”，并没有把 openclaw 的“技能/插件/网关式扩展能力”移植到 CodeAll runtime。

2.2 hello-halo：内嵌浏览器 + AI 自动操控
基本达成（且做得比较实）

BrowserView 管理：src/main/services/browser-view.service.ts
AI Browser tools：src/main/services/ai-browser/tools/*
Anthropic tool-use 循环会执行这些 browser tools：src/main/services/llm/anthropic.adapter.ts:82-178
限制

tool-use 目前强耦合在 Anthropic adapter 内，且 streaming 不支持 tools（影响交互体验与闭环）。
证据：anthropic.adapter.ts:250-253
2.3 多视图并行“工作台”布局 + 产物可视化追踪
UI 框架达成，但“接线失败/双实现”导致实际不可用

工作台布局：react-resizable-panels 的三/四栏结构
证据：src/renderer/src/components/layout/MainLayout.tsx
Workflow DAG 可视化组件存在：src/renderer/src/components/workflow/WorkflowView.tsx
产物（Artifact）真实组件存在：src/renderer/src/components/artifact/ArtifactRail.tsx
Canvas 多 tab 生命周期组件存在：src/renderer/src/components/canvas/ContentCanvas.tsx
但入口路由挂的是 stub 版（这是目前最致命的“看起来做了、实际用不了”问题）

证据：src/renderer/src/App.tsx 只路由 MainLayout，MainLayout 引用的是 components/layout/* 下的 stub。
3) 界面设计（hello-halo 风格、eigent 布局、可视化管理、后台任务）
风格与布局：Tailwind + 深色玻璃态，确实接近 hello-halo；布局也像“工作台”。
可视化管理（模型/路由规则/数据管理）：src/renderer/src/pages/SettingsPage.tsx 等确实在做。
后台任务查看：WorkflowView/Task list 有实现，但由于 UI 未挂载与 IPC 白名单不一致，实际可用性存疑。
4) 技术要求与交付
4.1 独立运行（不依赖参考项目环境）
主工程未直接从 参考项目/ import（代码已 copy/adapt 进 src/），符合“独立运行”方向。
4.2 Windows exe / Linux 远程网页访问版
Windows：electron-builder + NSIS 配置存在（win target），但 updater/publish 仍是占位。
证据：electron-builder.yml、src/main/index.ts（updater url 为 example.com）
Linux web server：主工程缺失（README 声称有，但脚本与代码不存在）。
证据同上
4.3 测试与性能报告
测试框架与用例目录齐全：tests/unit|integration|e2e|performance，并且 performance 里确有并发压测思路。
证据：tests/performance/concurrent-agents.test.ts
但“报告化交付”（CI、HTML 报告产物、发布流水线）在主工程仍缺口较大（.github/workflows 不存在）。
5) 安全与合规（必须单独强调）
Critical：任意文件读取：ipcMain.handle('file:read') 直接读传入路径，无 workDir 范围约束。
证据：src/main/ipc/handlers/artifact.ts:7-16
High：主窗口 sandbox: false（BrowserView 另起隔离是好的，但主窗口仍是高价值面）。
证据：src/main/index.ts:135-141
审计日志系统存在但未覆盖敏感系统操作：AuditLogService/IPC 有，但 file:read 这类敏感 IPC 未自动记录。
证据：src/main/services/audit-log.service.ts vs src/main/ipc/handlers/artifact.ts
合规冲突点：DelegateEngine 标注 SUL-1.0/internal-only；而 README/交付文档又写“生产就绪/可发包”，需要你明确目标。
证据：src/main/services/delegate/delegate-engine.ts、docs/licenses.md
我已把证据与差距持续记录在这里
.sisyphus/drafts/codeall-code-audit.md
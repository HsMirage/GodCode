# Draft: 独立多LLM协同编程与多Agent协同工作桌面应用

## 需求（已确认/来自用户原文）
- 目标：开发**独立运行**的软件（安装包交付），实现多LLM协同编程 + 多Agent协同工作。
- 技术栈建议：pnpm + Electron + React + TypeScript + Claude Code SDK（可根据项目自行决定）。
- 架构融合：
  - 借鉴/集成 **oh-my-opencode**：多LLM智能体协同、并行后台任务机制、Hook生命周期治理、持续执行/自动续跑。
  - 融合 **eigent**：复杂工作流的子任务拆解与并行执行。
  - 借鉴 **ccg-workflow**：调度系统理念，任务调度与资源分配。
- 功能融合：
  - **完整移植 clawdbot 核心能力模块**（但**不需要集成 clawdbot 的 CLI 协同功能**）。
  - 实现 **hello-halo 内嵌浏览器** 与 **AI自动操控浏览器**。
  - 开发多视图并行“工作台”布局，支持 Agent 产物可视化与追踪。
- 界面：hello-halo 风格 + 参考 eigent 页面布局；实现“可视化、可追踪”的关键 UI 组件。
- 工程要求：允许直接复制 @参考项目 代码；新软件不依赖原项目环境；模块无缝集成，稳定与性能。
- 开发流程：先核心架构设计→依次集成模块→联调与整体测试→UI/UX优化。
- 交付：安装包、源代码与文档、单元/集成测试报告、性能测试报告。

## 技术决策（已确认）
- **目标平台**：仅 Windows（首发优先，后续可扩展）
- **运行形态**：纯本地桌面应用（Electron 主/渲染 + 本地 worker，无远程服务依赖）
- **LLM 接入**：OpenAI/兼容接口（首发必须支持；技术栈建议提及 Claude Code SDK 但用户选择了 OpenAI/兼容）
- **浏览器自动化**：全自动 RPA 级别（目标驱动、自主决策、多步骤流程自动化）- Electron WebView + Playwright + Vision
- **clawdbot 核心能力**（必须移植）：
  1. 对话记忆（上下文管理、长期记忆、会话持久化）
  2. 工具调用（Function calling、工具编排、自定义工具）
  3. 项目管理（工作区、文件树、版本控制集成）
  4. 提示词管理（Prompt 模板、变量替换、版本管理）
- **测试策略**：实现后补测试（先功能实现，每模块完成后补充单元/集成测试）

## 范围边界（初版）
- INCLUDE：多LLM/多Agent协作、任务拆解并行、调度与资源分配、Hook 生命周期、持续执行/续跑、内嵌浏览器与自动操控、工作台 UI、产物可视化追踪、独立打包交付。
- EXCLUDE：clawdbot 的 CLI 协同功能（明确排除）。

## 研究发现（已完成）

### oh-my-opencode 核心发现
- **三层架构**：规划层(Prometheus/Metis/Momus) → 执行层(Atlas) → 工作层(Sisyphus/专家代理)
- **delegate_task 中心API**：category + skills 组合实现任务-能力-工具绑定
- **BackgroundManager**：子任务独立 session 并行，ConcurrencyManager 按 model/provider 限流
- **Hook 生命周期**：UserPromptSubmit/PreToolUse/PostToolUse/Stop/Summarize 事件治理
- **持续执行**：`.sisyphus/boulder.json` + todo-continuation-enforcer 自动续跑
- **IDE 工具链**：LSP(诊断/重命名/引用查找) + AST-Grep(结构化搜索/替换)
- **可移植模块**：`src/features/background-agent/`, `src/tools/delegate-task/`, `src/hooks/`, `.sisyphus` 体系

### eigent 核心发现
- **Workforce 架构**：基于 CAMEL-AI，任务拆解 → 分配 → 并行执行 → 结果汇总
- **SingleAgentWorker**：Agent Pool + auto scale，支持结构化输出与 token 追踪
- **事件驱动同步**：create_agent/assign_task/activate_toolkit 等事件通过 SSE 推送 UI
- **内置核心Agent**：Developer/Browser/Document/Multi-Modal + 动态新增 Agent
- **WorkFlow 可视化**：`@xyflow/react` 渲染 Agent 节点与任务流图
- **本地化部署**：FastAPI + PostgreSQL，模型/用户/聊天/MCP 配置本地存储
- **可移植模块**：`backend/app/utils/workforce.py`, `ui/src/components/workflow/`, Zustand stores

### hello-halo 核心发现
- **Space 工作区隔离** + **Artifact Rail 产物可视化** + **Content Canvas 多类型预览**
- **BrowserView 内嵌浏览器**：Chromium 内核，BrowserViewManager 管理多实例，支持导航/截图/JS执行/DevTools
- **AI Browser 核心**：CDP 驱动 + 可访问树快照(Accessibility.getFullAXTree) + 26 工具(导航/输入/快照/网络)
- **集成链路**：Prompt 注入 → MCP Server(ai-browser) → SDK 调用 → 权限控制 → 状态同步
- **多视图并行布局**：Chat + Artifact Rail + Content Canvas，支持 Chat/Canvas/Mobile 三种模式
- **远程访问**：HTTP + WebSocket + Cloudflare tunnel，Token/QR Code 鉴权
- **可移植模块**：`src/main/browser/`, `src/main/ai-browser/`, `src/renderer/components/space/`, Zustand stores

### ccg-workflow 核心发现
- **三层组件**：Claude CLI 扩展 + 外部模型执行(Codex/Gemini) + codeagent-wrapper(Go)
- **控制面/执行面分离**：Claude(编排/决策/审核) + Codex(后端) + Gemini(前端)
- **标准6阶段工作流**：研究 → 构思 → 计划 → 执行 → 优化 → 评审
- **Plan/Execute 分离**：`/ccg:plan` 产出 `.claude/plan/*.md`，`/ccg:execute` 复用 SESSION_ID 跨会话续跑
- **OpenSpec 规范驱动**：spec-init/research/plan/impl/review，零决策计划 + PBT 属性提取
- **codeagent-wrapper 并行DAG**：topologicalSort 计算依赖层级，按层并行执行，worker 上限可控
- **安全边界**：外部模型 Patch-only，Claude 复审重构
- **可移植模块**：templates/prompts/, codeagent-wrapper 源码, 并行 DAG 执行逻辑

### clawdbot 核心发现
- **定位**：个人 AI 助手，Gateway 控制平面 + 多渠道连接(WhatsApp/Telegram/Slack 等)
- **Subagents 并行子任务**：`sessions_spawn` 工具，独立 session key，非阻塞执行，不可嵌套
- **生命周期与回报**：subagent-registry 记录 runId，onAgentEvent 监听，announce-back 回写主对话
- **多 Agent 路由**：不同渠道/账号/peer 路由到隔离 agent(按工作区/会话隔离)
- **控制平面协议**：TypeBox schema 统一 WS API (`src/gateway/protocol/schema/`)
- **技能与插件**：`skills/*/SKILL.md` + `extensions/*` + `src/plugin-sdk`
- **安全边界**：子代理工具 denylist(禁止 sessions_spawn/gateway/memory_search 等)
- **可移植模块**（排除 CLI 协同）：
  - 对话记忆：会话持久化(`~/.clawdbot/`)、上下文管理
  - 工具调用：`src/agents/tools/`, `src/agents/pi-tools.policy.ts` 策略
  - 项目管理：工作区隔离、文件树、版本控制集成
  - 提示词管理：技能系统 `skills/*/SKILL.md`、Prompt 模板

## 开放问题（已全部明确）
✅ **安全与隔离能力**：
   - API Key 安全存储（系统 Keychain/加密文件）
   - 审计日志（所有操作记录与可追溯性）
✅ **交付与发布**：
   - 自动更新机制（electron-updater）
✅ **任务调度细节**：
   - 队列调度（FIFO/LIFO 队列模式）
   - 失败处理（任务取消、超时、重试机制）

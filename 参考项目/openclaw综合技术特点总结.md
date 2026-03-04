# openclaw 综合技术特点总结（结合源码与 2 份总结）

> 说明：本总结基于 `openclaw/` 源码与文档（README + `docs/tools/subagents.md` 等）以及两份既有总结。凡未在本次代码/文档阅读中直接确认的点，会明确标注为“外部总结观点/待验证”。

## 1. 项目定位与总体架构（已验证）

- **定位**：在用户自有设备运行的个人 AI 助手，通过已有聊天渠道与用户交互（README 明确支持 WhatsApp/Telegram/Slack/Discord/Signal/iMessage/Teams/WebChat 等）。
- **控制平面**：Gateway 是长期运行的控制平面进程（README 明确强调“单一 Gateway + 多渠道连接 + WS 控制平面”）。
- **多 Agent 路由**：README 明确支持 **multi-agent routing**，可将不同渠道/账号/peer 路由到隔离 agent（按工作区/会话隔离）。
- **多端形态**：CLI、Web 控制 UI、macOS 菜单栏 app、iOS/Android 节点与 Canvas 能力（README/仓库结构均可验证：`ui/`、`apps/`、`vendor/a2ui` 等）。

## 2. 多 Agent 协同与 Subagents（核心机制，源码可证实）

moltbot 的“多 agent 协作”主要体现在 **会话隔离 + 子代理并行** 两条路径：

### 2.1 Subagents：并行子任务的专用机制

文档 `docs/tools/subagents.md` 与源码 `src/agents/tools/sessions-spawn-tool.ts` 共同确立了 Subagent 机制：

- **隔离会话**：子代理使用独立 session key：`agent:<agentId>:subagent:<uuid>`。
- **触发方式**：`sessions_spawn` 工具（并可在聊天里用 `/subagents` 管理）。
- **并行/非阻塞**：`sessions_spawn` 会立即返回 `{ status: "accepted", runId, childSessionKey }`，任务在后台执行。
- **不可嵌套**：子代理不能再调用 `sessions_spawn`（源码直接禁止 subagent session 触发）。
- **模型与思考级别覆盖**：可选 `model`、`thinking` 覆盖；无效 thinking 会被拒绝并给出提示。
- **超时与清理**：支持 `runTimeoutSeconds`（或旧参数 `timeoutSeconds`），可选择 `cleanup: delete|keep`。
- **按 agent allowlist 约束**：`agentId` 只能在配置允许的列表内（`agents.list[].subagents.allowAgents`）；默认只允许当前 agent 自身。
- **独立 lane 并发**：子代理运行在专用 lane（`CommandLane.Subagent`），并发上限由 `agents.defaults.subagents.maxConcurrent` 控制（默认 8，见 `src/config/agent-limits.ts`）。

### 2.2 Subagent 生命周期与“announce-back”

子代理完成后会自动把结果“回报”给主对话：

- **注册与持久化**：`subagent-registry` 记录 runId、会话 key、请求来源、任务等信息，并写入 `~/.moltbot/subagents/runs.json`（`STATE_DIR_moltbot`）。
- **事件监听**：通过 `onAgentEvent` 监听 `start/end/error` 生命周期事件，更新执行状态并触发 announce。
- **announce 内容结构**：`subagent-announce.ts` 会读取子代理最新输出、构造“Findings + Stats”消息，Stats 包含运行时长、token 使用、sessionKey/sessionId、transcript 路径等。
- **回写方式**：通过 Gateway `agent` 调用把“总结提示”发给主 session，由主代理以自身口吻对用户回复。
- **自动归档**：按 `agents.defaults.subagents.archiveAfterMinutes` 进行自动清理/归档（best-effort）。

### 2.3 Subagent 工具策略（安全边界）

`src/agents/pi-tools.policy.ts` 里定义了 **子代理默认工具禁用列表**，包括：

- 会话管理工具：`sessions_list` / `sessions_history` / `sessions_send` / `sessions_spawn`
- 管理/调度类：`gateway` / `cron` / `session_status`
- 记忆类：`memory_search` / `memory_get`
- 其它敏感工具：`agents_list` / `whatsapp_login`

该策略可通过 `tools.subagents.tools` 配置扩展，但“deny 优先于 allow”。

## 3. 多 Agent 路由与会话隔离（README 佐证）

README 明确强调：moltbot 支持 **multi-agent routing**，可以把不同渠道/账号/peer 路由到不同 agent（每个 agent 拥有独立会话与工作区），这是“多 agent 协同”的基础设施能力，而不仅仅是子代理并行执行。

## 4. 协议与控制面（源码可证实）

Gateway 的控制面有明确的类型化协议层：

- `src/gateway/protocol/schema/*.ts` 提供协议参数与事件的 TypeBox schema（例如 `ConnectParams`, `AgentParams`, `Sessions*`, `Nodes*` 等）。
- `ProtocolSchemas` 汇总了所有 WS API 的 schema。

## 5. 技能与插件生态（仓库结构可证实）

- **技能（skills）**：存在 `skills/*/SKILL.md`，说明技能以可分发目录形式存在（README 同样强调 skills）。
- **插件/扩展**：`extensions/*` 作为 workspace packages 独立发布，并有 `src/plugin-sdk`，说明插件在架构里是第一公民。

## 6. 安全与权限边界（README + 子代理策略）

README 明确默认 DM 配对/白名单策略，强调“聊天渠道的入站消息不可信”。  
子代理进一步通过工具 denylist 与 session 隔离，缩小能力面，避免“子任务反向控制主流程”。

## 7. 来自 2 份总结的补充观点（外部总结观点/待验证）

以下内容来自用户提供的总结文本，本次未在源码/文档中逐条验证：

- **项目热度数据**（Star/Fork 数量、作者信息）——需以 GitHub 实时数据为准。
- **具体支持模型/提供方列表**（如 Gemini/Grok/ChatGLM 等）——仓库中存在模型配置模块，但完整列表需进一步核对。
- **“文件系统记忆类似 Obsidian vault”** 等表述——当前仓库有 `src/memory/` 模块，但具体记忆形态需继续确认。
- **WebSocket JSON Schema 校验与 AJV 运行时策略**——仓库有 TypeBox schema 定义，但校验实现细节需进一步阅读 `src/gateway/*`。

## 8. 总结（多 Agent 协同的工程化落地）

moltbot 的多 Agent 能力具备“工程化闭环”特征：

- **会话级隔离与路由**：多渠道输入能路由到不同 agent，支持并行会话处理。
- **Subagent 并行执行**：明确 lane 并发、会话隔离、工具限制、结果回报与可追溯统计。
- **控制平面协议化**：TypeBox schema 统一 WS API，便于扩展与多端协同。

整体看，moltbot 的多 agent 能力不是“概念式并行”，而是通过 Subagent + lane + 会话隔离 +工具策略的组合，实现可控、可观察、可扩展的协作运行方式。

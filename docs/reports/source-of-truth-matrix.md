# P0-3-A 代码真值对照表（Source of Truth Matrix）

## 1. 目的与范围
- 目的：对齐“文档结论”与“当前代码事实”，识别文档失真项。
- 输入文档：
  - `docs/gap-analysis-report.md`
  - `docs/final-acceptance.md`
  - `docs/final-work-plan.md`
- 证据范围（代码真值）：
  - `src/main/services/tools/**`
  - `src/main/services/ai-browser/**`
  - `src/main/services/hooks/**`
  - `src/main/services/task-continuation.service.ts`
  - `src/main/services/delegate/**`
  - `src/main/services/workforce/**`
  - `src/main/preload.ts`
  - `src/shared/ipc-channels.ts`
  - `src/shared/agent-definitions.ts`

## 2. 对照矩阵

| 结论主题 | 文档结论（摘要） | 证据代码路径 | 判定 | 修正结论 |
|---|---|---|---|---|
| grep/glob/bash 工具缺失 | 文档称缺少 `grep/glob/bash`（`docs/gap-analysis-report.md:265`, `docs/final-work-plan.md:81`） | `src/main/services/tools/index.ts:17`, `src/main/services/tools/index.ts:18`, `src/main/services/tools/index.ts:20`, `src/main/services/tools/builtin/grep.ts:1`, `src/main/services/tools/builtin/glob.ts:1`, `src/main/services/tools/builtin/bash.ts:242` | 不支持 | 当前代码已实现并注册 `grep/glob/bash`。 |
| webfetch/websearch 工具缺失 | 文档称缺少 `webfetch/websearch`（`docs/gap-analysis-report.md:266`, `docs/final-work-plan.md:84`） | `src/main/services/tools/index.ts:19`, `src/main/services/tools/index.ts:21`, `src/main/services/tools/builtin/webfetch.ts:216`, `src/main/services/tools/builtin/websearch.ts:200` | 不支持 | 当前代码已实现并注册 `webfetch/websearch`。 |
| preload 缺失 | 文档称 `preload` 缺失（`docs/gap-analysis-report.md:268`, `docs/final-work-plan.md:86`） | `src/main/preload.ts:1`, `src/main/preload.ts:7`, `src/main/preload.ts:156` | 不支持 | `preload` 已存在并实现 IPC channel allowlist 与 bridge 暴露。 |
| Hook 生命周期治理仅部分实现 | 文档称 Hook 生命周期“部分完成”（`docs/gap-analysis-report.md:33`） | `src/main/services/hooks/index.ts:3`, `src/main/services/hooks/index.ts:104`, `src/main/services/hooks/manager.ts:28`, `src/main/services/hooks/manager.ts:159`, `src/shared/ipc-channels.ts:151`, `src/main/ipc/handlers/workflow-observability.ts:13` | 部分支持 | 生命周期框架、默认 Hook、治理状态查询已实现；“策略配置面与持久化闭环”未在本轮代码证据中确认。 |
| 持续执行/自动续跑仅基础实现 | 文档称 task continuation 为“部分完成”（`docs/gap-analysis-report.md:34`） | `src/main/services/task-continuation.service.ts:50`, `src/main/services/task-continuation.service.ts:97`, `src/main/services/task-continuation.service.ts:161`, `src/main/services/task-continuation.service.ts:278`, `src/main/ipc/handlers/task-continuation.ts:7`, `src/shared/ipc-channels.ts:49` | 部分支持 | 自动续跑基础链路（状态、中止、配置、倒计时触发）已实现；高级恢复场景覆盖需依赖专项验证。 |
| 多代理协同已完成 | 文档称“多代理协同完成”（`docs/gap-analysis-report.md:31`） | `src/shared/agent-definitions.ts:65`, `src/shared/agent-definitions.ts:214`, `src/main/services/workforce/workforce-engine.ts:1193`, `src/main/services/workforce/workforce-engine.ts:1358`, `src/main/services/workforce/workforce-engine.ts:3491` | 支持 | 代理/类别定义与任务分解、DAG、工作流执行链路存在。 |
| AI Browser 能力已实现 | 文档称 AI 自动操控能力已实现（`docs/gap-analysis-report.md:65`） | `src/main/services/ai-browser/tools/index.ts:6`, `src/main/services/ai-browser/tools/index.ts:24`, `src/main/services/tools/builtin/browser-tools.ts:348`, `src/main/services/tools/index.ts:31`, `src/shared/ipc-channels.ts:181` | 支持 | 浏览器工具类别与桥接执行链路存在，且接入 IPC 事件。 |
| 原生 Anthropic/Gemini 适配缺失 | 文档称仅 OpenAI-compatible，缺原生 Anthropic/Gemini（`docs/gap-analysis-report.md:91`） | `src/main/services/llm/factory.ts:3`, `src/main/services/llm/factory.ts:4`, `src/main/services/llm/factory.ts:44`, `src/main/services/llm/factory.ts:53` | 不支持 | 当前工厂已包含原生 `AnthropicAdapter` 与 `GeminiAdapter` 路由。 |

## 3. 非代码类结论处理说明
- `docs/final-acceptance.md`、`docs/test-reports/integration.md` 中的“通过率/失败数/是否阻塞验收”属于运行结果真值，不属于“静态代码真值”。
- 本矩阵仅对“可由代码直接验证的能力结论”做判定；测试结果应由测试报告链路独立维护。

## 4. 本轮结论（P0-3-A）
- 文档与代码存在可验证偏差，主要集中在“工具缺失”“preload 缺失”“原生模型适配缺失”三类历史结论。
- 已形成逐条代码证据对照，可作为后续 `P0-3-B` 的文档批量修正输入。

## 5. P2-1-A：openclaw「完整移植 vs 能力适配」边界与证据

### 5.1 口径定义
- **完整移植**：以能力目标为单位，要求在 CodeAll 中可独立运行、可验证、可回归；不要求与参考项目保持源码级 1:1 结构一致。
- **能力适配**：允许使用 CodeAll 现有架构（Workforce/Delegate/Tool Registry/IPC）实现同等能力目标；若工具名、执行入口或交互路径不同，必须给出映射关系与证据位置。

### 5.2 能力边界与证据表（每项含“范围定义 + 证据位置”）

| 能力项 | 口径分类 | 范围定义（包含） | 不在范围（边界外） | 证据位置 |
|---|---|---|---|---|
| 代码读检索（oc.code.search） | 能力适配 | 以 `read/glob/grep` 完成代码定位、读取、检索；支持由 Agent/Category 路由调用。 | 不要求实现独立语义索引服务或与参考项目一致的检索后端。 | `src/shared/agent-definitions.ts:284`, `src/main/services/delegate/tool-allowlist.ts:45` |
| 文档检索（Diting） | 能力适配 | 通过 `diting` 的 `webfetch/websearch/context7/github_search` 提供外部资料检索；其中 `context7/github_search` 映射到现有 Web 工具链。 | 不要求保留参考项目同名外部服务连接器。 | `src/shared/agent-definitions.ts:176`, `src/main/services/delegate/tool-allowlist.ts:29` |
| 代码写修改（oc.code.modify） | 能力适配 | 以 `write/edit`（运行时映射到 `file_write`）完成代码新增与修改，并受工具权限策略约束。 | 不要求与参考项目保持相同写入 API 形态。 | `src/shared/agent-definitions.ts:298`, `src/main/services/delegate/tool-allowlist.ts:47`, `src/main/services/tools/permission-policy.ts:35` |
| 智能问答/架构咨询（Baize） | 能力适配 | 以只读咨询方式输出架构决策与代码审查建议（`read/glob/grep`）。 | 不在该能力内执行写操作或命令执行。 | `src/shared/agent-definitions.ts:143` |
| 任务编排委派（oc.task.orchestrate） | 完整移植（能力目标） | 支持任务拆解、DAG 构建、依赖执行与工作流执行主链路。 | 不要求复制参考项目内部调度实现细节。 | `src/shared/agent-definitions.ts:310`, `src/main/services/delegate/tool-allowlist.ts:48`, `src/main/services/workforce/workforce-engine.ts:1193`, `src/main/services/workforce/workforce-engine.ts:1358`, `src/main/services/workforce/workforce-engine.ts:3491` |
| 后台任务观测（oc.background.observe） | 完整移植（能力目标） | 支持后台任务列表/输出增量/取消/统计与运行态生命周期管理。 | 不要求与参考项目保持完全一致的任务中心 UI 形态。 | `src/shared/agent-definitions.ts:322`, `src/main/services/delegate/tool-allowlist.ts:49`, `src/main/ipc/handlers/background-task.ts:82`, `src/main/services/tools/background/manager.ts:21` |

### 5.3 与项目规划条目的对应
- 规划条目“完整移植 openclaw 核心能力模块”（`项目规划.md:18`）在本项目中按“**能力目标完整移植 + 实现路径能力适配**”执行。
- 以上 6 项能力已给出明确边界与代码证据，可作为 P2-1-A 验收基线。

## Why

当前 CodeAll 已具备多 agent 调用、基础 DAG 编排、工作台与浏览器能力，但仍未达到《项目规划.md》要求的“真正协同型多 agent IDE”：协同能力在任务分配、共享上下文、资源调度、结果整合和恢复韧性上仍不完整，IDE 核心在编辑器、终端与任务可观测闭环上存在关键缺口。现在推进该变更是为了把现有“可运行原型”提升为“可持续生产使用的平台能力基线”。

## What Changes

- 建立“协同内核 + IDE 核心能力”并行推进的主变更，统一需求边界、能力定义与验收口径。
- 将多 agent 协同从“基础委派”升级为“可治理协作系统”，覆盖任务分解与依赖、角色分配、共享上下文、资源调度、结果整合、恢复与重试。
- 完善 IDE 核心链路，补齐编辑与执行能力（代码编辑、终端/后台任务、日志与任务追踪可视化联动）。
- 强化不同 LLM 模型驱动 agent 的协作效率与可配置治理，确保模型绑定、路由决策与工作流执行一致。
- 明确与参考项目（oh-my-opencode/eigent/hello-halo/openclaw）对齐的可采纳模式和非采纳边界，降低“直接移植导致架构失配”的风险。

## Capabilities

### New Capabilities
- `collaboration-orchestration-kernel`: 定义真正协同工作流内核（任务分解、DAG 调度、角色分工、波次执行、检查点治理、结果汇总）。
- `agent-shared-context-and-memory`: 定义跨 agent 共享上下文与协作记忆（事实、决策、依赖输出、约束）以及注入策略。
- `model-aware-routing-and-allocation`: 定义按 agent/category/model/provider 的路由与资源分配规则，支持异构模型协作与容量治理。
- `workflow-observability-and-recovery`: 定义工作流运行观测、日志关联、失败分类重试、会话恢复与续跑一致性行为。
- `ide-core-edit-exec-workbench`: 定义 IDE 核心工作台能力（多视图协同、代码编辑闭环、终端/后台任务中心、任务与产物追踪联动）。
- `embedded-browser-and-ai-automation`: 定义内嵌浏览器与 AI 自动操控在 IDE 工作流中的标准能力与边界。
- `agent-model-settings-governance`: 定义模型/Provider/API Key/Agent 绑定配置与安全治理行为。

### Modified Capabilities
- None (当前 `openspec/specs/` 下无既有 capability 规格，暂无存量规格变更项)

## Impact

- 影响主系统模块：
  - Main 进程：`src/main/services/workforce/*`, `src/main/services/delegate/*`, `src/main/services/router/*`, `src/main/services/tools/*`, `src/main/services/ai-browser/*`, `src/main/ipc/*`
  - Shared 合同层：`src/shared/ipc-channels.ts` 及相关类型定义
  - Renderer：工作台布局、任务/流程/日志/编辑/终端/浏览器面板与状态管理（`src/renderer/src/components/*`, `src/renderer/src/store/*`）
  - 数据模型：`prisma/schema.prisma`（任务/运行/工作流关联与恢复相关字段）
- 影响系统行为：任务调度策略、模型绑定路由策略、可观测性与恢复语义、IDE 日常开发流程。
- 兼容性与风险：
  - 可能引入 IPC 合同扩展与前后端联动改造，需要保证旧会话与现有任务数据可迁移。
  - 需要通过分阶段验收与回归测试控制并行改造风险（工作流正确性、UI 可用性、稳定性）。

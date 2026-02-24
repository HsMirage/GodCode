## Why

当前项目已具备伏羲/昊天/夸父三主 Agent，但其职责边界、交接契约和执行纪律与参考项目（Prometheus/Sisyphus/Atlas）仍存在语义与流程差异，导致复杂任务场景下的一致性与可预期性不足。现在推进对齐，可以在不改变 CodeAll 架构前提下提升编排稳定性、可追溯性和交付质量。

## What Changes

- 基于参考项目进行主 Agent 对比分析，沉淀统一角色映射与职责矩阵：Prometheus→伏羲、Sisyphus→昊天、Atlas→夸父。
- 对齐三主 Agent 的核心行为契约：
  - 伏羲：面试式需求澄清与计划产出优先（先计划，后执行）。
  - 昊天：主编排器，负责任务分解、并行委派、检查点与集成。
  - 夸父：计划执行器，按任务清单推进并输出可验收证据。
- 将参考项目的“按类别委派而非直接选模型”思想适配到当前模型绑定体系，明确角色-类别-模型三层约束关系。
- 在当前项目已有 workflow/workforce/delegate 机制上进行兼容适配，而非引入外部项目特有运行时或命令体系。
- **BREAKING**: 收紧主 Agent 角色边界，减少角色重叠与跨职责执行；部分历史对话中的“任意主 Agent 混合行为”将变为受约束行为。

## Capabilities

### New Capabilities
- `primary-agent-role-alignment`: 定义并强制三主 Agent 的角色语义、交接契约、责任边界和验收输出格式，确保与参考项目语义对齐且适配 CodeAll 现有架构。

### Modified Capabilities
- `collaboration-orchestration-kernel`: 将主 Agent 责任注入协作阶段（plan/dispatch/checkpoint/integration/finalize），明确阶段所有权与交接条件。
- `model-aware-routing-and-allocation`: 更新路由与分配规则，使显式主 Agent 选择、类别委派和模型绑定策略保持一致并可审计。
- `agent-model-settings-governance`: 增补主 Agent 级默认模型与策略治理要求，确保角色能力与模型策略匹配。

## Impact

- 受影响主路径：
  - `src/shared/agent-definitions.ts`
  - `src/main/services/delegate/category-constants.ts`
  - `src/main/services/delegate/delegate-engine.ts`
  - `src/main/services/delegate/prompts/fuxi.ts`
  - `src/main/services/delegate/prompts/haotian.ts`
  - `src/main/services/delegate/prompts/kuafu.ts`
  - `src/main/services/workforce/workforce-engine.ts`
- 受影响测试与验证：
  - 主 Agent 角色行为与路由测试
  - 协作流程阶段与交接验收测试
  - 模型绑定与配置治理相关单测/集成测试
- 外部依赖：不新增外部基础设施；在现有 Electron + Workforce + Delegate 体系内完成适配。
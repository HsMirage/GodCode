## Why

当前 CodeAll 在任务执行过程中出现错误时，常常直接失败并中断整体交付，需要人工介入重试或修复。为了提升复杂任务完成率与连续交付能力，需要让系统在可控边界内自动自愈（自修复或委派子代理修复）后继续完成任务。

## What Changes

- 新增任务级错误自愈机制：在执行失败后自动进行错误分类，并按策略触发“本地自修复 → 子代理/任务类别修复 → 验证回归 → 恢复主流程”。
- 新增恢复策略约束：定义可重试错误类型、最大恢复轮次、升级/放弃条件，以及不可恢复错误的 fail-fast 诊断输出。
- 扩展委派能力：支持基于错误类型与任务类别选择合适子代理和模型路由，执行定向修复任务。
- 扩展执行证据：恢复动作必须产出结构化证据（修复内容、验证结果、残余风险），用于后续 checkpoint/integration 消费。
- 增强可观测性：记录恢复时间线、每轮恢复决策、恢复结果与最终状态，支持审计与复盘。

## Capabilities

### New Capabilities
- `autonomous-task-error-recovery`: 定义任务失败后的自动自愈闭环，包括错误分类、恢复策略执行、恢复结果验证与工作流续跑契约。

### Modified Capabilities
- `collaboration-orchestration-kernel`: 增加失败后恢复阶段的编排规则、阶段交接约束与恢复后继续执行的状态机语义。
- `workflow-observability-and-recovery`: 增加恢复尝试记录、恢复终态分类、恢复链路可追溯字段与查询输出要求。
- `model-aware-routing-and-allocation`: 增加恢复任务的路由优先级与类别/子代理选择规则，确保修复任务按能力匹配调度。

## Impact

- 主要影响模块：
  - `src/main/services/workforce/workforce-engine.ts`
  - `src/main/services/delegate/delegate-engine.ts`
  - `src/main/services/delegate/category-constants.ts`
  - `src/main/services/router/smart-router.ts`
  - `src/main/services/workforce/*`（调度/执行/恢复状态管理）
- 数据与审计影响：任务 metadata / workflow timeline 需要新增恢复相关快照与统计字段。
- 测试影响：需新增/更新 unit + integration 测试，覆盖“失败→自愈→续跑/终止”主路径与边界路径。
- 对外行为影响：任务失败时默认优先尝试受控自愈，不再立即终止；不可恢复错误仍保持明确阻断与诊断输出。
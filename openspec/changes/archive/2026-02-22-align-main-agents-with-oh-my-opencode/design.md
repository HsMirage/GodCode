## Context

当前 CodeAll 已有三主 Agent（伏羲/昊天/夸父）与 delegate/workforce 协作链路，但在“角色边界、阶段职责、路由约束、验收输出”上仍有交叉与漂移。参考项目 oh-my-opencode 将 Prometheus/Sisyphus/Atlas 划分为“规划-编排-执行”三段主链路，并通过类别委派与运行时约束维持稳定性。

本次设计目标是在不引入参考项目特有运行时（命令体系、插件生命周期）的前提下，把其核心主 Agent 协作语义适配到 CodeAll 现有 Electron + IPC + Delegate + Workforce 架构中。

## Goals / Non-Goals

**Goals:**
- 固化三主 Agent 角色边界：Prometheus→伏羲（规划），Sisyphus→昊天（编排），Atlas→夸父（执行）。
- 在协作阶段（plan/dispatch/checkpoint/integration/finalize）中明确阶段所有权、输入输出契约与交接条件。
- 使“显式主 Agent 选择、类别委派、模型绑定策略”三者一致化，并保留审计可追溯性。
- 保持现有会话、IPC、测试体系可兼容演进，避免破坏主流程可用性。

**Non-Goals:**
- 不复制参考项目的全部命令与 Hook 生态（如 `/start-work` 的完整运行时语义）。
- 不引入新的外部编排引擎或持久化基础设施。
- 不重写整个 workforce/delegate 架构，仅做主 Agent 语义与策略层对齐。

## Decisions

### Decision 1: 以“角色契约层”对齐，而非“实现形态层”搬运
- **Choice**: 在 CodeAll 内建立主 Agent 角色契约（职责、阶段所有权、输出结构、交接条件），不直接复制参考项目源码结构。
- **Rationale**: 两项目运行时结构不同，直接搬运会导致耦合与兼容风险；契约层对齐可最大化语义一致、最小化架构扰动。
- **Alternatives considered**:
  - 直接移植参考项目主 Agent 模块：一致性高但侵入性过强，适配成本高。
  - 仅调整提示词：成本低但约束不足，难保证执行一致性。

### Decision 2: 在 DelegateEngine 中增加“主 Agent 阶段守卫”
- **Choice**: 在任务路由与执行入口施加阶段守卫：伏羲优先产出计划、昊天主导编排与集成、夸父按计划执行与回执。
- **Rationale**: 阶段守卫能把角色边界从“软约定”变为“可验证策略”，降低角色串味。
- **Alternatives considered**:
  - 只在 prompt 文本约束：可绕过，且测试可验证性弱。
  - 在前端做角色限制：无法覆盖后端实际执行路径。

### Decision 3: 路由遵循“显式 Agent > 类别策略 > 模型绑定”优先级
- **Choice**: 当用户显式选择主 Agent 时先满足角色语义，再映射到类别与模型；未显式选择时走现有模型感知路由。
- **Rationale**: 保持用户意图优先，同时与现有 model-aware routing 兼容。
- **Alternatives considered**:
  - 模型优先覆盖角色：会削弱主 Agent 语义稳定性。
  - 全部强制类别路由：会丢失显式 Agent 选择价值。

### Decision 4: 以“可验收证据结构”统一三主 Agent 输出
- **Choice**: 定义最小交付结构：目标/范围、执行证据、风险与未决项、下一步交接建议。
- **Rationale**: 便于 checkpoint 与 integration 阶段自动消费，提升 trace 与回放质量。
- **Alternatives considered**:
  - 自由文本输出：灵活但难审计、难自动校验。

### Decision 5: 通过增量规范 + 回归测试完成变更落地
- **Choice**: 优先修改既有 capability 规范（协作内核、路由分配、治理）并新增主 Agent 角色对齐规范，随后补齐单测/集成测试。
- **Rationale**: 与 OpenSpec 流程一致，避免“实现先行、规范滞后”。
- **Alternatives considered**:
  - 先改代码后补规范：短期快，但容易造成行为漂移与验收歧义。

## Risks / Trade-offs

- [Risk] 角色边界收紧可能影响部分历史使用习惯 → **Mitigation**: 在变更说明与 UI 文案中提供角色选择指引，并在关键失败路径给出可执行修复建议。
- [Risk] Prompt 约束与运行时守卫不一致导致行为分裂 → **Mitigation**: 以运行时守卫为真值源，prompt 作为补充，并增加一致性测试。
- [Risk] 显式 Agent 与模型绑定策略冲突 → **Mitigation**: 引入冲突优先级与诊断信息，记录有效绑定快照用于审计。
- [Risk] 夸父执行链路过严影响吞吐 → **Mitigation**: 仅对“计划执行模式”启用严格门控，普通直连任务保持现有路径。

## Migration Plan

1. 规范层：新增 `primary-agent-role-alignment`，并更新三项受影响 capability 的 delta spec。
2. 策略层：在 `agent-definitions`、`category-constants`、`delegate-engine` 中落实角色映射与阶段守卫。
3. Prompt 层：对齐 `fuxi.ts`、`haotian.ts`、`kuafu.ts` 的职责边界与交接输出格式。
4. 编排层：在 `workforce-engine` 注入阶段所有权与交接校验点。
5. 验证层：补充/更新单测与集成测试（角色路由、阶段流转、绑定冲突、证据输出）。
6. 发布层：灰度启用并观察关键路径日志与失败原因分布。

**Rollback strategy**:
- 通过配置开关回退到现有主 Agent 软约束行为（保留新代码但停用严格守卫）。
- 若出现高频阻断，优先关闭阶段硬性校验，仅保留提示级约束与审计记录。

## Open Questions

- 是否需要在 UI 中显式展示“当前处于计划/编排/执行”阶段状态，帮助用户理解角色切换？
- 对于“未显式选择 Agent”的请求，默认入口是昊天还是维持现有路由策略优先？
- 夸父在执行中发现计划缺口时，是否必须回传伏羲补计划，还是允许昊天在 checkpoint 阶段直接修订？
- 主 Agent 角色冲突（用户显式选择与策略禁用冲突）时，错误提示的最小可操作信息集应包含哪些字段？
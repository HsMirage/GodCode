## Context

CodeAll 当前在任务执行失败时以“失败即终止”为主，虽然已有工作流编排、角色边界、checkpoint/integration 与可观测性框架，但缺少“错误后自动恢复并继续交付”的统一契约。该变更需要跨越 workforce 编排、delegate 委派、路由决策、恢复状态持久化与审计输出，属于跨模块行为升级。

现有约束：
- 必须保持主 Agent 角色边界（fuxi/haotian/kuafu）与阶段所有权不被破坏。
- 严格模式下不能通过“恢复逻辑”绕过既有 guardrail。
- 恢复动作必须可追溯、可解释，且能被 checkpoint/integration 消费。

## Goals / Non-Goals

**Goals:**
- 为任务失败建立可配置的自动自愈闭环：错误分类 → 恢复策略选择 → 执行修复 → 验证 → 续跑或终止。
- 支持调用子代理/任务类别进行定向修复，并沿用现有模型绑定与路由治理。
- 将恢复行为纳入统一证据与审计体系，保证可观测、可复盘。
- 在不改变用户主流程交互的前提下提升任务最终完成率。

**Non-Goals:**
- 不实现无限重试或无上限自愈循环。
- 不放宽已有安全边界与严格角色模式约束。
- 不引入新的外部执行环境或额外基础设施依赖。
- 不将所有失败都强制转为可恢复；不可恢复错误仍按 fail-fast 输出。

## Decisions

1. 引入“恢复状态机”而非简单 retry 计数
- 决策：在 workflow/task metadata 中显式记录 recovery phase（classify/plan/fix/validate/escalate/abort），并维护 attempt 序列。
- 原因：简单计数无法表达“为何恢复成功/失败”，也不利于 checkpoint/integration 消费。
- 备选：仅复用现有 retry 字段；缺点是语义不足，审计粒度不够。

2. 错误分类先行，策略驱动恢复路径
- 决策：先把错误分为 transient/config/dependency/implementation/permission/unknown，再映射到恢复策略（本地重试、子代理修复、类别修复、直接终止）。
- 原因：避免“一刀切重试”导致无效消耗，提升恢复有效性。
- 备选：统一重试 N 次；缺点是对配置错误和权限错误无效。

3. 恢复执行复用 delegate + category routing
- 决策：恢复任务统一经 delegate 发起，并按错误类型选择 category/subagent，保留路由优先级与绑定校验。
- 原因：减少新执行通道带来的复杂性，确保治理一致性。
- 备选：在 workforce 内部硬编码修复器；缺点是扩展性与治理一致性差。

4. 恢复证据纳入既有最小证据结构
- 决策：恢复动作输出必须包含 objective/changes/validation/residual-risk，并附 recoveryAttemptId 与 sourceError。
- 原因：与现有 evidence-gap 门禁兼容，避免新增独立解析链路。
- 备选：单独定义 recovery-only 格式；缺点是 integration 需要双轨处理。

5. 严格边界：恢复不绕过阶段 owner
- 决策：恢复调度由 orchestration owner（haotian）发起，执行修复由执行路径（含 kuafu 或相应类别）完成；strict mode 下违规即阻断。
- 原因：保证主 Agent 对齐后的阶段契约不退化。
- 备选：允许任意主 Agent 直接触发修复；缺点是边界弱化。

## Risks / Trade-offs

- [风险] 恢复链路增加整体时延
  → Mitigation：设置最大恢复轮次、每类错误专属预算、快速失败条件。

- [风险] 错误分类误判导致错误策略
  → Mitigation：记录分类依据与置信度；unknown 路径保守降级为诊断终止。

- [风险] 子代理修复产生不稳定改动
  → Mitigation：强制验证步骤（最小验证命令/检查项）与失败回滚到原错误上下文。

- [风险] 元数据膨胀影响查询性能
  → Mitigation：恢复日志结构化压缩存储，仅保留关键快照与索引字段。

## Migration Plan

1. 数据与契约准备
- 为 workflow/task metadata 增加 recovery state、attempt history、diagnostics summary 字段（向后兼容，可选字段）。

2. 编排层接入
- 在 workforce 执行循环中接入失败拦截器：失败后进入 classify/plan/fix/validate 流程。
- 增加恢复预算策略（max attempts、per-class policy、cooldown/backoff）。

3. 委派与路由接入
- delegate 增加 recovery task 类型与上下文字段。
- router/category 策略增加 recovery 语义优先级和冲突诊断。

4. 观测与审计接入
- workflow observability 输出恢复时间线、每轮结果、终态原因。
- 在 integration/finalize 中消费恢复证据并保留 evidence-gap 语义。

5. 灰度与回退
- 增加开关（如 `WORKFORCE_AUTONOMOUS_RECOVERY_MODE`），默认 soft-on（有限恢复）。
- 出现高误判或高失败放大时，可切回“失败即终止”策略，同时保留恢复审计记录。

## Open Questions

- 恢复预算默认值应按任务类别区分还是全局统一？
- 对于权限/凭证类错误，是否允许一次“引导式修复”后再重试，还是直接终止并提示用户？
- recovery 触发的验证命令集合是否需要按 category 提供白名单模板？
- UI 是否需要新增“恢复中/恢复失败原因”独立展示层，还是先复用现有 workflow timeline 展示？
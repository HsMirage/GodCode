## 1. 角色映射与配置治理

- [x] 1.1 在 `src/shared/agent-definitions.ts` 对齐主 Agent 语义映射，明确 Prometheus→fuxi、Sisyphus→haotian、Atlas→kuafu 的 canonical role 元数据。
- [x] 1.2 在 `src/main/services/delegate/category-constants.ts` 补齐主 Agent 到类别策略的约束映射，保证类别委派与角色边界一致。
- [x] 1.3 在绑定校验路径中增加主 Agent 角色策略兼容检查（provider/model/agent/category），冲突时返回可操作诊断信息。
- [x] 1.4 为绑定审计扩展有效角色策略快照字段，确保运行时可回放“角色策略→类别→模型”解析结果。

## 2. 编排阶段所有权与交接契约

- [x] 2.1 在 `src/main/services/delegate/delegate-engine.ts` 增加阶段守卫，强制 plan/dispatch/checkpoint/integration/finalize 的所有权规则。
- [x] 2.2 在 `src/main/services/workforce/workforce-engine.ts` 注入阶段交接校验，要求上游阶段产物引用完整后才可进入下一阶段。
- [x] 2.3 为执行阶段回执定义最小证据结构（objective/changes/validation/residual-risk）并接入集成阶段消费。
- [x] 2.4 在 finalize 前增加证据完整性校验，缺失时阻断并输出 evidence-gap 诊断。

## 3. 主 Agent 提示词对齐

- [x] 3.1 更新 `src/main/services/delegate/prompts/fuxi.ts`，收紧为“面试澄清+计划产出+交接建议”职责，禁止越权执行语义。
- [x] 3.2 更新 `src/main/services/delegate/prompts/haotian.ts`，强化“分解/委派/检查点/集成”主编排职责与阶段化输出。
- [x] 3.3 更新 `src/main/services/delegate/prompts/kuafu.ts`，强化“按计划执行+证据回执+异常回传”职责边界。
- [x] 3.4 对齐三主 Agent 的结构化输出字段，保证 checkpoint/integration 可稳定解析。

## 4. 路由优先级与失败策略

- [x] 4.1 在路由决策中落实优先级 `显式主 Agent > 类别策略 > 模型绑定`，并记录路由依据。
- [x] 4.2 增加主 Agent 显式选择与策略冲突的 fail-fast 路径，返回冲突原因、尝试路径与可选替代。
- [x] 4.3 在严格角色模式下阻断越界行为（如 fuxi 直接执行），并提供标准交接引导。
- [x] 4.4 为受控 override 保留审计信息（actor/reason/scope/expiry），确保异常路径可追踪。

## 5. 测试与回归验证

- [x] 5.1 增加/更新单测：主 Agent canonical 映射、阶段守卫、证据字段校验与绑定冲突诊断。
- [x] 5.2 增加/更新集成测试：复杂任务在 plan→dispatch→checkpoint→integration→finalize 的完整流转。
- [x] 5.3 覆盖显式主 Agent 选择场景：验证路由优先级与角色语义在不同模型配置下的一致性。
- [x] 5.4 运行 `pnpm test` 与关键集成测试集，修复失败并确认无回归。

## 6. 发布与回退控制

- [x] 6.1 增加角色边界严格模式的配置开关，默认采用安全渐进策略。
- [x] 6.2 提供变更说明与用户引导文案，明确三主 Agent 使用边界与推荐路径。
- [x] 6.3 预置回退步骤：出现高频阻断时可回退到软约束模式并保留审计记录。
- [x] 6.4 验证回退后核心链路可用，并记录对比指标（阻断率、成功率、平均交付完整度）。
## 1. 恢复契约与配置接入

- [x] 1.1 在 workforce/delegate 共享类型中定义恢复状态机与错误分类枚举（classify/plan/fix/validate/escalate/abort，transient/config/dependency/implementation/permission/unknown）。
- [x] 1.2 增加自主恢复配置开关与预算策略（总恢复轮次、按错误类别预算、回退策略），并提供默认值与环境变量读取。
- [x] 1.3 为任务与工作流 metadata 扩展 recovery 字段结构（attempt history、selected strategy、terminal diagnostics）。

## 2. Workforce 失败拦截与恢复状态机

- [x] 2.1 在 `workforce-engine` 接入失败拦截入口，失败后进入 classify→plan→fix→validate 分支而非立即终止。
- [x] 2.2 实现可恢复/不可恢复判定：不可恢复直接 fail-fast，输出可操作诊断与 remediation 建议。
- [x] 2.3 实现有界恢复循环：达到预算后进入 unrecovered 终态并停止进一步恢复尝试。
- [x] 2.4 恢复成功后恢复主流程续跑（继续 DAG 调度与后续 checkpoint/integration）。

## 3. Delegate 与路由恢复调度

- [x] 3.1 在 delegate 增加 recovery task 请求上下文（sourceError、failureClass、attemptId、repairObjective）。
- [x] 3.2 在类别策略与路由决策中增加“按失败类别选择 category/subagent/model”的恢复路径规则。
- [x] 3.3 增加无可用恢复路由时的冲突诊断输出（尝试路径、阻断原因、可选替代）。
- [x] 3.4 保持主 Agent 角色边界：恢复调度由 orchestration owner 发起，strict mode 下越界恢复请求需阻断。

## 4. 证据、集成与可观测性

- [x] 4.1 为恢复执行结果强制结构化证据字段（objective/changes/validation/residual-risk）并附 source error 关联。
- [x] 4.2 在 integration/finalize 消费恢复证据：缺失字段产出 evidence-gap，完整时写入 recovery outcome 汇总。
- [x] 4.3 在 workflow observability 输出恢复时间线（每轮策略、验证结果、终态分类、诊断信息）。
- [x] 4.4 确保进程重启后可恢复 in-progress recovery（恢复 phase 与 attempt history 的持久化重建）。

## 5. 测试与回归验证

- [x] 5.1 新增/更新单测：错误分类、恢复预算耗尽、不可恢复 fail-fast、恢复成功续跑。
- [x] 5.2 新增/更新集成测试：任务失败后自动调用修复路径并最终完成 workflow。
- [x] 5.3 覆盖边界场景：无可用恢复路由、strict role mode 越界恢复阻断、重启后恢复续跑。
- [x] 5.4 运行关键测试集并修复回归（workforce/delegate/router/observability 相关测试）。

## 6. 发布控制与文档说明

- [x] 6.1 补充变更说明：自动自愈行为、默认策略、失败终态语义与可观测字段。
- [x] 6.2 提供回退步骤：关闭自动恢复后回到“失败即终止”并保留审计记录。
- [x] 6.3 验证回退后核心链路可用，并记录恢复启用前后完成率/阻断率对比指标。
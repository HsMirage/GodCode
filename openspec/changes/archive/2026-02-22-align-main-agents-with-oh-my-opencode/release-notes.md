## 主 Agent 对齐变更说明（Prometheus/Sisyphus/Atlas ↔ 伏羲/昊天/夸父）

本次变更将参考项目主 Agent 语义对齐到 CodeAll 当前架构，并保持与既有 Delegate/Workforce/Binding 体系兼容。

### 1) 角色与阶段边界

- **伏羲（Prometheus）**：planning 角色，负责需求澄清与计划交接。
- **昊天（Sisyphus）**：orchestration 角色，负责 dispatch/checkpoint/integration/finalize。
- **夸父（Atlas）**：execution 角色，负责执行与结构化证据回执。

严格角色模式下，非 owner 的跨阶段操作会被阻断，并返回可操作诊断。

### 2) 路由与绑定优先级

路由优先级更新为：

`显式主 Agent > 类别策略 > 模型绑定`

当显式主 Agent 与角色策略冲突时，系统 fail-fast，并给出冲突原因与可选替代。

### 3) 结构化证据与集成门禁

执行回执按最小字段集进行校验：

- `objective`
- `changes`
- `validation`
- `residual-risk`

若字段不完整，integration/finalize 前将产生 `evidence-gap` 诊断并阻断无证据完成。

### 4) 运行时审计与可追溯性

- 任务元数据新增 primary role policy 快照。
- runtime binding snapshot 记录角色策略与模型/类别解析结果。
- 生命周期轨迹记录阶段与 stage owner，支持回放分析。

### 5) UI 引导

AgentSelector 文案已对齐主 Agent 语义，帮助用户按“规划→编排→执行”路径选择。

---

## 使用建议（推荐）

- 需求不清晰、需要先定范围：优先选 **伏羲**。
- 多任务拆解与并行推进：优先选 **昊天**。
- 已有计划、需要快速执行与证据回执：优先选 **夸父**。

如遇到角色冲突提示，优先按提示进行角色切换或显式交接，而不是强行越级执行。

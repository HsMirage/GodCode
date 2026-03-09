# GodCode 优化改造执行规划（2026-03-06）

> 依据 `项目规划.md` 的初始目标、当前主项目代码实现状态，以及现有差距文档与闭环文档，制定本轮面向“稳定交付、可维护演进、可观测可恢复”的优化改造执行规划。

---

## 1. 规划背景

GodCode 当前已经完成了多数核心能力的骨架落地：

- 多 Agent / 多 Category / 多模型绑定；
- `Workforce + Delegate` 双执行内核；
- 内嵌浏览器与 AI 自动操控能力；
- 多面板工作台、工作流可视化、任务观测面板；
- 设置中心、密钥管理、审计日志、备份恢复；
- Hook 治理框架、任务续跑基础链路、会话连续性恢复。

但从 `项目规划.md` 的原始目标来看，当前系统仍存在一类典型问题：

1. **功能已具备，但闭环不够完整**：例如 Hook 治理、自动续跑、恢复链、模型路由解释性。
2. **系统已能运行，但演化成本偏高**：多个核心能力集中在超大文件内，维护风险明显。
3. **观测数据已较丰富，但定位问题效率仍可提升**：缺少统一 trace 视角、决策解释与跨层证据链。
4. **规划与实现之间已出现轻微漂移**：个别规划条目仍沿用旧文件名或旧口径，需要收敛到当前真实代码入口。

因此，本轮优化改造的目标不是“新增大量模块”，而是围绕现有架构进行**收敛、拆解、补闭环、补解释、补验收**。

---

## 2. 本轮总目标

### 2.1 核心目标

在不推翻现有主架构的前提下，完成以下五个结果：

1. 将执行内核、恢复链、数据库初始化、任务入口等高风险大模块拆解到可持续维护的规模；
2. 将“会话连续性 / 任务续跑 / 自动恢复”整合为一条清晰主链；
3. 将模型绑定、任务路由、工具权限、Hook 注入、工作流调度这些关键决策做到**可解释、可追踪、可测试**；
4. 将前端工作台从“能展示”提升到“稳定、低竞态、易排障”的状态；
5. 建立“规划条目 -> 代码入口 -> 测试 -> 验收证据”的持续闭环机制。

### 2.2 非目标

本轮不作为优先目标的内容：

- 不以新增大量新 Agent / 新工具为主；
- 不做大规模 UI 重设计；
- 不推翻 `Workforce + Delegate` 双核结构；
- 不重写数据库层为另一套 ORM/持久化方案；
- 不追求一次性完成所有恢复场景的“完美自动恢复”。

---

## 3. 设计原则

### 3.1 保持主架构稳定

保留现有主链：

`IPC -> SmartRouter -> Delegate / Workforce -> LLM / Tools / Hooks -> DB -> Event Bridge -> Renderer`

优化重点是收敛职责与补全闭环，而不是重建架构。

### 3.2 先拆风险点，再补能力点

优先处理超大文件、超重入口、跨层耦合，再处理体验增强项。

### 3.3 每一项优化都必须带验收证据

每个工作流必须绑定：

- 代码改造范围；
- 单元/集成/E2E 验证入口；
- 预期可观察结果；
- 回归风险点。

### 3.4 优先提升解释性和可排障性

一个平台型系统是否成熟，不只看“能不能跑”，更看“为什么这样跑”能否解释清楚。

---

## 4. 当前关键问题总览

### 4.1 架构级问题

- `src/main/services/workforce/workforce-engine.ts` 体积过大，承担分解、DAG、调度、恢复、checkpoint、integration、observability 等过多职责；
- `src/main/ipc/handlers/message.ts` 过度集中，集成了消息持久化、技能解析、流式发送、执行路由、任务续跑联动；
- `src/main/services/database.ts` 既管 embedded-postgres 生命周期，又管 Prisma 启动、schema bootstrap、compat patch；
- `src/main/services/tools/tool-execution.service.ts` 既管权限、作用域、Hook 前后置，也管批量执行和结果收口。

### 4.2 能力闭环问题

- Hook 生命周期治理框架已在，但产品化治理闭环仍不足；
- session continuity、task continuation、auto resume 三条链路存在能力重叠；
- 模型绑定和 fallback 已在，但 UI/日志中的决策解释不足；
- workflow observability 已在，但缺少统一 trace 视角。

### 4.3 前端工作台问题

- `ChatPage`、`SettingsPage`、`TaskPanel` 组件偏大；
- renderer 中仍存在分散的裸 IPC 调用；
- `canvas-lifecycle` 单例能力强，但时序复杂，测试与排障成本高；
- BrowserView 与面板尺寸/显隐同步仍是潜在稳定性风险点。

### 4.4 工程化问题

- 规划、设计、实现、测试文档之间存在少量口径漂移；
- 部分能力已有代码证据，但尚未形成稳定的“验收矩阵”；
- 长稳测试、资源泄漏测试、恢复场景测试还不够系统化。

---

## 5. 优化改造工作流总览

| 优先级 | 工作流 | 目标 | 预估阶段 |
|---|---|---|---|
| P0 | 执行内核拆解 | 降低执行链演化风险 | 第 1-2 阶段 |
| P0 | 恢复链统一 | 打通 continuity / continuation / auto-resume | 第 1-2 阶段 |
| P0 | 前端 BrowserView 稳定性 | 降低工作台高频故障 | 第 1-2 阶段 |
| P0 | 模型路由解释性 | 提升配置与排障透明度 | 第 2 阶段 |
| P1 | Hook 治理闭环 | 从框架升级到治理产品能力 | 第 2-3 阶段 |
| P1 | IPC typed gateway 收敛 | 降低跨层契约漂移 | 第 2-3 阶段 |
| P1 | 工作台大组件拆解 | 降低前端复杂度 | 第 3 阶段 |
| P1 | 数据库 bootstrap 收敛 | 降低 schema 双真相风险 | 第 3 阶段 |
| P2 | 观测与 trace 统一 | 形成跨层排障视图 | 第 3-4 阶段 |
| P2 | 规划-实现-验收矩阵 | 建立长期闭环治理机制 | 全程并行 |

---

## 6. 分阶段执行路线图

### 6.1 阶段 A：P0 稳定性与核心主链收敛（建议 1-2 周）

### A1. 执行入口拆解：`message -> router -> execution`

**目标**

把当前过重的消息入口拆成清晰职责层，降低主链改动的回归风险。

**现状问题**

- `src/main/ipc/handlers/message.ts` 同时负责：
  - 用户消息落库；
  - skill/agent 参数处理；
  - 路由分流；
  - 流式事件发送；
  - assistant message 落库；
  - task continuation / continuity 联动。

**改造目标**

拆为以下层次：

1. `message persistence adapter`
2. `request normalization / runtime context builder`
3. `execution dispatcher`
4. `stream emitter`
5. `assistant response finalizer`

**建议文件落点**

- `src/main/ipc/handlers/message.ts`：仅保留入口编排；
- 新增 `src/main/services/message/` 子目录，承载：
  - `message-execution.service.ts`
  - `message-stream.service.ts`
  - `message-persistence.service.ts`
  - `message-runtime-context.service.ts`

**验收标准**

- 入口 handler 代码体积显著下降；
- 消息执行成功、失败、流式错误、取消四种路径保持现有行为；
- 原有消息链单测 / 集成测试不回退；
- 新增“流式失败但消息链可收口”的测试。

---

### A2. Workforce 执行内核分层拆解

**目标**

保留现有能力不变，显著降低 `workforce-engine` 的认知负担。

**现状问题**

- `src/main/services/workforce/workforce-engine.ts` 过于庞大；
- 任务分解、DAG、调度、公平性、recovery、checkpoint、integration、observability 耦合在同一文件。

**改造目标**

拆分为以下子模块：

1. `workflow-decomposer`
2. `workflow-graph-builder`
3. `workflow-scheduler`
4. `workflow-recovery-controller`
5. `workflow-integration-service`
6. `workflow-observability-writer`

**建议保持不变的对外入口**

- 继续保留 `WorkforceEngine.executeWorkflow()` 作为外部稳定 API；
- 仅调整内部实现委派。

**验收标准**

- 不改变现有 workflow 入口协议；
- `executions`、`assignedModel`、`observability` 输出保持兼容；
- 现有 workflow 单测与集成测试通过；
- 为拆分后模块新增方法级单测。

---

### A3. 恢复链统一：continuity / continuation / auto-resume

**目标**

将当前三套相邻机制整合为一条清晰恢复主链。

**涉及核心文件**

- `src/main/services/session-continuity.service.ts`
- `src/main/services/task-continuation.service.ts`
- `src/main/services/auto-resume-trigger.service.ts`
- `src/main/services/session-state-recovery.service.ts`
- `src/main/services/resume-context-restoration.service.ts`

**现状问题**

- 已有多条恢复能力，但边界略有重叠；
- 用户与开发者都不容易快速回答“当前到底由哪条恢复链生效”。

**改造目标**

统一成三层模型：

1. **Session Recovery**：应用异常退出后的状态恢复；
2. **Task Resumption**：任务倒计时、续跑、恢复执行；
3. **Resume Context Reconstruction**：为 LLM 或 UI 构造恢复上下文。

并明确责任：

- `session-continuity` 负责 crash/session checkpoint；
- `task-continuation` 负责任务续跑策略；
- `resume-context-restoration` 负责上下文重建；
- `auto-resume-trigger` 仅做触发器，不承载业务判定。

**关键改造点**

- 增加统一 `recoverySource` / `resumeReason` 字段；
- 在 task metadata 中记录恢复来源与恢复阶段；
- UI 中能区分“手动恢复 / 自动续跑 / crash 恢复”。

**验收标准**

- 恢复主链流程图可落文档；
- 至少覆盖 4 类恢复测试：
  - 崩溃后恢复
  - 倒计时自动续跑
  - 手动恢复
  - 恢复失败转人工提示

---

### A4. BrowserView 生命周期稳定性专项

**目标**

降低浏览器工作台的高频 UI 故障和残留状态风险。

**涉及文件**

- `src/renderer/src/services/canvas-lifecycle.ts`
- `src/main/services/browser-view.service.ts`
- `src/renderer/src/components/browser/BrowserShell.tsx`
- `src/renderer/src/components/panels/BrowserPanel.tsx`
- `src/renderer/src/components/layout/MainLayout.tsx`

**重点问题**

- BrowserView 显隐与 panel resize / active tab / bounds 更新强耦合；
- 可能存在切换 tab 后旧 view 残留、显示错位、隐藏未清理等风险。

**改造方向**

- 明确 BrowserView 生命周期状态机：`created -> attached -> visible -> hidden -> disposed`；
- 给 `canvas-lifecycle` 增加状态断言与调试日志；
- 给 BrowserView 相关操作补齐一致的 cleanup 路径；
- 增加 renderer/main 双侧测试用例。

**验收标准**

- 面板开关、切换 tab、切换 session、销毁 tab、窗口 resize 五类行为可稳定通过；
- 无已知残留 BrowserView 实例；
- 浏览器相关 E2E 增加稳定性回归用例。

---

### 6.2 阶段 B：P1 产品闭环与跨层契约治理（建议 1-2 周）

### B1. 模型绑定与路由解释性增强

**目标**

让用户和开发者都能看清：为什么本次请求使用了这个模型。

**涉及文件**

- `src/main/services/llm/model-selection.service.ts`
- `src/main/services/router/smart-router.ts`
- `src/main/services/delegate/delegate-engine.ts`
- `src/main/services/workforce/workforce-engine.ts`
- `src/renderer/src/components/panels/TaskPanel.tsx`
- `src/renderer/src/components/workflow/WorkflowView.tsx`

**改造方向**

- 输出统一的 `modelSelectionReason`：
  - `override`
  - `agent-binding`
  - `category-binding`
  - `system-default`
  - `fallback`
- 对 fallback 记录降级原因：
  - missing key
  - invalid protocol
  - model unavailable
  - runtime error fallback
- 前端任务面板和 workflow 节点增加“来源解释”展示。

**验收标准**

- 任意 task / run 都能解释模型来源；
- fallback 路径可在日志或 UI 中追踪；
- 绑定配置错误时，用户可看到更明确的失败原因。

---

### B2. Hook 生命周期治理闭环

**目标**

将当前已有 Hook 框架升级为完整治理系统。

**涉及文件**

- `src/main/services/hooks/index.ts`
- `src/main/services/hooks/manager.ts`
- `src/main/services/hooks/types.ts`
- `src/main/ipc/handlers/setting.ts`
- `src/renderer/src/pages/SettingsPage.tsx`

**改造方向**

- 明确 Hook 配置 schema、优先级、启停状态、作用范围；
- 将 Hook 治理 UI 与持久化设置完全打通；
- 增加 Hook 生效链审计面板：
  - 是否匹配
  - 是否执行
  - 是否超时
  - 是否熔断
  - 是否影响结果

**验收标准**

- 可以在设置界面独立启停/调整默认 Hook；
- Hook 状态重启后可恢复；
- Hook 审计链路能辅助定位问题；
- 默认 Hook 关键路径均有单测覆盖。

---

### B3. IPC Typed Gateway 收敛

**目标**

降低 renderer 到 main 的裸调用分散度，收敛跨进程契约。

**涉及文件**

- `src/preload/api.ts`
- `src/shared/ipc-channels.ts`
- `src/renderer/src/api.ts`
- `src/renderer/src/pages/*`
- `src/renderer/src/components/**/*`

**改造方向**

- 建立 renderer 统一 API 分域封装：
  - `messageApi`
  - `sessionApi`
  - `workflowApi`
  - `browserApi`
  - `settingsApi`
- 收敛页面直接 `window.godcode.invoke(...)` 的调用；
- 对关键 IPC 返回结构补显式类型定义。

**验收标准**

- 高价值页面基本不再直接裸调 IPC；
- 主要 invoke 通道有明确返回类型；
- IPC 对齐测试继续保留并增强。

---

### B4. 工作台大组件拆解

**目标**

降低前端复杂页面的维护负担。

**优先拆分对象**

- `src/renderer/src/pages/ChatPage.tsx`
- `src/renderer/src/pages/SettingsPage.tsx`
- `src/renderer/src/components/panels/TaskPanel.tsx`

**拆分原则**

- 页面保留编排职责；
- 数据加载下沉到 hooks / services；
- 展示组件无副作用；
- 订阅逻辑集中管理。

**验收标准**

- 页面主组件长度明显下降；
- 逻辑分层更清晰；
- renderer 单测可更细粒度覆盖。

---

### 6.3 阶段 C：P1/P2 工程化与中长期治理（建议 1-2 周）

### C1. 数据库初始化与 schema patch 收敛

**目标**

降低数据库 bootstrap 的长期维护风险。

**涉及文件**

- `src/main/services/database.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`

**问题**

- 当前兼容策略务实有效，但 raw SQL patch 与 Prisma migration 并行存在；
- 长期可能出现 schema 双真相源问题。

**改造方向**

- 给 boot-time patch 建立清单与版本边界；
- 区分“正式迁移”和“启动兼容补丁”；
- 为兼容逻辑补专项测试；
- 逐步把可固化的 patch 回收到 migration 体系。

**验收标准**

- 数据库启动逻辑对维护者更易理解；
- 历史 schema 补丁有明确来源与退出条件；
- 升级/回滚路径更清晰。

---

### C2. 统一 trace 与可观测性视图

**目标**

让问题排查从“看日志猜”升级成“按 trace 定位”。

**改造方向**

- 为一次用户请求引入统一 `traceId`；
- 贯穿：
  - message
  - router decision
  - delegate / workforce
  - task / run
  - tool execution
  - event bridge
  - renderer panels
- 将现有 observability 数据升级为 trace-first 组织方式。

**验收标准**

- 一次复杂任务可以从 UI 反查到完整执行链；
- 调试时能回答：
  - 谁分解了任务；
  - 谁选了模型；
  - 哪个工具失败；
  - 为什么进入 fallback / recovery。

---

### C3. 规划-实现-测试-验收矩阵常态化

**目标**

解决“文档说一套，代码已经演进到另一套”的长期问题。

**建议产物**

- `规划条目矩阵`：每条规划映射到代码入口、测试入口、当前状态；
- `验收证据矩阵`：每个能力项绑定可重复验证命令；
- `优化改造追踪表`：每项优化的状态、风险、负责人、完成证据。

**验收标准**

- 后续任何能力变更都能更新到矩阵；
- 文档对齐不再依赖一次性人工扫全仓库；
- 项目阶段性验收更具可持续性。

---

## 7. 详细工作包拆分

### 7.1 工作包 WP-01：消息执行主链收敛

**目标**：拆解 `message` handler，形成稳定消息执行服务。

**输入**

- 当前 `src/main/ipc/handlers/message.ts`
- 相关事件通道
- 当前消息测试链路

**输出**

- `message` 子服务目录
- 更清晰的流式执行边界
- 新增回归测试

**依赖**

- 不依赖其它工作包，可先行。

**风险**

- 流式消息链路最容易出现兼容性回退。

---

### 7.2 工作包 WP-02：Workforce 模块分层

**目标**：将 `workforce-engine` 改造成薄 orchestrator + 多子服务。

**输入**

- 当前 workflow 单测、集成测试
- observability 输出结构

**输出**

- scheduler / decomposer / recovery / integration 子模块
- 更易测的内部 API

**依赖**

- 建议在 WP-01 之后开始，避免同时改动最核心两条主链。

---

### 7.3 工作包 WP-03：恢复链统一

**目标**：统一恢复状态、触发来源、恢复策略。

**输出**

- 统一恢复主链文档
- 更清晰的 metadata 字段
- 自动续跑与 crash 恢复协同测试

**依赖**

- 可与 WP-02 并行，但最终要与 workflow 侧协同验证。

---

### 7.4 工作包 WP-04：BrowserView 稳定性专项

**目标**：保障工作台浏览器相关高频操作稳定。

**输出**

- BrowserView 生命周期断言
- 更多浏览器 E2E
- 泄漏 / 残留排查日志

---

### 7.5 工作包 WP-05：模型选择解释性增强

**目标**：为模型命中与 fallback 建立统一说明。

**输出**

- 模型选择来源字段
- UI 解释展示
- fallback 原因日志

---

### 7.6 工作包 WP-06：Hook 治理产品化

**目标**：将 Hook 从框架升级为治理能力。

**输出**

- 配置闭环
- 审计闭环
- UI 治理闭环

---

### 7.7 工作包 WP-07：IPC Gateway 与前端大组件治理

**目标**：收敛跨进程调用方式，降低前端复杂度。

**输出**

- typed API 分域封装
- 页面/面板主组件拆分
- 更细粒度组件单测

---

### 7.8 工作包 WP-08：数据库 bootstrap 收敛与证据矩阵

**目标**：降低数据库维护风险，并建立长期验收矩阵。

**输出**

- schema patch 清单
- migration 对齐说明
- 规划-实现-验收映射矩阵

---

## 8. 推荐实施顺序

### 第一批（立即开始）

1. `WP-01 消息执行主链收敛`
2. `WP-02 Workforce 模块分层`
3. `WP-04 BrowserView 稳定性专项`

### 第二批（第一批基本稳定后）

4. `WP-03 恢复链统一`
5. `WP-05 模型选择解释性增强`
6. `WP-06 Hook 治理产品化`

### 第三批（面向中期维护）

7. `WP-07 IPC Gateway 与前端大组件治理`
8. `WP-08 数据库 bootstrap 收敛与证据矩阵`

---

## 9. 建议里程碑

### M1：执行主链可维护化

**完成标志**

- `message handler` 与 `workforce-engine` 均完成第一轮结构拆解；
- 行为与现有测试保持兼容；
- 不新增关键回归。

### M2：恢复与浏览器工作台稳定化

**完成标志**

- 恢复链边界清晰；
- BrowserView 高风险路径稳定；
- 关键 E2E 场景通过。

### M3：治理与解释性增强

**完成标志**

- Hook 治理闭环形成；
- 模型选择来源可解释；
- IPC gateway 收敛显著。

### M4：工程证据闭环

**完成标志**

- 规划-实现-测试-验收矩阵建立；
- 关键能力均有证据路径；
- 项目进入长期可维护阶段。

---

## 10. 验收指标建议

### 10.1 结构指标

- 超大文件数量下降；
- 核心入口平均职责数下降；
- workflow / message / recovery 相关模块的单测颗粒度提升。

### 10.2 稳定性指标

- 浏览器工作台高频操作无已知残留实例；
- 恢复链在典型场景下行为可预测；
- 复杂任务执行路径回归率可控。

### 10.3 可解释性指标

- 任一任务都能回答：
  - 为什么进入当前路由；
  - 为什么选择当前模型；
  - 为什么触发恢复或 fallback；
  - 哪个工具或 Hook 影响了结果。

### 10.4 工程指标

- 关键能力具备测试与文档证据；
- 文档中的模块入口与代码实际入口一致；
- 后续需求迭代时不再需要先大规模“考古”。

---

## 11. 风险与应对策略

| 风险 | 说明 | 应对策略 |
|---|---|---|
| 主链重构引发回归 | `message` / `workforce` 是系统核心 | 先拆内部、保留外部 API，不一次性改协议 |
| 恢复链改造引入语义冲突 | continuity / continuation 已有历史逻辑 | 先建统一状态模型，再逐步收口 |
| BrowserView 问题难复现 | 与窗口状态、平台环境相关 | 增强日志、补 E2E、增加状态断言 |
| 文档与实现再次漂移 | 后续演进速度快 | 将矩阵更新纳入每次阶段验收 |
| Hook/Tool/LLM 联动调试复杂 | 多层都可能影响结果 | 引入 traceId 与阶段性审计输出 |

---

## 12. 推荐执行策略

### 12.1 策略一：小步快跑，先稳再深

- 先做不改变对外协议的内部拆解；
- 每完成一项，就补对应测试与文档；
- 不建议多个核心主链同时做大改。

### 12.2 策略二：每个工作包都必须自带证据

每个工作包至少交付：

- 改造说明；
- 涉及文件清单；
- 回归测试列表；
- 验收结果摘要。

### 12.3 策略三：优先围绕真实高频场景优化

优先保障：

1. 用户发送复杂任务；
2. workflow 并发执行；
3. 浏览器工作台操作；
4. 应用异常退出后的恢复；
5. 设置变更后的模型绑定与权限模板生效。

---

## 13. 建议的首批落地任务

### Task A

拆解 `src/main/ipc/handlers/message.ts`，形成消息执行服务子目录。

### Task B

对 `src/main/services/workforce/workforce-engine.ts` 做第一轮“只拆不改协议”的模块化整理。

### Task C

为 `canvas-lifecycle + browser-view.service` 建立生命周期状态机与专项回归测试。

### Task D

梳理 `session-continuity / task-continuation / auto-resume-trigger` 的统一状态与职责边界文档。

### Task E

给 `model-selection.service` 增加决策原因字段，并在 `TaskPanel / WorkflowView` 中展示。

---

## 14. 结语

从 `项目规划.md` 的视角看，GodCode 当前已经过了“从 0 到 1”的阶段，下一步应进入“从可用到可持续”的阶段。

本轮优化改造的核心不是再证明系统能工作，而是让系统：

- 更容易维护；
- 更容易恢复；
- 更容易解释；
- 更容易验证；
- 更适合继续扩展。

当以上五点完成后，GodCode 才真正从“功能齐备的实验平台”迈向“可长期演进的产品级工作台”。

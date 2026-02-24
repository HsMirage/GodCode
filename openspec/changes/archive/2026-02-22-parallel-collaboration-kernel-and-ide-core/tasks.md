## 1. 协同内核基础重构

- [x] 1.1 将 workforce 执行流拆分为 Planner/Graph、Scheduler/Allocator、Context Bus、Integrator 四层接口与实现骨架
- [x] 1.2 为工作流图增加结构化持久化模型（workflow/node/edge）并完成与现有 Task/Run 的兼容映射
- [x] 1.3 在工作流启动前实现 DAG 预校验（循环依赖/不可调度检测）并输出可诊断错误
- [x] 1.4 引入分阶段执行状态机（plan/dispatch/checkpoint/integration/finalize）并记录状态迁移
- [x] 1.5 替换最终结果拼接逻辑，接入集成阶段输出结构化汇总与冲突标记

## 2. 共享上下文与协作记忆

- [x] 2.1 定义 workflow 级共享上下文数据结构（facts/decisions/constraints/artifacts/dependencies）
- [x] 2.2 实现任务完成后上下文归档与来源追踪（taskId/runId 关联）
- [x] 2.3 实现角色感知的上下文注入策略（按 role/category 过滤）
- [x] 2.4 为上下文查询提供按 workflow/task/category 的检索接口
- [x] 2.5 增加上下文保留与归档策略（过期处理与审计元数据保留）

## 3. 模型感知路由与资源分配

- [x] 3.1 将 smart-router 从规则匹配扩展为可评分路由决策（复杂度/能力/显式指令）
- [x] 3.2 在调度器引入 concurrency key（provider/model/role）与配额配置
- [x] 3.3 实现跨 workflow 的公平排队策略并验证无饥饿
- [x] 3.4 实现模型不可用时的确定性 fallback 链路与决策记录
- [x] 3.5 增加 strict binding 模式下的快速失败与配置修复提示

## 4. 可观测性、重试与恢复一致性

- [x] 4.1 为 workflow/task/run 建立统一关联 ID 与时间线事件模型
- [x] 4.2 将重试状态持久化（计数、分类、预算）并在重启后可恢复
- [x] 4.3 完善失败分类与退避策略映射（按错误类别应用）
- [x] 4.4 打通 session/workflow continuation 状态接口并确保前端可消费一致快照
- [x] 4.5 为关键链路补充可观测查询接口（timeline、assignedModel、integration result）

## 5. IDE 核心编辑与执行闭环

- [x] 5.1 在工作台接入内置代码编辑能力（打开/编辑/保存）并限制在 workspace 边界
- [x] 5.2 实现外部修改冲突检测与合并/重载交互策略
- [x] 5.3 新增终端与后台任务中心面板（运行状态、增量输出、取消操作）
- [x] 5.4 打通 workflow 节点、agent 活动、artifact、run log 的双向跳转
- [x] 5.5 增加高频事件节流与增量渲染优化，保障多面板联动性能

## 6. 内嵌浏览器与 AI 自动化治理

- [x] 6.1 统一 BrowserView 生命周期与面板状态同步（打开/切换/隐藏/关闭）
- [x] 6.2 为 AI browser 工具增加输入校验与标准错误结构
- [x] 6.3 记录 AI 浏览器操作审计元数据并在 UI 展示可追踪历史
- [x] 6.4 支持 AI 到用户手动接管的无缝切换并保留页面上下文

## 7. 模型与配置治理

- [x] 7.1 在执行前增加 provider/model/agent/category 绑定一致性校验
- [x] 7.2 增加绑定配置错误的可操作诊断信息与修复建议
- [x] 7.3 强化 API Key 展示策略（默认掩码、显式展示控制）并验证安全存储路径
- [x] 7.4 记录模型绑定与配置变更审计日志并支持查询
- [x] 7.5 在任务运行详情中展示执行时生效的绑定快照

## 8. IPC 合同与端到端验收

- [x] 8.1 对齐 shared channels、main 注册、preload allowlist、renderer 调用，消除合同漂移
- [x] 8.2 为协同内核与 IDE 核心新增单元/集成测试（调度、恢复、日志、编辑、终端、浏览器）
- [x] 8.3 建立对照《项目规划.md》的验收清单并逐项验证
- [x] 8.4 执行回归测试并形成风险清单与回滚验证记录

### 8.3 验收清单（对照《项目规划.md》）

- [x] 多 Agent 协同（不同模型驱动）与并行调度能力可用（Workforce/Delegate 路径已覆盖）
- [x] IDE 核心闭环可用（任务面板、后台任务、浏览器面板、跨视图跳转链路）
- [x] 模型绑定与配置治理可用（绑定一致性、审计查询与导出、运行期快照可见）
- [x] IPC 关键合同无漂移（shared/main/preload/renderer 对齐并有自动化测试守护）
- [x] 对《项目规划.md》中的“单元测试、集成测试、性能稳定性关注点”完成本轮可执行验证

### 8.4 回归测试、风险清单与回滚验证记录（2026-02-21）

- 回归命令：
  - `pnpm vitest run tests/unit/ipc/ipc-alignment.test.ts tests/unit/ipc/audit-log-ipc.test.ts tests/unit/ipc/binding-ipc.test.ts tests/unit/ipc/background-task-ipc.test.ts tests/unit/ipc/artifact-file-write-ipc.test.ts tests/unit/services/workforce/workforce-engine.test.ts tests/unit/services/workforce/worker-dispatcher.test.ts tests/unit/renderer/task-panel-performance.test.tsx tests/unit/renderer/trace-navigation.test.tsx tests/unit/renderer/browser-panel-lifecycle.test.ts tests/integration/browser-tools.test.ts`
- 回归结果：11 个测试文件、104 个测试全部通过。

- 风险清单：
  1. **中风险**：`preload` allowlist 持续扩展，若后续新增通道未同步 `shared/main/preload/renderer`，会出现调用漂移。
  2. **中风险**：运行绑定快照依赖 `workflow-observability:get` + `task:list` 的映射，一旦后续任务元数据结构变更，UI 展示可能缺失。
  3. **低风险**：浏览器工具集成测试存在预期重试错误日志，虽不影响通过，但易在人工巡检中造成误判。

- 回滚验证记录：
  1. 本轮新增能力集中在 `workforce-engine`、`TaskPanel`、`preload`、`shims`、IPC 对齐测试与相关单测，边界清晰。
  2. 回滚策略为“按文件路径回滚本轮增量 + 重跑同一回归命令”。
  3. 回滚验收标准：上述 11 文件回归恢复全绿，且任务面板在无快照时保持原有行为。

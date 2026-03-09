# 《项目规划.md》完善设计（进度差距闭环版）

- 日期：2026-02-19
- 目标文件：`/Users/mirage/AI/AiWork/GodCode/项目规划.md`
- 设计状态：已与用户逐节确认（骨架、判定口径、缺口分层、风险与验收）

## 1. 背景与目标

当前 `项目规划.md` 已包含完整需求定义与 agent/category 对照信息，但“**当前完成度**、**关键缺口优先级**、**下一步执行闭环**”尚未形成统一、可评审、可追踪结构。

本次设计目标是：

1. 在不破坏原始需求描述的前提下，补齐“进度差距闭环”。
2. 将“结论”与“证据”分离：正文简洁、附录可审计。
3. 为后续执行计划提供可直接落地的 P0/P1/P2 优先级基线。

## 2. 非目标（明确不做）

1. 不重写原始需求条款，不改变项目愿景与技术路线描述。
2. 不在本设计阶段改动实现代码或测试代码。
3. 不在正文堆叠大量 file:line 细节（统一放附录）。

## 3. 方案比较与选型

### 方案 A（已选）
**保留原文 + 新增闭环章节**

- 做法：保留现有需求与对照表，新增“当前进度与闭环”+“附录证据”。
- 优点：对历史文档最友好、风险低、可快速进入执行阶段。
- 缺点：文档总长度会增加。

### 方案 B
**全文重排为需求对照矩阵**

- 做法：将全文改造成“需求条款→状态→行动→证据”矩阵。
- 优点：评审效率高。
- 缺点：结构变化大，历史可读性下降，变更风险高。

### 方案 C
**最小增补**

- 做法：只在末尾追加简短进度段落。
- 优点：改动最小。
- 缺点：闭环与可追踪性不足。

> 选型结论：采用 **方案 A**（用户确认）。

## 4. 目标文档结构（将写入 `项目规划.md`）

在保留现有内容不动的前提下，新增以下结构：

## 当前进度与闭环（2026-02-19）
1. 当前进度总览（已完成 / 部分完成 / 未完成）
2. 关键缺口 Top 8（按优先级）
3. 下一步里程碑（P0 / P1 / P2）
4. 风险与外部依赖
5. 验收口径（更新版）

## 附录A：进度证据（file:line）
- 正文仅保留结论与行动
- 证据统一归档到附录A
- 每个关键结论附 1-3 条源码定位

## 附录B：本次更新变更日志
- 记录本次新增章节与主要修订点

## 5. 状态判定与证据规则

### 5.1 状态判定规则
- **已完成**：有可运行入口，且关键路径可验证（执行链路或测试覆盖）。
- **部分完成**：有核心实现，但缺少交付闭环项（如交付形态、报告化、UI完整度）。
- **未完成**：缺少核心实现入口，或无法形成可验收证据链。

### 5.2 证据组织规则
- 正文只写结论与下一步动作。
- 所有源码证据统一放入“附录A”。
- 证据采用 `file:line` 格式，保持可定位性。

## 6. 关键缺口与里程碑分层（已确认）

### P0
1. openclaw 核心能力“完整移植”缺少模块映射/入口/测试的证据链。

### P1
3. Hook 治理存在双实现，需收敛统一。
4. Agent 产物多格式统一可视化不足（图像/结构化展示）。
5. 测试结果缺少报告化与门禁化输出。

### P2
6. 工作台多视图并行能力可继续增强（复杂任务操作密度）。
7. 任务续跑策略与可观测指标需进一步标准化。
8. 阶段性交付物可追踪性不足（阶段验收资产）。

### 里程碑原则
- **P0**：先补齐交付硬缺口。
- **P1**：提升可维护性与评审可审计性。
- **P2**：体验与治理增强。

## 7. 风险与验收口径（已确认）

### 7.1 风险与外部依赖
- 外部模型服务可用性波动影响协同稳定性。
- 多 Provider 凭据差异导致回退路径复杂。
- 参考项目能力迁移存在语义差异与回归风险。

### 7.2 验收口径（更新版）
- 架构：可触发 workforce DAG 拆解，且至少两条子任务使用不同 `assignedModel`。
- 功能：浏览器自动化可执行“导航→操作→提取”全链路。
- 工作台：可视化展示任务状态、依赖关系、模型分配。
- 接入：可完成 OpenAI-compatible 配置、模型管理、密钥安全存储与调用。
- 交付：至少包含 Windows 安装包与 Linux 远程网页版入口说明。
- 测试：具备 unit/integration/performance 结果，并有可审计报告输出。

## 8. 证据来源（本次设计依赖的关键代码锚点）

> 这些锚点用于后续写入 `项目规划.md` 的附录A，正文不展开。

- DAG 与并发：
  - `src/main/services/workforce/workforce-engine.ts:150`
  - `src/main/services/workforce/workforce-engine.ts:1066`
  - `src/main/services/workforce/workforce-engine.ts:2767`
  - `src/main/services/workforce/workforce-engine.ts:2926`
- 多模型解析与绑定：
  - `src/main/services/delegate/delegate-engine.ts:195`
  - `src/main/services/delegate/delegate-engine.ts:239`
- 浏览器自动化：
  - `src/main/services/ai-browser/tools/navigation.ts:105`
  - `src/main/services/ai-browser/tools/input.ts:93`
  - `src/main/services/ai-browser/tools/snapshot.ts:141`
- 工作台与任务追踪：
  - `src/renderer/src/components/workflow/WorkflowView.tsx:120`
  - `src/renderer/src/components/workflow/WorkflowView.tsx:229`
  - `src/renderer/src/components/panels/TaskPanel.tsx:103`
- 模型与绑定管理：
  - `src/renderer/src/components/settings/ProviderModelPanel.tsx:130`
  - `src/renderer/src/components/settings/AgentBindingPanel.tsx:173`

## 9. 设计验收清单（进入实施前）

- [x] 骨架结构获批
- [x] 状态判定规则获批
- [x] Top8 缺口与 P0/P1/P2 分层获批
- [x] 风险与验收口径获批
- [ ] 进入实施计划编写（下一步：`superpowers:writing-plans`）

## 10. 后续动作

本设计已完成，下一步应基于本设计生成“逐步实施计划”，再执行对 `项目规划.md` 的实际更新。
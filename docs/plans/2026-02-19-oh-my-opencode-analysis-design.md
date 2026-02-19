# oh-my-opencode 源码分析设计文档（方案 A）

- 日期：2026-02-19
- 目标：为“oh-my-opencode 源码分析项目”提供可执行、可复核的设计基线
- 分析对象：`参考项目/oh-my-opencode`
- 设计状态：已与用户逐节确认（Section 1~5）

---

## 1. 背景与目标

当前项目对“多 Agent 协同（且不同 Agent 由不同 LLM 模型驱动）”的实现诉求较高，但尚缺一份系统化、可追踪的源码分析资产，特别是：

1. Prompt 模板全貌与数量边界；
2. Prompt 在系统中的创建、加工、注入、调度、消费链路；
3. Skills 机制从发现到执行的闭环；
4. Agent team 在编排层面的控制逻辑与状态流转。

本设计的目标是交付一套“主文档 + 子文档 + 图谱”的分析资产，作为后续能力对齐、架构迁移与机制复用的基础数据。

---

## 2. 范围与边界（已确认）

### 2.1 分析范围

采用**核心代码优先**：

- 主范围：`src/**`
- 辅助证据：`docs/**` 与关键 `tests/**`（用于验证运行逻辑与机制说明）

### 2.2 非目标

1. 不做全仓库穷举式“逐文件百科”输出（避免噪声过高）；
2. 暂不产出 Prompt 中文翻译文件（用户确认“可忽略翻译要求”）；
3. 不在本阶段做实现改造，仅产出分析资产与结构化结论。

---

## 3. 方案比较与选型（已确认）

### 方案 A（已选）
**核心代码精析（`src/**` 主体）**

- 输出：主文档 + 模块索引 + Prompt 调用图 + Skills 机制 + 编排流程图
- 优点：深度与可交付性平衡最佳；直接对齐“多 Agent 协同机制”目标
- 代价：非核心目录采用摘要级覆盖

### 方案 B
**代码+测试双轨精析（`src/** + tests/**`）**

- 优点：验证证据更强
- 缺点：体量显著增大，交付节奏变慢

### 方案 C
**全仓库穷尽扫描**

- 优点：覆盖最全
- 缺点：噪声高、主线信息被稀释

> 结论：采用 **方案 A**。

---

## 4. 交付结构设计（已确认）

分析产物目录：`参考项目/oh-my-opencode-analysis/`

1. `README.md`：总览与导航
2. `01-source-index.md`：源码索引（按模块）
3. `02-prompt-inventory-and-callgraph.md`：Prompt 资产清单与调用关系
4. `03-skills-mechanism.md`：Skills 机制深析
5. `04-agent-team-orchestration.md`：多 Agent 编排过程
6. `05-information-flow.md`：信息流/控制流/状态流总览
7. `diagrams/*.mmd`：Mermaid 图源文件

---

## 5. 分析方法与判定标准（已确认）

### 5.1 方法论：五层拆解 + 证据回链

1. Prompt 资产层（定义、模板来源）
2. 编排控制层（路由决策、并行与重试）
3. 执行载体层（task/background/delegate/tmux）
4. Skill 机制层（发现、解析、注入、执行）
5. 状态与恢复层（session/todo/resume/hook）

### 5.2 文件索引标准（`01-source-index.md`）

每个文件条目包含：

- 相对路径
- 文件职责
- 关键导出（函数/类型/常量）
- 公共变量与状态对象
- Prompt 触点（创建/加工/注入/发送/消费）
- 上下游调用关系
- 协同标签（planner/orchestrator/worker/skill/hook/transport）

### 5.3 Prompt 调用关系判定（`02-*.md`）

统一边类型：

- `define`：定义
- `compose`：加工/拼接
- `inject`：注入（hook/skill/config）
- `route`：路由（agent/model/category）
- `dispatch`：派发（task/subagent/background）
- `consume`：最终消费（模型调用前后）

### 5.4 验收口径

1. 核心源码索引可检索；
2. Prompt 模板可计数、可分类；
3. 关键 Prompt 链路可追踪；
4. Skill 工作流闭环清晰；
5. 至少 1 条端到端协同链路可复盘。

---

## 6. 总体文档内结构与图谱设计（已确认）

### 6.1 主文档 `README.md`

- 分析目标与范围
- 快速结论
- 文档导航
- 关键图谱入口
- 证据复核说明

### 6.2 子文档职责

- `01`：代码索引与职责地图
- `02`：Prompt 资产、数量与调用图
- `03`：Skill 机制与运行流水线
- `04`：多 Agent/多模型协同与调度逻辑
- `05`：输入到输出的信息流、控制流、状态流

### 6.3 图谱清单（`diagrams/*.mmd`）

1. `prompt-asset-map.mmd`
2. `prompt-lifecycle-sequence.mmd`
3. `skill-execution-pipeline.mmd`
4. `agent-orchestration-sequence.mmd`
5. `model-routing-decision-tree.mmd`
6. `resilience-loop.mmd`

### 6.4 引用规范

- 源码定位：`relative/path.ts:line`
- 调用关系：`A --[edge_type]--> B`
- 每个关键结论附 1~2 条源码证据

---

## 7. 执行与质量控制（已确认）

### 7.1 执行波次

1. Wave-0：模块地图与分析优先级
2. Wave-1：Prompt 资产抽取
3. Wave-2：Prompt 调用关系建图
4. Wave-3：Skills 机制深挖
5. Wave-4：多 Agent 编排复盘
6. Wave-5：文档总装与一致性校验

### 7.2 Quality Gates

- 证据门禁：关键结论必须有源码锚点
- 链路门禁：关键 Prompt 至少 3 跳可追踪
- 机制门禁：Skill/Orchestration 各有完整闭环
- 可复核门禁：引用可跳转、可定位

### 7.3 风险与应对

1. 体量风险：主文档聚焦结论、子文档承载细节
2. 动态链路风险：区分显式边与推断边
3. 覆盖冲突风险：标注优先级与最终生效点

---

## 8. 里程碑与完成定义（已确认）

### 8.1 里程碑

- M1：代码地图与索引骨架完成
- M2：Prompt 资产与调用关系完成
- M3：Skills 机制闭环完成
- M4：多 Agent 编排复盘完成
- M5：总装与一致性校验完成

### 8.2 完成定义（DoD）

1. `src/**` 核心索引完整；
2. Prompt 模板与生成点清单完整；
3. 关系图支持关键链路追踪；
4. Skills 机制具备端到端闭环说明；
5. 编排逻辑可端到端复盘；
6. 关键结论均含源码证据。

---

## 9. 下一步

本设计文档已完成并获用户确认。

下一步按流程进入 `superpowers:writing-plans`，生成实施计划（execution plan），再进入实际分析产物编写阶段。

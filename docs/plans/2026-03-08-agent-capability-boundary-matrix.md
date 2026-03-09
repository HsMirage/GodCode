# Agent / Category 能力边界矩阵（2026-03-08）

> 对应任务：P0-3 建立 Agent 任务能力边界矩阵

## Agent 矩阵

| Agent | 默认角色 | 默认策略 | 风险 | 适合任务 | 不适合任务 |
|---|---|---|---|---|---|
| `fuxi` | planning | workforce | high | 需求澄清、任务规划、实施路线设计 | 大规模直接改码、高频工具执行 |
| `haotian` | orchestration | workforce | high | 复杂任务编排、多子任务协调、进度与风险控制 | 纯只读调研、简单单点修改 |
| `kuafu` | execution | workforce | high | 多步骤执行推进、长链路任务推进 | 纯架构咨询、单文件微改 |
| `luban` | primary | direct-enhanced | high | 代码实现、修复问题、浏览器辅助执行 | 高层规划评审、纯只读审计 |
| `baize` | subagent | direct-enhanced | low | 架构审查、风险评审、调试分析 | 直接写代码、危险工具执行 |
| `chongming` | subagent | direct-enhanced | low | 需求消歧、前置分析、任务预审 | 直接落地实现、批量文件修改 |
| `leigong` | subagent | direct-enhanced | low | 计划评审、验收口径检查 | 编码实现、浏览器/终端操作 |
| `diting` | subagent | direct-enhanced | medium | 外部资料检索、开源实现对比、文档调研 | 本地代码改动、高风险本地执行 |
| `qianliyan` | subagent | direct-enhanced | low | 仓库探索、代码检索、上下文收集 | 直接写代码、外部网页主动交互 |
| `multimodal-looker` | subagent | direct-enhanced | low | 图片/PDF/图表解析 | 代码改动、终端执行 |

## Category 矩阵

| Category | 默认策略 | 风险 | 适合任务 | 不适合任务 |
|---|---|---|---|---|
| `zhinv` | direct-enhanced | low | 前端/UI 改动、样式与交互优化 | 后端编排、高风险 shell |
| `cangjie` | direct-enhanced | low | 文档编写、说明补全 | 复杂系统编排、浏览器高风险交互 |
| `tianbing` | direct-enhanced | low | 单文件微改、小修小补 | 跨模块重构、长链路任务 |
| `guigu` | direct-enhanced | low | 复杂推理、分析决策 | 批量危险写入 |
| `maliang` | direct-enhanced | low | 创意内容、文案表达 | 严格工程验收任务 |
| `guixu` | direct-enhanced | low | 深度任务、持续推理实现 | 低复杂度快修 |
| `tudi` | direct-enhanced | low | 通用轻量任务 | 跨模块高复杂度编排 |
| `dayu` | direct-enhanced | medium | 高复杂度实现、跨模块任务 | 纯只读分析 |

## 落点

- 共享矩阵定义：`src/shared/agent-capability-matrix.ts`
- 路由理由接入：`src/main/services/router/smart-router.ts`
- UI 边界解释：`src/renderer/src/components/panels/TaskDetailDrawer.tsx`

